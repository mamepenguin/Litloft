# Write the scene and image-description embeddings the workers already compute

SPEC-ID: SPEC-ADDON-034
SPEC-ID: SPEC-ADDON-035

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

This is a bug fix in the intelligence addon. `embed_passages` returns a numpy array, and
two workers test its result with `if not vectors:`. For an array of one row that expression
raises `ValueError` ("truth value of an array ... is ambiguous"), so neither worker has
ever written its embedding:

- `app/workers/video_visual.py` `_embed_scene`: no `video_visual_scene` embedding exists, so
  `GET /search/scenes` (and the MCP `search_video_scenes`) returns nothing in practice.
- `app/workers/vision.py` `_embed_and_store`: no `vision_description` embedding exists, so an
  image's AI description, documented as "used for search", never reaches vector search.

Existing tests stub `embed_passages` with Python lists, which hid it.

- SPEC-ADDON-034: both workers test the embedder's result by its length, so a non-empty
  result is stored.
- SPEC-ADDON-035: a one-time backfill at addon startup embeds the stored text of scenes and
  image descriptions that have no embedding, without calling any LLM.

## Required items

### 1. Normal flow

**SPEC-ADDON-034**

1. `_embed_scene` and `_embed_and_store` call `embed_passages([text])` as today.
2. A result that is `None` or has zero rows is treated as "nothing to store" (return, as
   today). Any other result has its first row stored exactly as the code after the check
   already does: the `embeddings` row and the `vec_text` row with the existing id scheme,
   embedding type, timestamps and `content_preview`.

**SPEC-ADDON-035**

1. After startup, a background task runs once, after the startup purge of policy-off
   drives.
2. Scenes: for every scene of an active Visual Index run of an active file whose
   `scene_label` and `visible_text` joined with a space (as `_embed_scene` joins them) are
   non-empty, and that has no `embeddings` row of type `video_visual_scene` whose id starts
   with `vvs_<scene_id>_`, it calls `_embed_scene` with the stored values. Skipped when
   `features.video_visual_index` is `"false"`, and per drive when that drive's
   `video_visual_index` policy is off or cannot be read (fail-closed).
3. Image descriptions: for every active file with a non-empty
   `file_summaries.visual_description` and no `embeddings` row of type
   `vision_description`, it calls `_embed_and_store(file_id, description)`. Skipped when
   `features.vision_describe` is `"false"`, and per drive when that drive's
   `vision_describe` policy is off or cannot be read (fail-closed).
4. Each item is embedded and committed on its own; an item that fails is logged and
   skipped, and the pass continues. The pass logs one info line with the counts embedded
   and skipped per kind.
5. The work runs off the event loop (`asyncio.to_thread`), in batches of at most 100 items
   between which the task yields.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Worker | the embedder raises | logged warning, nothing stored, as today |
| Worker | the embedder returns no rows | nothing stored, as today |
| Worker | the `vec_text` insert fails | as today: warning; the `embeddings` row is still committed |
| Backfill | the embedder is unavailable | the pass logs a warning and stops; the next startup tries again |
| Backfill | one item fails | logged, skipped, the pass continues; the next startup tries it again |
| Backfill | a policy lookup fails | that drive is skipped for the pass (fail-closed) |
| Backfill | the addon stops mid-pass | items already committed stay; the rest run at the next startup |

### 3. States

A scene or description is "embedded" (has its embedding row) or "not embedded". The worker
fix makes new ones embedded; the backfill moves existing ones from not embedded to
embedded. Nothing moves the other way except the existing purge and regeneration paths.

### 4. Data read and written

- Read: `video_visual_scenes`, `video_visual_runs`, `indexed_files`, `file_summaries`,
  `embeddings`.
- Written: `embeddings` and `vec_text` rows of types `video_visual_scene` and
  `vision_description`, through the existing worker functions.

### 5. External services

None. The embedder runs in-process; no LLM or vision model is called.

### 6. Authorization

No request path changes. The backfill respects the per-drive feature policies as above.

### 7. Effect on existing features

- `/search/scenes` and MCP `search_video_scenes` return scenes.
- Default `/search`, Ask and similar files gain `vision_description` matches for described
  images, the behaviour the vision-describe design and `docs/addons/intelligence.md`
  ("used for search") describe. `video_visual_scene` rows stay excluded from default search
  and shallow Ask by `include_video_visual_scene=False`, as today.
- Tests that stubbed `embed_passages` with lists still pass; new tests use arrays.

### 8. Error behavior

Logged only (worker warnings as today; one backfill summary line; a warning per failed
item with the file id and exception type). Nothing is user-visible on failure.

### 9. User-visible behavior

Scene search returns scenes; image searches can match AI descriptions. No UI changes.

### 10. Non-functional

One embedder call per item, once. A library with thousands of descriptions takes minutes
at startup in the background; the event loop is not blocked.

## Touch points

- `addons/intelligence/app/workers/video_visual.py`: `_embed_scene`.
- `addons/intelligence/app/workers/vision.py`: `_embed_and_store`.
- `addons/intelligence/app/` (a new module, e.g. `embedding_backfill.py`): the backfill.
- `addons/intelligence/app/main.py`: start the backfill task after the startup purges.
- `addons/intelligence/tests/`: regression tests with a real numpy result; backfill tests.
- `addons/intelligence` submodule pointer bump in the core repository.
- Rules passed through: `.claude/rules/design-decisions.md` (addons policy: policy-off data
  is not written; startup purge runs first), the intelligence event-loop discipline.
- No protected path is edited.

## Invariants

I1. When `embed_passages` returns a numpy array with at least one row, `_embed_scene`
stores one `video_visual_scene` embedding and `_embed_and_store` one `vision_description`
embedding, each with its vector in `vec_text`.
I2. When `embed_passages` returns `None` or zero rows, neither worker stores anything.
I3. After the backfill, every scene of an active run with non-empty text and every active
file with a non-empty description, on a drive whose policy for that feature is on, has an
embedding of its type; no item gets a second one.
I4. The backfill never writes an embedding for a drive whose policy for that feature is off
or cannot be read, nor when that feature is `"false"`.
I5. The backfill calls no LLM or vision model and does not change any scene, run,
description or file row.
I6. A failure on one backfill item does not stop the others or undo their commits.

## Checked, no action

- **Regenerating scenes or descriptions instead of backfilling**: regeneration calls the
  vision model for every item; the stored text is what the embedding is made from.
- **A static check for `if not <array>`**: a grep only catches the written shape; the
  regression tests feed both workers a real numpy array, which is what failed.
- **Other `embed_passages` callers**: the rest test the result with `is None or len(...) ==
  0` or do not test it; only these two used truthiness.
- **Repeating the backfill periodically**: after the fix the workers embed as they write;
  startup covers a crash between a write and its embedding.
