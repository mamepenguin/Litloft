# R1 mutation review: intelligence `b6eeaea`

Worktree: detached at `b6eeaea`. Each mutant applied alone, image rebuilt, targeted tests run with `-x`; surviving `want=kill` mutants re-run against the full suite. Baseline full suite: 3555 passed, 2 skipped.

## Mutations

| # | mutation | file:line | want | result | note |
|---|---|---|---|---|---|
| G1 | `get_embedding_config`: `await asyncio.to_thread(_embedding_status_payload)` -> direct call | app/routers/admin.py:856 | kill | killed by test_event_loop_discipline::test_no_sync_db_call_runs_on_the_event_loop | |
| G2 | `pickup_endpoint`: `await asyncio.to_thread(_read)` -> `_read()` | app/routers/pickup.py | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G3 | `get_visual_description`: `_fetch_visual_description` called directly | app/routers/vision.py:348 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G4 | `similar`: `await asyncio.to_thread(_scores)` -> `_scores()` | app/routers/similar.py | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G5 | `search_compare_endpoint`: `run_in_threadpool(execute_search_compare, ...)` -> direct call | app/routers/search.py:142 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | cross-module helper resolved |
| G6 | `get_chapter_suggestions`: closure + to_thread -> inline `with get_search_db()` | app/routers/chapter_suggestions.py:54 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G7 | `video_visual`: `await asyncio.to_thread(_load_runs)` -> `_load_runs()` | app/routers/video_visual.py:167 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G8 | `reindex_file`: `await asyncio.to_thread(_reset_flags)` -> `_reset_flags()` | app/routers/files.py:326 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G9 | `regenerate_detailed_summary`: `_reset_and_mark_generating()` direct | app/routers/summaries.py:1230 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G10 | `coarse_retrieve`: `_query()` direct | app/rag/coarse_retriever.py | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G11 | `refine_folder`: `_filter()` direct | app/routers/refine.py | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| G12 | `get_suggested_tags`: `def` -> `async def`, nothing else | app/routers/files.py:891 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | want=kill, not live: every plain-`def` handler in this commit opens `get_search_db()` in its own body, so as `async def` the factory call is itself inside an async body |
| G13 | `get_clip_timestamps`: `def` -> `async def` | app/routers/files.py:479 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | same reasoning as G12 |
| S1 | `edit_summary`: SELECT in one `to_thread`, `await asyncio.sleep(0)`, UPDATE in a second `to_thread` | app/routers/summaries.py:373-417 | kill | **survived** (targeted + full suite) | snapshot-on-first-edit decision can be made on a stale read |
| S2 | `revert_summary`: same split (404/400 read, then UPDATE) | app/routers/summaries.py:~440-478 | kill | **survived** (targeted + full suite) | |
| S3 | `regenerate_detailed_summary`: 409 edit-flag check in its own `to_thread`, wipe in a second | app/routers/summaries.py:1120-1230 | kill | **survived** (targeted + full suite) | `test_conflict_check_and_delete_share_one_session` only drives the 409 path, where the wipe never runs; it counts sessions handed to `_fetch_detailed_edit_state` (still 1) and checks `_delete_detailed_summary` is unused (still true) |
| C1 | `dismiss_chapter_suggestions`: status SELECT in one `to_thread`, UPDATE in a second | app/routers/chapter_suggestions.py:117-137 | kill | **survived** (targeted + full suite) | the UPDATE keeps `AND status='pending'`, so the split cannot clobber; a raced approve turns the 409 into a silent 200 |
| A1 | `resolve_failed_job`: 404 existence check in one `to_thread`, flag + JobRecord write in a second that silently returns if the row vanished | app/routers/admin.py:1255-1285 | kill | **survived** (targeted + full suite) | a deactivated-in-between file returns 200 `resolved` with nothing written |
| R1 | `reindex_file`: drive/404 check (`_get_indexed_file_or_404`) moved after the flag reset + enqueue | app/routers/files.py:276 -> after :331 | kill | **survived** (targeted + full suite) | `_reset_flags` filters by `file_id` + `active` only, so a cross-drive request resets flags and enqueues before the 404 |
| R2 | `dismiss_chapter_suggestions`: `_require_allowed` moved after `_dismiss` | app/routers/chapter_suggestions.py:115 | kill | killed by test_chapter_suggestions::test_dismiss_and_access_gates | |
| R3 | `edit_summary`: `_require_file_in_drive` moved out of `_apply` to after the UPDATE | app/routers/summaries.py:376 | kill | **survived** (targeted + full suite) | a cross-drive edit is written, then 404 |
| X1 | `reindex_file`: drop `(file_id, t) in _reindex_in_flight` from the gate | app/routers/files.py:283 | kill | killed by test_reindex_endpoint::TestReindexAlreadyQueued::test_two_concurrent_requests_enqueue_once | |
| X2 | `reindex_file`: `finally` no longer releases the claim | app/routers/files.py:329-330 | kill | killed by test_reindex_endpoint::TestReindexHappyPath::test_multiple_tasks_reset_together | (module-level set leaks across tests) |
| X2b | `reindex_file`: release only on success (no release on exception) | app/routers/files.py:329-330 | kill | killed by test_reindex_endpoint::TestReindexAlreadyQueued::test_a_failed_request_releases_its_claim | |
| X3 | `reindex_file`: claim after `await asyncio.to_thread(_reset_flags)` instead of before | app/routers/files.py:324-326 | kill | killed by test_two_concurrent_requests_enqueue_once | |
| F1 | `refine_file`: `start_refine_job` called inside the `_read` closure (worker thread, no loop) | app/routers/refine.py:121-125 | kill | **survived** (targeted + full suite; 1 warning, the never-awaited coroutine) | `create_task` raises `RuntimeError` in the thread, `start_refine_job` swallows it, returns a job_id, and the job never runs |
| F1b | `refine_folder._enqueue`: `start_refine_job` called inside `to_thread` | app/routers/refine.py:191-192 | kill | **survived** (targeted + full suite) | same silent no-op as F1, per file |
| F2 | `refine_file`: `start_refine_job(file_id, [], resolved)` | app/routers/refine.py:125 | kill | **survived** (targeted + full suite) | router tests replace `start_refine_job` with a mock and never inspect its `chunk_ids` |
| F2b | `refine_folder`: `start_refine_job(fid, [], resolved)` | app/routers/refine.py:192 | kill | **survived** (targeted + full suite) | same |
| F3 | `refine_chunk_ids`: drop the `try/except Exception: return []` | app/workers/refine.py:869-878 | live | survived | want=live: no normal-use path makes that query raise; the guard only converts a DB failure into a silent empty job |
| Q1 | `_stream_answer`: per-delta loop yields progressive `citation` events before that delta's `answer_chunk` | app/rag/service.py:1751-1772 | kill | **survived** (targeted + full suite) | `test_rag_service` asserts citations follow the last answer chunk, but no fixture has one delta that carries both answer text and a citation |
| Q2 | `_build_progressive_citation_event`: drop the `(file_id, location)` dedup | app/rag/service.py:1865-1866 | kill | **survived** (targeted + full suite) | no stream fixture repeats a citation; the terminal list has its own dedup, the progressive stream would show the duplicate with a new index |
| K1 | `coarse_retrieve._query`: COUNT runs on the KNN `engine.connect()` connection instead of a second `get_search_db()` session | app/rag/coarse_retriever.py | live | killed by test_rag_coarse_retriever::TestCoarseRetrieve::test_returns_top_k_sorted_by_distance | want=live: same DB, same reads. The kill comes from the test double, which feeds the count through a separately patched session (`assert 1 == 200`), not from a behaviour difference |
| K2 | `_query` returns `(drive_file_count, rows)` | app/rag/coarse_retriever.py | kill | killed by test_returns_top_k_sorted_by_distance | |
| K2b | caller unpacks `drive_file_count, rows` | app/rag/coarse_retriever.py | kill | killed by test_returns_top_k_sorted_by_distance | |

