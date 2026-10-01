# PR-2a review, round 2

Reviewed SHA: `9e94832232e1979fce40a605f311f31d4604145b` (fix commit, parent `0a2fd4f7`).
Worktree: `scratchpad/wt-intel-pr2ar2`. Baseline: full `tests/` green (2861 passed, 2 skipped).

## 1. Verification of the round-1 items

Test set for every mutant (unless noted): `test_llm_routing_callers test_auto_tags
test_summaries test_chapter_suggestions test_retrieval_keywords_worker
test_refine_endpoints test_detailed_summary_endpoints test_detailed_edit_endpoints
test_file_insights_regenerate test_llm_routing` (368 tests). Each mutant was
applied alone, run, and the tree restored with `git checkout -- .`.

| r1 item | what the user asked | reproducing mutation | r1 | now | closed? |
|---|---|---|---|---|---|
| F1 | remove `retry_later` | `retry_later` / `DEFER_RETRY_SECONDS` / `_pending_retries` no longer exist (`grep -rn retry_later app` empty); chapter Defer now returns with nothing queued, so the fail-closed `enqueue` gate is no longer on a retry path | — | n/a | yes (by removal) |
| F2 | remove `retry_later` | no deferred task exists, so no stale `force=True` rerun can fire | — | n/a | yes (by removal) |
| F5 | pin drive/feature (except M21) | M16 chapter worker resolves `""` | LIVE | KILLED (`test_unresolved_llm_sends_nothing_and_emits_nothing[defer]`) | yes |
| F5 | | M35 `refine_folder` resolves `""` | LIVE | KILLED (`test_folder_resolves_the_request_drive_before_starting`) | yes |
| F5 | | M27 `_require_detailed_enabled` resolves `summaries` | LIVE | KILLED (`test_summary_routes_…[start_detailed_summary-…]`) | yes |
| F5 | | M28 `_require_llm_enabled` resolves `detailed_summaries` | LIVE | KILLED (`…[regenerate_summary-summaries]`) | yes |
| F5 | | M37 chapter router resolves `summaries` | LIVE | KILLED (`test_chapter_generate_resolves_before_reading_the_transcript`) | yes |
| F5 | M21 deferred to PR-2c | not run | — | — | out of scope |
| F6 | remove retry | detailed Defer branch no longer exists; Defer and Skip share `isinstance(resolved, Resolved)`. R4 below | LIVE | equivalent | yes (by removal) |
| F7 | chapter Skip test | M20 drop the chapter `Resolved` guard | LIVE | KILLED (`…[defer]`; the `[skip]` row asserts `events == []`) | yes |
| F8 | stored model labels | M11 `model = settings.llm.model` in `generate_detailed_summary` | LIVE | KILLED (`test_detailed_summary_records_the_resolved_model`) | yes |
| F8 | | M11b only the stored row's model from `settings.llm.model` | — | KILLED (same) | yes |
| F8 | | M14 retrieval-keywords label | LIVE | KILLED (`test_retrieval_keywords_record_the_resolved_model`) | yes |
| F8 | | M19 chapter row model | LIVE | KILLED (`test_single_window_editor_…` now uses `routed-model` and reads `suggested_chapters.model`) | yes |
| F8 | | M26 `regenerate_detailed_summary` status model | LIVE | LIVE — **equivalent**: `_set_detailed_status` does `del model`; the argument is never stored | nothing to close |
| F9 | router gate before state | M23 gate removed from `regenerate_summary` | LIVE | KILLED | yes |
| F9 | | M24 gate moved after DELETE + re-embed (removed from top, added before `enqueue`) | LIVE | KILLED (`touched` = `_require_file_in_drive`/`get_search_db`/worker must be untouched) | yes |
| F9 | | M25 gate removed from `batch_summaries` | LIVE | KILLED | yes |
| F9 | | M29 gate removed from chapter generate | LIVE | KILLED | yes |
| F10 (retry) | remove retry | M32 (hot requeue via dropped sleep) has no target any more | LIVE | n/a | yes (by removal) — but see R6/R7 |

All requested items are closed. M26 was an equivalent mutant in round 1 as well;
the new `statuses[0]["model"]` assertion in
`test_detailed_summary_records_the_resolved_model` holds that discarded argument
(mutant M11c, status-call-only, is killed by it although the value is never
persisted) — harmless, noted in F-R2-3.

## 2. Mutation table (new mutants against this commit)

