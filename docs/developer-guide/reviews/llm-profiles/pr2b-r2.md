# PR-2b round 2 — fix commit `2bf0497a` on its own

Reviewed tree: `2bf0497acf32c247a70d5656ad09e4e2b874343d` (parent `6239fbf0`), worktree
`scratchpad/wt-intel-pr2br2`. Baseline: `tests/` 2879 passed, 2 skipped.

Mutation suite (every row): `test_vision_worker test_video_visual_worker test_vision_endpoints
test_video_visual_router test_refine_batch test_refine_endpoints test_refine_speaker_id_clearing
test_refine_migration test_refine_aligner test_llm_routing test_llm_routing_callers`. One mutation at a
time, tree restored with `git checkout -- .` after each.

## 1. Verification of the round-1 items

Each row names the mutation that reproduces the round-1 defect (or its test gap) and what it does now.

| r1 | reproducing mutation | want | now | verdict |
|---|---|---|---|---|
| F1 | N01 `_clear_pending` CASE → `NULL` (the r1 code) | kill | KILLED `test_releasing_a_re_request_keeps_the_description_visible` | closed; condition column unheld (G3) |
| F2 | N03 drop `_stamp_run_model(...)`; N04 stamp with `settings.llm.vision_model` | kill | both KILLED `test_the_run_records_the_model_it_was_processed_with` | closed |
| F3 | N05 `_release_unserved_run` → `_fail_run(PolicyDisabled)` (the r1 code) | kill | KILLED `test_a_fresh_run_..._is_removed` | closed. Probe P4: Defer on a fresh on_index run → run deleted, `enqueue_unprocessed()` → 1 |
| F3 | N06 always delete (drop has-scenes branch) | kill | KILLED `test_a_retried_run_..._keeps_its_scenes` | held |
| F3 | N07 policy-off at process time → release/delete instead of `PolicyDisabled` | kill | **LIVE** | behaviour correct (probe P5: `('failed','PolicyDisabled')`) but unheld → G4 |
| F4 | N08 drop `chunk.refined_model = model` in `refine_chunks` | kill | KILLED `test_updates_chunks_and_stamps_refined_at` | held at function level |
| F4 | N09 drop `orm.refined_model = snap.refined_model` (r1 M24) | kill | **LIVE** | **not closed** → G1 |
| F4 | N10 call site passes `model=resolved.profile.config.vision_model` (r1 M27 shape) | kill | **LIVE** | **not closed** → G1 |
| F4 | N11 `rechunk_from_words(refined_model=...vision_model)` | kill | **LIVE** | **not closed** → G1 |
| F5 | N12/N14 vision accept/process drive → `"family"` | kill | KILLED `test_both_resolves_use_the_files_drive_and_ask_for_vision` | closed |
| F5 | N13/N15 vision accept/process `vision=False` | kill | KILLED (same test) | closed |
| F5 | N16/N18 video accept/process drive → `"family"` | kill | KILLED `test_both_resolves_use_the_files_drive` | closed |
| F5 | N17/N19 video accept/process `vision=False` | kill | KILLED (same + `..._is_removed`) | closed |
| F6 | N20 vision unsupported vs `settings.llm.vision_model` | kill | KILLED `test_unsupported_is_judged_against_the_routed_model` | closed |
| F6 | N21 video unsupported vs `settings.llm.vision_model` | kill | KILLED `test_unsupported_is_judged_against_the_routed_model` | closed |
| F7 | N22 first scene call via a non-resolved client (`llm_routing.get_llm_client()`); N22b via `app.dependencies.get_llm_client()` | kill | **LIVE** (both) | **not closed** → G2 |
| F9 | probe P1 (vision, resolve slowed 10 ms, `gather` of two manual enqueues) | — | `[True, False]`, reasons `[None, 'already_queued']`, qsize 1 | fixed |
| F9 | probe P2 (video, same) | — | `['queued', 'already_queued']`, 1 run | fixed |
| F9 | N23 vision / N24 video: move the in-flight check back above the resolve | kill | **LIVE** (both) | fix unheld (B, G5) |

## 2. Mutation table

