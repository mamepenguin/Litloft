# r2 review of 4857862 (intelligence): loft reset re-decided under the write lock

Scope: only what 4857862 changes relative to f5e46bd. Code read at 4857862; baseline is f5e46bd~1 `_reset_loft_refs_with_new_vtt`.

## Verdict on the r1 finding

Closed. Every writer of `whisper_indexed` / `transcript_chunks` for a loft goes through `get_search_db()`, which takes `_write_lock` before the session's first query and holds it through commit (`app/database.py:1926-1948`): `_persist_transcript` (whisper.py:1420-1503, chunks + flag + JobRecord in one transaction), `_index_loft_vtt` (whisper.py:1759-1830), `_mark_loft_stt_temp_consumed` (whisper.py:159), `_resolve` (whisper.py:840). The re-check at `app/indexer.py:663-680` reads the row, `has_chunks` and the filesystem inside the same locked transaction, so a whisper commit can no longer land between the decision and the write. Reproduced by mutation: replacing the re-check with `confirmed = list(batch)` fails `test_stt_finishing_during_the_scan_is_not_reset`.

The remaining window (whisper commit -> temp audio unlink) is pre-existing; see B2.

## Equivalence with f5e46bd~1

- Temp-audio precedence: `_loft_needs_reset` (indexer.py:121-140) checks `stt_temp.m4a` first and returns True even when chunked. Same as baseline.
- Chunked skip: `chunked` is re-read in the locked query (`_loft_refs(session, batch)`), not carried from the scan. Same as baseline.
- Unlistable: `is_file()` OSError and `match_siblings` OSError both return None, counted once at scan. Same as baseline, except a folder that becomes unlistable between scan and re-check (B1).
- Reset count: sum of `update()` rowcounts over confirmed ids. Same as baseline.
- Rows that left the filter between scan and re-check (deactivated, flag already False because a job is in flight) are not returned by `_loft_refs(session, batch)` and so are not touched. Correct.

## Findings

### B1. A folder that becomes unlistable between the scan and the re-check is skipped without being counted
- File: `app/indexer.py:666-670` (with `_loft_needs_reset` returning None at 134/140).
- Scenario: the scan lists the folder and makes the loft a candidate; before its batch takes the lock the folder stops being listable (mount drop). `None` is falsy, so the row is not reset and not added to `unlistable_count`; the warning has already been logged at 654-658. Baseline would have counted it.
- Effect: the loft keeps `whisper_indexed=True` and is retried on the next reconcile. Nothing is written wrongly; only the warning undercounts in a seconds-wide window. Not a normal-use defect.
- Verified: by reading; the None/False distinction at the re-check is not observed by any code path.

### B2. Pre-existing: a reconcile between whisper's commit and the temp-audio unlink still resets the loft (not worse than before f5e46bd)
- File: `app/workers/whisper.py:1497-1503` (flag committed with chunks), then `_index_tfidf_keywords` (1505, embedding work), the WS emit (1141-1152), and only then `_cleanup_loft_stt_temp` in the `finally` at 987.
- Scenario: Media Import STT job commits chunks + `whisper_indexed=True`; while tfidf keywords are being computed (seconds), a reconcile (scan.complete arrives twice per STT item) sees flag True + chunks + temp audio still present -> temp-audio precedence -> reset. The re-run starts after the unlink, finds no temp audio, takes the VTT path, and `_index_loft_vtt` replaces the STT transcript with captions if a VTT exists.
- Comparison: f5e46bd~1 made the same decision under the lock from the same state, so this window existed identically before f5e46bd; 4857862 neither opens nor narrows it. Reported for completeness. Closing it would need the temp audio to be removed (or marked consumed) inside the same transaction that commits the transcript, or the unlink moved before `_index_tfidf_keywords`.
- Verified: by reading the call order in `index_whisper` / `_do_transcribe_and_index` / `_persist_transcript`; not reproduced in a test.

### B3. Filesystem work under the lock is bounded to candidates, but a pre-existing requeue loop keeps some lofts permanent candidates
- File: `app/indexer.py:663-680`; `app/workers/whisper.py:1765-1772` (empty VTT -> `whisper_indexed=True`, no chunks).
- Under the lock each candidate costs one `is_file()` and, if unchunked, one `scandir` of its folder; batches of `_RESET_BATCH_SIZE`=500 release the lock between them. In normal use candidates are only lofts that actually need a re-run, so this is small. The one path that grows it: a loft whose VTT parses to zero cues is marked indexed with no chunks, so every reconcile resets and requeues it, and each such loft costs a folder listing under the lock every reconcile. That loop and its per-candidate cost are the same as f5e46bd~1 (which listed every loft under the lock), so this is not a regression. A first run after many VTTs appear at once (e.g. a bulk caption refresh) holds the lock for up to 500 listings per batch; on a very slow mount that can be tens of seconds per batch, but each of those lofts genuinely needs resetting.
- Verified: by reading; mutation M11 below confirms non-candidate folders are not listed under the lock.

## Test mutation results (worktree at 4857862, Docker `Dockerfile.test`, one mutation at a time, restored with `git checkout`)

| Mutation | Killed by |
|---|---|
| M1 re-check removed (`confirmed = list(batch)`) | `test_stt_finishing_during_the_scan_is_not_reset` |
| M2 re-check uses chunked=False (stale chunk state) | `test_stt_finishing_during_the_scan_is_not_reset` |
| M3 temp-audio OSError returns False instead of None | `test_spec_addon_001_reconcile_warns_only_when_a_folder_was_skipped[1]`, `..._unlistable_directories_are_skipped_and_counted_once[unsearchable]` |
| M3b sibling-listing OSError returns False instead of None | `..._unlistable_directories_are_skipped_and_counted_once[searchable]` |
| M4 only the first batch written | `test_every_candidate_is_reset_across_write_batches` |
| M5 chunked skip removed | `test_stt_finishing_during_the_scan_is_not_reset`, `test_spec_addon_001_loft_with_chunks_is_not_requeued` |
| M11 re-check queries all refs instead of the batch | `test_reconcile_lists_only_candidate_folders_while_holding_a_write_session` |
| M6 vision: claim not discarded on failed `_mark_pending` | `test_a_failed_pending_write_does_not_leave_the_file_queued` |
| M7 `_unlisted` exempts by file instead of (file, function) | `test_pending_exempts_a_function_not_its_whole_file` |
| M8 `_stale` compares by file | `test_pending_exempts_a_function_not_its_whole_file` |
| M9 last definition decides async-ness | `test_a_name_counts_as_async_only_if_every_definition_is[sync-and-async-share-a-name]` |
| M10 any async definition makes the name async | same |

Baseline at 4857862: the three test files pass (97 passed). No surviving mutant.

TOTAL: 3 findings