| # | file | mutation | want | got |
|---|---|---|---|---|
| M11c | workers/summaries.py `generate_detailed_summary` | only the `generating` status call passes `settings.llm.model` | live (arg is discarded) | KILLED — test asserts a kwarg `_set_detailed_status` deletes |
| R1 | workers/auto_tags.py | delete the Defer branch (Defer falls through to local-only write) | kill | KILLED (`test_auto_tags_defer_writes_nothing`) |
| R2 | workers/chapter_suggestions.py | guard `isinstance(resolved, Skip)` instead of `not Resolved` (Defer proceeds) | kill | KILLED |
| R3 | workers/summaries.py short path | `not isinstance(resolved, Skip)` (Defer proceeds) | kill | KILLED (`test_summaries_defer_writes_nothing`) |
| R4 | workers/summaries.py detailed path | same, for `detailed_summaries` | kill | LIVE — equivalent: `generate_detailed_summary(Defer)` raises `AttributeError` on `resolved.profile` before any write (context type was already filtered in `_process_file`), caught by `run()` |
| R5 | workers/retrieval_keywords.py | same | kill | LIVE — equivalent (as r1 M15): `resolved.client` raises inside the `try` in `_generate_keywords`, swallowed, nothing written |
| R6 | workers/auto_tags.py | Defer branch does `await self.enqueue(file_id)` (immediate requeue) | kill | **LIVE** → F-R2-2 |
| R7 | workers/chapter_suggestions.py | on non-`Resolved`, `await self.enqueue(file_id, force=force)` | kill | **LIVE** → F-R2-2 |
| M38 | main.py | (F10 start-up gating, recorded B by the user) | live | not re-run |

Reviewer reproduction for F-R2-1 (not committed; `scratchpad/r2repro/test_r2_repro.py`,
real SQLite `file_summaries` via `_create_file_summaries_table`, real
`_has_summary` / `_set_detailed_status` / `_save_detailed_summary` /
`enqueue_unprocessed`):

| tree | short result | after 1st pass `file_summaries` | 2nd pass: `enqueue_unprocessed()` / short saves |
|---|---|---|---|
| `9e948322` | Defer | `('', 'hidden', 'generated')` | 0 / 0 — **lost** |
| `9e948322` | Skip | `('', 'hidden', 'generated')` | 0 / 0 — **lost** |
| `0a2fd4f7` (parent) | Defer | `[]` (returned before detailed) | 1 / 1 — picked up |
| `0a2fd4f7` (parent) | Skip | `('', 'hidden', 'generated')` | 0 / 0 — lost |

## 3. Re-pickup after a Defer, per feature (question 2)

There is no periodic sweep in the addon: `enqueue_unprocessed` runs only in
`main.py` start-up. "Next sweep" therefore means the next process start, plus
the event-driven fan-outs below. Nothing in this commit changes that; stated
so the supervisor reads inv 2 with it.

| feature | re-enqueue sources | marker checked | Defer writes? | re-picked? |
|---|---|---|---|---|
| auto_tags | start-up sweep (`NOT IN suggested_tags`), indexer metadata batch, `requeue_after_whisper` (`no_tags`), manual regenerate | `suggested_tags` row | nothing (returns before `_save_suggested_tags`) | yes |
| summaries (short/long) | start-up sweep (`NOT IN file_summaries`), metadata batch, `requeue_after_whisper` (`no_summary`), regenerate/batch routes | **any** `file_summaries` row | nothing itself — **but the detailed layer in the same pass can create the row** | **no, when detailed on_index resolves in the same pass** → F-R2-1 |
| detailed_summaries (on_index) | start-up sweep (`detailed_status IS NULL`); `requeue_after_whisper` only when no `file_summaries` row at all | `detailed_status` | nothing (`_set_detailed_status` is only reached with a `Resolved`) | yes, at next start-up |
| retrieval_keywords | start-up sweep, metadata batch (not in `requeue_after_whisper`) | `retrieval_keywords` row | nothing | yes |
| chapter_suggestions | start-up sweep, `requeue_after_whisper`, manual generate | `suggested_chapters` row | nothing, no event | yes (on_index); a manual request is dropped silently — see note |
| transcript_refine | router only; `require_llm` 503s a Defer before `start_refine_job` | — | nothing | next request |

Note (not counted): a manual chapter generate whose router gate resolved but whose
worker then Defers (the `llm_cloud` cache expired while the job waited) returns
silently, so `SuggestedChaptersSection` shows "Creating chapters..." until
reload, since only `ready`/`failed` events end the spinner. This is the same
shape as the pre-existing fail-closed `is_chapter_suggestions_enabled` drop at
the line above it, and inv 11 forbids a `failed` event on a skip, so it follows
from the decided design. Same for `regenerate_summary`: the router has already
deleted the stored summary when the worker Defers; the user's next request (or the
on_index start-up sweep) regenerates it, which inv 2 as revised accepts.

