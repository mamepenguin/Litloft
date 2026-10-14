# r1 mutation review — intelligence `f5e46bd`

Worktree: detached at `f5e46bd`. Each mutant applied alone, image rebuilt, targeted tests run; every mutant that survived the targeted tests was re-run against the full suite (`tests/`, baseline 3549 passed / 2 skipped) before being recorded as survived.

| # | mutation | file:line | want | result | note |
|---|---|---|---|---|---|
| 1 | re-add `await self.reconcile()` at end of `start()` | app/indexer.py:208 | kill | killed by test_enqueue_dedup.py::test_start_returns_without_waiting_for_the_first_reconcile | TimeoutError |
| 2 | `_reconciliation_worker`: sleep then reconcile | app/indexer.py:1595 | kill | killed by test_enqueue_dedup.py::test_start_returns_without_waiting_for_the_first_reconcile | reconcile never starts within 2 s |
| 3 | wrap the whole filesystem loop in `with get_search_db()` | app/indexer.py:618-640 | kill | killed by test_loft_vtt_sidecar.py::TestReconcile::test_reconcile_touches_no_file_while_holding_a_write_session | |
| 4 | drop `if chunked: continue` | app/indexer.py:632 | kill | killed by test_loft_vtt_sidecar.py::TestReconcile::test_spec_addon_001_loft_with_chunks_is_not_requeued | |
| 5 | swap precedence: `if chunked: continue` before the temp-audio check | app/indexer.py:625 | kill | killed by test_reconcile_drift.py::TestLoftTempAudioReset::test_temp_audio_resets_even_when_loft_already_has_chunks | |
| 6 | drop `IndexedFile.whisper_indexed.is_(True)` from the batched update | app/indexer.py:658 | live | survived (targeted) | equivalent: setting False on a row already False changes nothing; only the logged `reset_count` differs. A row re-indexed between read and write is True either way, so the filter does not protect it |
| 7 | `_RESET_BATCH_SIZE = 1` | app/indexer.py:54 | live | survived (targeted) | equivalent: only the transaction count changes |
| 8 | batch slice `to_reset[i:i + _RESET_BATCH_SIZE - 1]` (drops one row per batch) | app/indexer.py:652 | kill | survived (full suite: 3549 passed, 2 skipped) | |
| 9 | `_RESET_BATCH_SIZE = 100000` (single IN list past SQLite's 32766 bound-parameter limit) | app/indexer.py:54 | kill | survived (full suite: 3549 passed, 2 skipped) | |
| 10 | temp-audio `except OSError:` → `pass` (fall through to the chunked / VTT checks) | app/indexer.py:628 | kill | survived (full suite: 3549 passed, 2 skipped) | only differs for a chunked loft in an unlistable folder: skipped without being counted, so no warning |
| 11 | retrieval_keywords: `await asyncio.to_thread(_has_retrieval_keywords, file_id)` → direct call | app/workers/retrieval_keywords.py:206 | kill | killed by test_event_loop_discipline.py::test_no_sync_db_call_runs_on_the_event_loop | |
| 12 | auto_tags: `await asyncio.to_thread(_get_existing_tags, file_id)` → direct call | app/workers/auto_tags.py:227 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 13 | chapter_suggestions: `await asyncio.to_thread(_active_row)` → `_active_row()` | app/workers/chapter_suggestions.py:283 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 14 | auto_tags: kwargs form `to_thread(_save_suggested_tags, file_id=...)` → direct call | app/workers/auto_tags.py:284 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 15 | auto_tags: `to_thread(_generate_candidates, ...)` → direct call | app/workers/auto_tags.py:238 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | transitive (helper reaches a session through other helpers) |
| 16 | retrieval_keywords: inline the `_save` closure back as `with get_search_db()` in the async body | app/workers/retrieval_keywords.py:260 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 17 | retrieval_keywords: keep the closure, call `_save()` directly | app/workers/retrieval_keywords.py:270 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 18 | retrieval_keywords: `await asyncio.to_thread(_save())` (call evaluated on the loop) | app/workers/retrieval_keywords.py:270 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 19 | retrieval_keywords: `(lambda: _save())()` (immediately-invoked lambda) | app/workers/retrieval_keywords.py:270 | live | survived | out of the detector's stated scope: a lambda is treated as off-loop by design, and nobody writes an IIFE in Python; not counted |
| 20 | detector: `_PENDING` matched by file only (`o[0] not in {p[0] for p in _PENDING}`) | tests/test_event_loop_discipline.py:319 | kill | survived | a new offending async function in any of the 13 files already in `_PENDING` (all of `routers/files.py`, `routers/summaries.py`, `rag/service.py`, ...) would pass |
| 21 | detector: stale-entry check matched by file only (an entry counts as live if its file has any offender) | tests/test_event_loop_discipline.py:328 | kill | survived | a fixed function's entry stays in `_PENDING` and keeps its exemption for a later regression in that same function |
| 22 | detector: remove `visit_Lambda = _sync` | tests/test_event_loop_discipline.py:253 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop (pickup.py lambdas) and test_detector_allows_non_blocking_shapes | |
| 23 | detector: stop binding `from app.x import y` names | tests/test_event_loop_discipline.py:131 | kill | killed by test_detector_follows_imports, test_pending_list_only_names_live_offenders | |
| 24 | detector: stop resolving `self.method()` / `cls.method()` | tests/test_event_loop_discipline.py:158 | kill | killed by test_detector_catches_blocking_shapes | |
| 25 | detector: disable transitive propagation (`changed = False`) | tests/test_event_loop_discipline.py:198,206 | kill | killed by test_detector_catches_blocking_shapes, test_pending_list_only_names_live_offenders | |
| 26 | detector: a name defined both sync and async in one module counts as async if *any* definition is (`get(key, False) or is_async`) | tests/test_event_loop_discipline.py:172 | kill | survived | the stated rule ("async only if every definition is") has no self-test; a sync DB method sharing its name with an async method elsewhere in the same module would stop being blocking |
| 27 | detector: drop the same-module local-def lookup in `resolve()` for bare names | tests/test_event_loop_discipline.py:153 | kill | killed by test_detector_catches_blocking_shapes, test_pending_list_only_names_live_offenders | |
| 28 | video_visual: remove `_stage_lock` (`async with` → `if True:`) | app/workers/video_visual.py:638 | kill | killed by test_video_visual_worker.py::TestEnqueue::test_two_concurrent_requests_stage_one_run (8/8 runs) | |
| 29 | video_visual: remove the in-transaction in-flight recheck in `_insert_run` | app/workers/video_visual.py:620-621 | kill | killed by test_two_concurrent_requests_stage_one_run (8/8 runs) | |
| 30 | video_visual: remove both lock and recheck | app/workers/video_visual.py:620,638 | kill | killed by test_two_concurrent_requests_stage_one_run, but only 6/8 runs (passed 2/8, and passed in the first targeted run) | timing-dependent: the test relies on two threads interleaving; baseline passed 8/8. Not counted as a finding since each half alone is killed deterministically, but a full revert of the fix slips through about 1 run in 4 |
| 31 | vision: `self._queued.add` moved after the awaited pending write | app/workers/vision.py:629 | kill | killed by test_vision_worker.py::TestEnqueue::test_two_concurrent_requests_are_accepted_once | IntegrityError on the second insert |
| 32 | vision: drop the `try/except BaseException: self._queued.discard(...)` around the pending write | app/workers/vision.py:630-634 | kill | survived (full suite: 3549 passed, 2 skipped) | |
| 33 | purge: `purge_drive(drive)` direct instead of `to_thread` | app/purge.py:361 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 34 | purge: `_indexed_drives()` direct in all three callers | app/purge.py:195,307,344 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 35 | main lifespan: `recover_video_visual()` direct (aliased import) | app/main.py:129 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 36 | main lifespan: `cleanup_orphaned_embeddings()` direct | app/main.py:104 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 37 | vision: `_load_image_bytes(file_id)` direct | app/workers/vision.py:785 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 38 | vision: `_in_search_txn(_clear_pending, file_id)` direct | app/workers/vision.py:769 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | higher-order helper resolved |
| 39 | refine: `_apply()` closure called directly | app/workers/refine.py:807 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 40 | summaries: `index_metadata_batch([file_id])` direct (cross-module) | app/workers/summaries.py:636 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 41 | pickup: `_active_drives()` direct | app/workers/pickup.py:122 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |
| 42 | indexer `reconcile()`: `self._reset_loft_refs_with_new_vtt()` direct instead of `to_thread` | app/indexer.py:459 | kill | killed by test_no_sync_db_call_runs_on_the_event_loop | |

## Findings (surviving want=kill mutants)

1. **#8 — reset batching can drop rows unnoticed** (`app/indexer.py:652`). No test resets more lofts than `_RESET_BATCH_SIZE`, so any slicing/range bug in the batched update survives. Unguarded property: every loft in `to_reset` gets reset, regardless of how many batches it takes. A test that monkeypatches `_RESET_BATCH_SIZE` to 2 and resets 3+ lofts would kill it.
2. **#9 — the batch size bound is unguarded** (`app/indexer.py:54`). Raising the constant past SQLite's bound-parameter limit passes every test. Same property as #1 (no IN list overflows the limit). A cheap test like the one in #1 does not kill this one, so it would need a test that pins the constant below the limit.
3. **#10 — the skip counter misses chunked lofts whose temp-audio check raised** (`app/indexer.py:628`). With the `OSError` branch turned into `pass`, a chunked loft in an unlistable folder is skipped without being counted, so no warning is logged. Unlistable folders are only tested on unchunked lofts. Impact is limited to the log line.
4. **#20 — `_PENDING` exemption granularity is unguarded** (`tests/test_event_loop_discipline.py:319`). Matching by file only lets a new blocking async function in any of the 13 pending files pass. This was confirmed by adding an offender to `routers/files.py`: the original detector fails, the mutant passes. Unguarded property: the exemption is per (file, function).
5. **#21 — stale `_PENDING` entries are unguarded at function granularity** (`tests/test_event_loop_discipline.py:328`). If an entry counts as live whenever its file still has an offender, a fixed function keeps its exemption.
6. **#26 — the sync/async same-name merge rule has no self-test** (`tests/test_event_loop_discipline.py:172`). Flipping "async only if every definition is" to "async if any is" passes. A blocking sync method that shares its name with an async def in the same module would no longer be detected.
7. **#32 — `vision.enqueue` does not release `_queued` on a failed pending write** (`app/workers/vision.py:630-634`). Dropping the `except BaseException: self._queued.discard(...)` passes the full suite. Unguarded property: after a transient DB error in `_mark_pending`, the file can be enqueued again. Without the discard, every later request answers `already_queued` until the process restarts.

Observation, not counted: #30 (video_visual lock and recheck both removed) is killed in only 6 of 8 runs, because `test_two_concurrent_requests_stage_one_run` depends on thread interleaving.

TOTAL: 7 findings
