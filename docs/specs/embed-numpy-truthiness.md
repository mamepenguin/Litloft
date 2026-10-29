# Store the scene and image-description embeddings the workers already compute

SPEC-ID: SPEC-ADDON-034

Approval: sha256:d132b5b3e0f34bf7e1b215b28738b42f6bb23b4312320f159efc0f5ac0a0ef67 Yuichi Senga 2026-10-29

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

SPEC-ADDON-034: both workers test the embedder's result by its length, so a non-empty
result is stored. Scenes and descriptions generated before the fix get an embedding only
when they are generated again.

## Required items

### 1. Normal flow

1. `_embed_scene` and `_embed_and_store` call `embed_passages([text])` as today.
2. A result that is `None` or has zero rows is treated as "nothing to store" (return, as
   today). Any other result has its first row stored exactly as the code after the check
   already does: the `embeddings` row and the `vec_text` row with the existing id scheme,
   embedding type, timestamps and `content_preview`.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Worker | the embedder raises | logged warning, nothing stored, as today |
| Worker | the embedder returns no rows | nothing stored, as today |
| Worker | the `vec_text` insert fails | as today: warning; the `embeddings` row is still committed |

### 3. States

A scene or description is "embedded" (has its embedding row) or "not embedded". The fix
makes ones written from now on embedded. Existing ones stay not embedded until they are
generated again; nothing else changes state.

### 4. Data read and written

- Read: none beyond what the workers read today.
- Written: `embeddings` and `vec_text` rows of types `video_visual_scene` and
  `vision_description`, through the existing worker functions.

### 5. External services

None new. The embedder runs in-process.

### 6. Authorization

No change. The workers already run only for drives whose policy allows the feature.

### 7. Effect on existing features

- `/search/scenes` and MCP `search_video_scenes` return scenes.
- Default `/search`, Ask and similar files gain `vision_description` matches for described
  images, the behaviour the vision-describe design and `docs/addons/intelligence.md`
  ("used for search") describe. `video_visual_scene` rows stay excluded from default search
  and shallow Ask by `include_video_visual_scene=False`, as today.
- Tests that stubbed `embed_passages` with lists still pass; new tests use arrays.

### 8. Error behavior

Logged only (worker warnings as today). Nothing is user-visible on failure.

### 9. User-visible behavior

Scene search returns scenes; image searches can match AI descriptions. No UI changes.

### 10. Non-functional

None. The embedder call already happens; only its result is now stored.

## Touch points

- `addons/intelligence/app/workers/video_visual.py`: `_embed_scene`.
- `addons/intelligence/app/workers/vision.py`: `_embed_and_store`.
- `addons/intelligence/tests/`: regression tests with a real numpy result.
- `addons/intelligence` submodule pointer bump in the core repository.
- Rules passed through: `.claude/rules/design-decisions.md` (addons policy).
- No protected path is edited.

## Invariants

I1. When `embed_passages` returns a numpy array with at least one row, `_embed_scene`
stores one `video_visual_scene` embedding and `_embed_and_store` one `vision_description`
embedding, each with its vector in `vec_text`.
I2. When `embed_passages` returns `None` or zero rows, neither worker stores anything.

## Checked, no action

- **A startup backfill of existing scenes and descriptions**: dropped by the human; the
  existing data is test data, and regenerating an item gives it an embedding.
- **A static check for `if not <array>`**: a grep only catches the written shape; the
  regression tests feed both workers a real numpy array, which is what failed.
- **Other `embed_passages` callers**: the rest test the result with `is None or len(...) ==
  0` or do not test it; only these two used truthiness.