No path found where a Defer or Skip writes anything other than auto_tags'
`clip+tfidf` row, except through F-R2-1's detailed row, which is detailed's own
legitimate output.

## Findings

### F-R2-1 — A short/long summary deferred (or skipped) in the same pass as a resolved on_index detailed summary is never picked up again (inv 2, spec "picked up again") [introduced] — Medium

`SummariesWorker._process_file` (summaries.py:1275-1291): the short Defer branch
used to `return`; this commit removed it, so a Defer on `summaries` now falls
through to the detailed layer. When `detailed_summaries` is `on_index` and
resolves (e.g. `summaries` routed to an offhost profile, `detailed_summaries` to
a local one — a Defer only happens for an offhost profile, so the split is the
realistic case), `generate_detailed_summary` → `_set_detailed_status` does
`INSERT OR IGNORE INTO file_summaries (… short_summary '' … status 'hidden')`.
From then on `_has_summary` is True and `enqueue_unprocessed`'s short gap
(`NOT IN (SELECT file_id FROM file_summaries)`) and `requeue_after_whisper`'s
`no_summary` both exclude the file. The short/long summary is permanently
missing until someone presses regenerate for that file.

Label: the **Defer** case is introduced by this commit (at parent `0a2fd4f7`
the same reproduction re-queues and saves: see the table in §2). The **Skip**
case has the same shape and was already present at `0a2fd4f7` (missed in round
1); it is introduced by the series, not by `9e948322` — before `0a2fd4f7`
there was no per-drive Skip.

Reproduction: `scratchpad/r2repro/test_r2_repro.py`, parametrised
`defer`/`skip`; output `ROWS after first run: [('', 'hidden', 'generated')]`,
`REQUEUED: 0 short saves: 0` at `9e948322`; `REQUEUED: 1 short saves: 1` for
Defer at `0a2fd4f7`.

No existing test holds this: the caller tests stub `_has_summary` to `False` and
never run both layers against a shared table.

Suggested fix (not applied): make the short gap mean "no short summary" rather
than "no row" — the placeholder row detailed creates has `short_summary = ''`
and `status = 'hidden'`, so `_has_summary` and the short-gap query can exclude
that placeholder (the pre-existing `summaries: "false"` → later on case has the
same blind spot, so this also removes a pre-existing gap). Restoring the `return`
on short Defer only fixes the Defer half and re-adds a branch.

### F-R2-2 — "A Defer does not re-enqueue" is unheld [introduced] — Low

R6 (auto_tags Defer does `await self.enqueue(file_id)`) and R7 (chapter
non-`Resolved` re-enqueues itself) survive the whole set. Either reintroduces
F10's hot loop against a down policy backend — worse than the removed
mechanism, since there is no sleep at all, and auto_tags reruns its
CPU-heavy candidate pass (auto_tags.py:236) before `resolve` on every lap. The
Defer tests assert "writes nothing" and "asked once" but not "nothing queued".
Suggested: in the existing Defer rows, assert the worker's `_queue.qsize() == 0`
after `_process_file` (one line each; chapter already has a real worker in
`test_unresolved_llm_sends_nothing_and_emits_nothing`).

### F-R2-3 — New test asserts an argument that is discarded [introduced] — Low (B)

`test_detailed_summary_records_the_resolved_model` asserts
`statuses[0]["model"] == "routed-model"` for the `_set_detailed_status(generating)`
call, but `_set_detailed_status` does `del model` (summaries.py:639); the value
is never persisted. M11c (only that argument switched to `settings.llm.model`)
is killed by a test for behaviour nobody can observe, and a refactor that drops
the dead parameter will fail it (`tests.md`: change check kept). The
`saved["model"]` assertion is the one that holds provenance (M11b killed).
Suggested: drop the `statuses` assertion.

## 4. Trajectory (question 3)

Diffs in order: `0a2fd4f7` added per-job resolution plus a new state and
prediction — `retry_later`, `_pending_retries`, `DEFER_RETRY_SECONDS`, and a
Defer branch in five places predicting that a requeue 30 s later would succeed.
`9e948322` **removes** that mechanism: −35 lines in `app/`, the retry state and
four Defer branches gone (auto_tags keeps a Defer branch, now only a log +
`return`, which it needs to avoid the local-only write). It adds no branch,
state or prediction in `app/`; the rest is tests. This round converges.

The one regression (F-R2-1) came from the removal itself: the short-path Defer
`return` also stopped the detailed layer from running, and without it the two
layers now interact through a shared "row exists" marker. Fixing it by
restoring the `return` would re-add a branch; fixing it at the marker would not.

TOTAL: 3 findings