| id | where | mutation | want | result |
|---|---|---|---|---|
| N01 | vision.py `_clear_pending` | CASE → `NULL` | kill | KILLED |
| N02 | vision.py `_clear_pending` | `CASE WHEN visual_description_model IS NOT NULL` | kill | **LIVE** → G3 |
| N03 | video_visual.py `_process_run` | drop `_stamp_run_model` | kill | KILLED |
| N04 | video_visual.py `_process_run` | stamp `settings.llm.vision_model` | kill | KILLED |
| N05 | video_visual.py `_process_run` | unresolved → `_fail_run(PolicyDisabled)` | kill | KILLED |
| N06 | video_visual.py `_release_unserved_run` | `if not has_scenes` → `if True` | kill | KILLED |
| N07 | video_visual.py `_process_run` | policy-off → `_release_unserved_run` | kill | **LIVE** → G4 |
| N08 | refine.py `refine_chunks` | drop `chunk.refined_model = model` | kill | KILLED |
| N09 | refine.py `_run_refine_job` | drop `orm.refined_model = snap.refined_model` | kill | **LIVE** → G1 |
| N10 | refine.py `_run_refine_job` | `model=...vision_model` | kill | **LIVE** → G1 |
| N11 | refine.py `_run_refine_job` | rechunk `refined_model=...vision_model` | kill | **LIVE** → G1 |
| N12 | vision.py accept | drive `"family"` | kill | KILLED |
| N13 | vision.py accept | `vision=False` | kill | KILLED |
| N14 | vision.py process | drive `"family"` | kill | KILLED |
| N15 | vision.py process | `vision=False` | kill | KILLED |
| N16 | video_visual.py accept | drive `"family"` | kill | KILLED |
| N17 | video_visual.py accept | `vision=False` | kill | KILLED |
| N18 | video_visual.py process | drive `"family"` | kill | KILLED |
| N19 | video_visual.py process | `vision=False` | kill | KILLED |
| N20 | vision.py accept | unsupported vs global model | kill | KILLED |
| N21 | video_visual.py accept | unsupported vs global model | kill | KILLED |
| N22 | video_visual.py `_process_scene` | first call `llm_routing.get_llm_client()` | kill | **LIVE** → G2 |
| N22b | video_visual.py `_process_scene` | first call `app.dependencies.get_llm_client()` | kill | **LIVE** → G2 |
| N23 | vision.py `_should_accept` | in-flight check back above resolve | kill | **LIVE** → G5 |
| N24 | video_visual.py `_should_accept` | in-flight check back above resolve | kill | **LIVE** → G5 |

Probes (P1–P5) were a separate test file mounted outside `tests/`, not added to the tree.

## 3. What the fix could have broken (question 2)

**`_clear_pending`'s CASE — can a row be released to `success` wrongly?** No. Every writer of
`visual_description` / `visual_description_status` was checked:
- `_write_status` (vision.py): the `failed` (load, decode, request/empty) and `unsupported` writers all
  pass `description=None`; only the success writer passes text. The same holds in every version of the
  worker back to `57ae0b8`, so no older row carries a description next to a failure.
- `_mark_pending` changes only status and error; `_clear_pending` only acts on `pending`.
- `routers/vision.py` DELETE and `purge.py` use `VISION_DESCRIBE_CLEAR_SQL`, which nulls every vision
  column at once.
- No other module writes these columns (summaries router/worker do not touch `visual_*`).

So "description present" means "last completed attempt was success". Probe P3: a `failed` row
(description NULL, error `load`) re-requested manually and then Deferred ends `(desc NULL, status NULL,
model kept, error NULL)`. That is the NULL half of the user's triage. It also means an earlier `failed`
or `unsupported` verdict now reads as "never attempted", which the on_index sweep will pick up. The UI
Regenerate path deletes the description before enqueueing, so there the release always goes to NULL.
That is the user's action and predates this change.

**Deleting a fresh run.**
- *Active?* A run becomes `is_active` only in `_finalize_run` for succeeded/partial runs, and both
  need scenes. A run with no scenes cannot be active.
- *Race with scene creation / retry.* The scene check and the delete run in one `get_search_db()`
  session. The run is `running`, claimed by the single worker loop, and `_build_scenes` for it runs
  later in the same coroutine. `retry()` only selects `partial`/`failed` runs, so it cannot pick up a
  `running` one. The router only reads. Nothing references `video_visual_runs.id` except scenes
  (FK CASCADE), and there are none.
- *"Has scenes" is not "retried".* A fresh run that crashed after `_build_scenes` is re-queued with
  scenes by `_requeue_interrupted_run` and takes the fail branch. That fits the triage's rationale
  (scenes kept), but the docstring's "retried run" is narrower than the condition.
