# PR-2a review, round 3

Reviewed: `b62ee71acd7b17bdddcf4e204e3d2f62547ed09b` + `de4832669427df95fcd1a46f005024e0ba52f2ef`
(round-2 fix) on top of `9e948322`. Tree at `de483266`, worktree `scratchpad/wt-intel-pr2ar3`.

Baseline: full `tests/` green at `de483266` (2863 passed, 2 skipped).

Mutation test set (every mutant, unless noted): every test file that touches
`file_summaries` / `SummariesWorker` plus the routing callers — `test_detailed_summary_endpoints
test_summaries_migration test_file_insights_write test_vision_worker test_rag_clue_generator
test_summaries test_detailed_edit_endpoints test_file_insights_regenerate test_summaries_edit
test_metadata_summary test_file_insights_reader test_llm_routing_callers test_chapter_suggestions
test_document_sections test_purge test_vision_purge test_requeue_after_whisper test_auto_tags
test_llm_routing` (452 tests). One mutant at a time, tree restored with `git checkout -- .`
after each; the worktree was clean at `de48326` at the end.

## 1. Verification of the round-2 items

| r2 item | reproducing mutation | want | got | closed? |
|---|---|---|---|---|
| F-R2-1 (worker) | M1 `_has_summary` back to "row exists" (drop `AND _HAS_SHORT_SUMMARY`) | kill | KILLED (`test_short_summary_is_still_owed_after_a_detailed_marker`) | yes |
| F-R2-1 (start-up sweep) | M2 short gap back to `NOT IN (SELECT file_id FROM file_summaries)` | kill | KILLED (same test, `enqueue_unprocessed() == 1`) | yes |
| F-R2-1 (post-Whisper requeue) | M3 `no_summary` back to "row exists" | kill | KILLED (`test_enqueues_summaries_when_only_a_detailed_marker_exists`) | yes |
| F-R2-1 (detailed marker survives the short save) | M4e `_save_summary` back to plain `INSERT OR REPLACE` (no upsert clause) | kill | KILLED (`detailed_status` assertion) | yes |
| | M4c drop the `ON CONFLICT` clause only (plain INSERT) | kill | KILLED (IntegrityError) | yes |
| | M4/M4b `INSERT OR REPLACE … ON CONFLICT DO UPDATE` | live | LIVE — equivalent: SQLite applies the upsert clause to the PK conflict before the `OR REPLACE` resolution | n/a |
| F-R2-2 auto_tags | R6 Defer branch does `await self.enqueue(file_id)` | kill | KILLED (`test_auto_tags_defer_writes_nothing`, `waiting == 0`) | yes |
| F-R2-2 chapters | R7 non-`Resolved` does `await self.enqueue(file_id, force=force)` | kill | KILLED (`test_unresolved_llm_sends_nothing_and_emits_nothing[defer]` and `[skip]`) | yes |
| F-R2-2 summaries | R8 short non-`Resolved` does `self._queue.put(file_id)` | kill | KILLED (`test_summaries_defer_writes_nothing`) | yes |
| F-R2-3 | recorded only (user decision) | — | not re-examined | — |

End-to-end, real SQLite `file_summaries`, real `_has_summary` / `_set_detailed_status` /
`_save_detailed_summary` / `_save_summary` / `enqueue_unprocessed`, short `summaries`
Defer or Skip on pass 1 and resolved on pass 2, detailed resolved on both
(`scratchpad/r3pr2a/test_r3_repro.py::test_e2e`):

| tree | after pass 1 `(short, long, model, status, detailed_status)` | pass 2: requeued / row after |
|---|---|---|
| `9e948322` | `('', '', '', 'hidden', 'generated')` | 0 / unchanged — lost (F-R2-1) |
| `de483266` | `('', '', '', 'hidden', 'generated')` | 1 / `('s', 'l', 'local', 'generated', 'generated')` |

Same result for Defer and Skip. The short summary is picked up again and the detailed
marker survives the save. F-R2-1 and F-R2-2 are closed.

## 2. Mutation table (new mutants against this fix)