## Findings

Every finding below is a surviving `want=kill` mutant, confirmed against the full suite (3555 passed, 2 skipped for each).

1. **S1 `edit_summary`: nothing tests whether the read-decide-write runs in one transaction.** Splitting the snapshot read and the UPDATE into two offloaded calls passes everything.
2. **S2 `revert_summary`: same gap.** The 404/400 decision and the UPDATE can be split.
3. **S3 `regenerate_detailed_summary`: the 409 edit check and the wipe can be split.** `test_conflict_check_and_delete_share_one_session` only exercises the 409 branch, where no wipe happens. It counts sessions handed to `_fetch_detailed_edit_state` and checks that `_delete_detailed_summary` is unused, and both still hold when the wipe moves to a second session. The TOCTOU property it was written for is unguarded.
4. **C1 `dismiss_chapter_suggestions`: nothing tests whether the 404/409 decision and the UPDATE share a transaction.** The `AND status='pending'` in the UPDATE keeps the data safe. What breaks is the response: a raced approve returns 200 instead of 409.
5. **A1 `resolve_failed_job`: nothing tests whether the 404 check and the flag + JobRecord write share a transaction.** If the row is deactivated in between, the endpoint returns `resolved` and writes nothing.
6. **R1 `reindex_file`: no test checks that a cross-drive or 404 reindex leaves the data untouched.** Moving the drive check after the flag reset and enqueue passes. Existing tests assert only the 404 status, never that flags and the queue are unchanged. This is the drive boundary.
7. **R3 `edit_summary`: no test checks that a cross-drive edit leaves the row unchanged.** With the drive check after the UPDATE, the other drive's summary is overwritten and the caller still gets 404. This is the drive boundary.
8. **F1 `refine_file`: nothing tests whether `start_refine_job` runs on the loop.** This is the new contract: "needs a running loop". Calling it from the worker thread makes `asyncio.create_task` raise `RuntimeError`. `start_refine_job` catches it (`except RuntimeError: pass`) and returns a job_id for a job that never runs. The router tests mock `start_refine_job`, and the worker tests call it with a loop present, so this silent failure goes unnoticed.
9. **F1b `refine_folder`: same as F1, for each file in the folder.**
10. **F2 `refine_file`: no test checks that the chunk ids reach the job.** Passing `[]` makes a refine job that has nothing to snapshot, and nothing fails.
11. **F2b `refine_folder`: same as F2.**
12. **Q1 `_stream_answer`: no test checks event order within one delta.** Progressive `citation` events can be yielded before that delta's `answer_chunk`. The ordering assertion exists, but no fixture puts answer text and a citation in the same delta. This predates the commit, which only wrapped the call in `to_thread`.
13. **Q2 `_build_progressive_citation_event`: no test covers progressive dedup.** Without the `(file_id, location)` dedup, a repeated citation streams twice with two indices. This predates the commit.

Not findings:
- **Guard reach.** All 13 offload reverts (G1-G13) across 9 router/rag modules were killed by `test_no_sync_db_call_runs_on_the_event_loop`. That includes the cross-module `execute_search_compare` and both `def` -> `async def` reverts.
- **Reindex claim.** The `_reindex_in_flight` gate, its claim order and its release are fully guarded (X1-X3).
- **K1.** Its kill is an artefact of the test double, not a behaviour check.

TOTAL: 13 findings