- *Lost manual request.* See G8.

**F9: any await left between the check and the claim?** None. Vision: after the `_queued/_processing`
check, `_should_accept` is synchronous to its return, and `enqueue` runs `_mark_pending` (sync) and
`_queued.add` before its first await (`_queue.put`). Video: after the in-flight read, the rest of
`_should_accept` and `enqueue` (on_index `up_to_date` check, run insert) are synchronous. All callers
(router, indexer CLIP hook, startup sweep) share one event loop. Side effects in G7.

**`refine_chunks` signature.** It has one production caller, `_run_refine_job`, and it was updated. All
test callers were updated. The snapshot namespace gains `refined_model=None`. The write-back copies it
only for chunks in `refined_window` (those with `text_refined_at` set), so an unrefined chunk's ORM
row is untouched. The code is correct, but no test holds it (G1).

## 4. Findings

### G1: Refine's recorded model is still unheld at the job level (inv 7) [introduced], Medium, A (test gap)

r1 F4 is only half closed. The stamp moved into `refine_chunks`, and N08 is killed there. But no test
drives `_run_refine_job` (`grep -rl _run_refine_job tests/` is empty), so these all survive:
- N09 drops the ORM write-back `orm.refined_model = snap.refined_model` (r1 M24);
- N10 passes the vision model at the call site;
- N11 passes the vision model to `rechunk_from_words`.

A refined chunk can therefore be stored with no model, or with the wrong one, and the suite stays
green. Rechunking replaces the rows when words exist, so N09 shows only when `rechunk_from_words`
returns `[]` (no words, or no chunks built). N10/N11 show on every job.

Suggested fix (not applied): the test r1 proposed. Drive `_run_refine_job` with
`resolved_with(client, model="routed")`, text model ≠ vision model, over two chunks with a stubbed
aligner, and assert `refined_model == "routed"` on the resulting rows. Run it once with rechunking
producing rows and once producing none.

### G2: The first scene call's client is still masked (inv 1) [introduced], Low, A (test gap)

r1 F7 is not closed. The added `assert llm.generate_video_scene_json.await_count == 1` holds under the
exact r1 mutation. When the first call goes to a non-resolved client (N22 `llm_routing.get_llm_client()`,
N22b `app.dependencies.get_llm_client()`), it raises and becomes `FAILURE_REQUEST_FAILED`. The repair
call then goes to `resolved.client`, so that client is awaited exactly once and returns the label.
Frames sent to a client other than the routed one bear on inv 1, which is why this counts as an A.

Suggested fix: assert which prompt the one call carried, e.g.
`llm.generate_video_scene_json.assert_awaited_once_with(ANY, ANY, ANY, <the non-retry user prompt>)`,
or assert the retry template was not rendered.

### G3: The CASE's condition column is unheld [introduced], Low, B (test gap)