| # | file | mutation | want | got |
|---|---|---|---|---|
| M5 | workers/summaries.py `_save_summary` | drop `status = excluded.status` from the upsert (marker's `'hidden'` survives) | kill | **LIVE** → F-R3-1 |
| M6 | same | drop `short_summary = excluded.short_summary` | kill | KILLED |
| M7 | same | drop `model = excluded.model` (marker's `''` survives) | kill (inv 7) | **LIVE** → F-R3-1 |
| M8 | same | drop `long_summary = excluded.long_summary` | kill | **LIVE** → F-R3-1 |
| M9 | same | drop `context_type = excluded.context_type` | kill | LIVE → F-R3-1 |
| M10 | same | drop `was_truncated = excluded.was_truncated` | kill | LIVE → F-R3-1 |

## 3. What the fix touched, and what it broke (question 2)

**Every writer that can now hit the upsert's conflict path.** `_save_summary` has one caller
(`_generate_short_long`), which runs only when `_has_summary` is False, so the conflict
row always has an empty short summary. Such rows come from `_set_detailed_status`
(detailed marker) and `vision._ensure_summary_row` (image placeholder). Images never reach
the short path: `_classify_file_type` returns None and both short gaps filter
`file_type IN ('video','audio','document','text')`. `regenerate_summary` DELETEs the
row before it enqueues, and `batch_summaries` skips any file with a row, so neither
reaches the conflict path. So at `9e948322` `INSERT OR REPLACE` only ever replaced a
placeholder (or, via F-R2-1, never ran at all). On the normal sequences, `edited_at`,
`short_original`, `long_original` and `visual_description*` are NULL on the placeholder,
so keeping them changes nothing.

There is one exception: the placeholder can be edited. `GET /summary` returns
`available=True` for the marker row (it reads the row), so the section renders an
empty "AI Summary" with Edit. An edit that lands while the short generation is in flight
is overwritten, and it leaves stale edit columns behind → F-R3-2.

**Loops.** Nothing re-enqueues from inside `_process_file` (R6–R8 killed). Every
enqueue source is one-shot: start-up sweep, metadata batch, post-Whisper requeue, and
the routes. The new predicate adds these cases, each bounded:
- `summaries: "false"` with detailed `on_index`: post-Whisper now enqueues a marker
  file once per Whisper completion. `_process_file` returns at `want_short` without a
  resolve or an LLM call.
- `summaries` policy off for the drive, detailed on: the sweep's short gap is
  policy-filtered, so the file is not queued. Post-Whisper `enqueue` accepts it through
  the detailed branch, and `_process_file` does one `resolve` → Skip and writes nothing.
- Insufficient content: a marker row implies the detailed layer had context. An LLM
  that returns an empty short/long is retried at the next start-up, which is the same
  shape as a file with no row at both trees.

**"User-deleted summaries are not regenerated".** Still honoured. No route deletes a
short summary except `regenerate_summary`, which re-enqueues on purpose. `SummaryEditRequest`
requires `min_length=1`, so an edit cannot empty it. Detailed DELETE / regenerate
drop the placeholder row only when short/long are empty, which gives "no row" at both
trees, so nothing differs. The one new path to an empty short on a real row is
edit-then-revert of a marker row (originals `''`); that row is then owed again, which is
the intended reading.

**Router/UI readers.** `GET /summary` and `batch_summaries` still use "row exists" →
F-R3-3 [pre-existing]. `_delete_detailed_summary` and the detailed regenerate route
already use "short or long non-empty", which matches the new predicate.
`metadata.py` and `rag/clue_generator.py` read `status = 'generated'`, which the upsert
writes (held only by M5's absence of a test, see F-R3-1).

## Findings

### F-R3-1 — The upsert's conflict path is held only for `short_summary` [introduced] — Medium

The upsert is new in `b62ee71a`. Its conflict path is exactly the case this round
fixed: a detailed marker row. The new test asserts only `_has_summary` and
`detailed_status` after the save. M7 (the marker's `model = ''` survives) violates
inv 7 (the stored output records the model that produced it). M5 (`status` stays
`'hidden'`) drops the long summary from the metadata embedding (`metadata.py`
`CASE WHEN status = 'generated'`) and from the clue generator. M8 (long stays `''`)
shows a summary without its body. All survive the 452-test set.

Suggested (not applied): in `test_short_summary_is_still_owed_after_a_detailed_marker`,
assert the whole saved row after `_save_summary` — `(short, long, model, status)` ==
`("s", "l", "m", "generated")` — alongside `detailed_status`. Use a model value that
differs from the marker's `''` (it already does). One assertion, same test.

### F-R3-2 — An edit of the marker row made during an in-flight short generation is lost, and the edit columns go stale [introduced] — Low

Sequence (`test_r3_repro.py::test_edit_during_generation`): a detailed marker row
exists → the worker starts the short generation → the user edits the (empty, shown as
available) summary to `mine` → the LLM returns → `_save_summary` upserts.
- `de483266`: row `('ai', 'ai long', 'local', 'generated', edited_at=<set>, short_original='', long_original='')`.
  The user's text is gone, the "Edited" badge shows over AI text, and Revert restores
  `''`/`''` (after which the file is owed again).
- `9e948322`: the worker never runs on a marker row (F-R2-1), so the edit stands.
  Under the old `INSERT OR REPLACE` the edit would be lost the same way, but the edit
  columns would have been reset.

Reachable only in the LLM-call window, on a file whose detailed summary exists
without a short one. It breaks no declared invariant, so it is a B candidate. Suggested
(not applied), either one: add `edited_at = NULL, short_original = NULL,
long_original = NULL` to the `DO UPDATE SET` (gives coherent columns, same as the old
replace), or `… DO UPDATE SET … WHERE COALESCE(file_summaries.short_summary,'') = ''`
(keeps the user's edit). The second adds a condition, so it is the heavier option.

### F-R3-3 — `GET /summary` and `batch_summaries` still read "row exists ⇒ short summary exists" [pre-existing] — Low

`routers/summaries.py` `get_summary` returns `available=True` with an empty short
summary for a detailed marker row. So `SummarySection` shows an empty "AI Summary"
section and does not offer "Generate summary" (`useOfferIntelligenceAction` is active
only when `!available`). `batch_summaries` counts the file as `skipped`. Under
`summaries: "manual"` (the default), a user who generated the detailed summary first
has only Regenerate. `regenerate_summary` DELETEs the whole row, and the detailed
marker with it. The router is byte-identical between `9e948322` and `de483266`
(`git diff --stat 9e948322 de483266 -- app` touches only `indexer.py` and
`workers/summaries.py`), so this is pre-existing. The fix leaves these two readers
disagreeing with the worker's new predicate. Suggested: use `_HAS_SHORT_SUMMARY` in
both, i.e. GET falls through to `classify_missing_reason` and batch does not skip.
Ledger item unless the supervisor wants it in this PR.

## 4. Trajectory (question 3)

Fix diffs in order:
- `0a2fd4f7` added a state and a prediction: `retry_later` / `_pending_retries` / a
  Defer branch in five callers, predicting that a requeue 30 s later succeeds.
- `9e948322` **removed** that mechanism and added no branch, state or prediction in `app/`.
- `b62ee71a` adds **no branch and no state**. It changes the condition of three existing
  queries to one shared predicate (`_HAS_SHORT_SUMMARY`), and it changes a write from
  replace to upsert. It does not special-case Defer or Skip, so it did not restore the
  short-path `return` that round 2 warned would re-add a branch. The fix works at the
  shared marker, not at each caller.

The upsert does carry an implicit prediction: that the row it meets is a placeholder
whose other columns should survive. F-R3-2 is the one sequence where that prediction is
false. Plainly: this round neither adds nor removes a branch. It widens one predicate and
makes one write merge instead of replace. No two consecutive rounds added a branch,
state or prediction, and the loop is converging. Round 3's findings are one test gap
(F-R3-1) and one narrow race (F-R3-2), and neither requires new handling in `app/`.
The simpler fix for F-R3-2, resetting the edit columns in the SET, adds no condition.

TOTAL: 3 findings