N02 survives: `CASE WHEN visual_description_model IS NOT NULL THEN 'success'` instead of
`visual_description`. The only test row has both a description and a model. A `failed` row has a model
but no description (P3's seed), and under N02 it would be released to `success` with no text. The UI
would then show a success state with nothing to render, and `enqueue_unprocessed` would never retry
it. Suggested fix: add P3's `failed` row (expect status NULL) next to
`test_releasing_a_re_request_keeps_the_description_visible`, as a table row.

### G4: "Policy-off still fails the run `PolicyDisabled`" is unheld [introduced], Low, B (test gap)

The user's F3 decision keeps policy-off separate from unserved routing. N07 routes policy-off through
`_release_unserved_run`, which deletes the fresh run, and it survives. The renamed test only covers
`Skip`. Current behaviour is correct (P5: `('failed','PolicyDisabled')`). Suggested fix: add a row to
the fresh-run test with `policy_allow_all.return_value = False` and assert that the run survives as
`failed/PolicyDisabled`.

### G5: The F9 reorder is not held by any test [introduced], Low, B

N23 and N24 put each in-flight check back above the resolve, and both survive. P1 and P2 show the
reorder works. F9 was bucket B, so a test is optional. P1/P2 are the shape of one if wanted.

### G6: `_stamp_run_model` rewrites the model of scenes already described on a retried run [introduced], Low, B

`retry()` re-queues a `partial`/`failed` run, possibly the active partial run, keeping its succeeded
scenes. `_process_run` now overwrites `vision_model` with the model used for the retried scenes. Scenes
have no model column, so a run whose scenes came from two models records only the last one. The
earlier scenes' provenance changes, and so does the active run's. Before the fix, the run recorded the
enqueue-time model and was wrong about the new scenes instead. Newly stored scenes now satisfy inv 7.
What changes is the recorded model of existing ones (inv 9 is about deletion/invalidation, so no
breach). Options: accept it, since one column cannot hold two models; or stamp only while the run has
no succeeded scenes. This is a design call for the supervisor.

### G7: A duplicate request can now be refused where it used to be "already queued" [introduced], Low, B

The in-flight check now comes after the resolve (and, for video, after `waiting_clip` and
`unsupported_sticky`). Take a second manual click on a file that is already queued, at a moment when
the resolve returns `Defer` (a transient `llm_cloud` lookup failure) or `Skip`. It now gets 409
`policy_unavailable` / `llm_unavailable` / `disabled` instead of 200 `already_queued`, although the
first job is still queued. Separately, the vision worker reads `state` before the await, so an on_index
accept can act on a stale status if a job for that file finishes during the lookup. That costs one
duplicate call and is narrower than F9. One fix for both: re-read state and do the in-flight check
after the resolve, and let an in-flight job answer `already_queued` whatever the resolve returned.

### G8: A deleted fresh manual run leaves no trace [introduced], Low, B

"The next sweep picks the file up" holds only in `on_index` mode. In `manual` mode nothing re-enqueues
it, so a Generate click whose run is deleted at process time (a routing change or a transient `Defer`)
produces nothing. `_release_unserved_run` emits no event, and `VisualIndexSection` refreshes only on WS
events, so the staged run shows as in flight until reload. After reload the section shows the
pre-request state (no run, or an older staged run), with no sign that a request was dropped. At the
parent, the same path also emitted no event ([pre-existing] stuck spinner), but a reload showed a
`failed` run. What this change introduces is the missing trace. The user chose option A. This is
recorded so the manual-mode consequence is explicit, and an `intelligence.video_visual.failed` event
(or the vision-style 409 at the next request) would close it.

### Pre-existing, one line each

- [pre-existing] `requeue_abandoned` → refused manual enqueue leaves `pending` (r1 item; unchanged).
- [pre-existing] `_process_run` turns a policy **lookup exception** into `enabled=False` →
  `failed/PolicyDisabled`, which the sweep then skips forever. Same at `6239fbf0`. Inv 2 names only
  the `llm_cloud` lookup.
- [pre-existing] `_fail_run(PolicyDisabled)` on a retried active partial run leaves `is_active=True`
  with `status='failed'`. Same path at the parent.

## 5. Trajectory (question 3)

Diffs in order: `6d80dc36`/`6239fbf0` (original), `2bf0497a` (this fix).

- The original added a process-time re-resolve at both workers and a new release path for "accepted
  but no longer served": vision `_clear_pending` → NULL, video → `failed/PolicyDisabled`.
- This fix, on that same path:
  - adds a **prediction**: the CASE assumes "description present ⇒ last attempt succeeded", which holds
    only because every failure writer nulls the description (checked above; nothing enforces it);
  - adds a **branch**: `_release_unserved_run`'s has-scenes split, delete vs fail;
  - adds a **write**: `_stamp_run_model`, whose retry consequence is G6.
- F9 is a reorder and adds no state. F4 moves a stamp and removes a local variable, which is neutral.
- It removes nothing.

So yes: this round adds a branch and a prediction, both on the path the original created, and removes
none. The has-scenes branch is there because the video worker's claim (the run row) is also the owner
of its output (the scenes), so "undo the claim" cannot be one operation. The vision worker separates
the two with a status column. Whether this is patching: it is the first fix round. The two-round test
counts fix rounds, so it has not triggered. But the shape is the one that rule describes. Every case
here (fresh vs retried vs interrupted-with-scenes, success vs failed vs unsupported release, manual vs
on_index) exists only because the accept-time resolve predicts a result that the process-time resolve
may contradict. G7 and G8 are two more corners of the same state. A design that resolves only at
process time, and creates the claim (the pending status or the run row) only once the resolve
succeeds, would remove the release path altogether. The accept-time resolve would then shrink to a
cheap availability hint. That is for the supervisor. If a round 3 has to add another case on this path,
it is a C.

TOTAL: 8 findings
