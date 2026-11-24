# Mutation review 2: intelligence frame OCR read interval (c7ef2fa)

Targeted set: tests/test_spec_addon_122_*.py tests/test_spec_addon_123_*.py tests/test_frame_page_ocr_readers.py tests/test_frame_page_ocr_queue.py tests/test_frame_ocr_worker_reread.py tests/test_reindex_endpoint.py tests/test_frame_page_ocr_schema.py tests/test_spec_addon_117_loft_media_queue.py
Baseline: 177 passed.

| id | file | change | invariant | want | result | killing test |
|---|---|---|---|---|---|---|
| M01 | app/workers/frame_ocr.py | `READ_HASH_BITS = 8` -> `READ_HASH_BITS = 9` | I1 | kill (8-bit threshold is the rule) | survived | - |
| M02 | app/workers/frame_ocr.py | `READ_GAP_SECONDS = 3.0` -> `READ_GAP_SECONDS = 2.0` | I1 | kill (3 s gap is the rule) | killed | tests/test_frame_page_ocr_readers.py::test_spec_addon_066_a4_equal_text_continues_the_open_segment |
| M03 | app/workers/frame_ocr.py | `< READ_HASH_BITS                     or t -` -> `< READ_HASH_BITS                     and t -` | I1 | kill (both conditions must hold to read) | killed | tests/test_spec_addon_122_frame_ocr_selection.py::test_spec_addon_122_i1_a_frame_is_read_three_seconds_after_the_last_read_and_not_sooner |
| M04 | app/workers/frame_ocr.py | `last_read_time = t` -> `(deleted)` | I1 | kill (gap must be measured from last read frame) | killed | tests/test_spec_addon_122_frame_ocr_selection.py::test_spec_addon_122_i1_a_frame_is_read_three_seconds_after_the_last_read_and_not_sooner |
| M05 | app/workers/frame_ocr.py | `MATCH_IOU = 0.8` -> `MATCH_IOU = 0.6` | I3 | kill (IoU 0.8 threshold) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i3_a_box_matches_at_an_iou_of_at_least_0_8[iou-0.78-does-not] |
| M06 | app/workers/frame_ocr.py | `if iou >= MATCH_IOU and` -> `if iou > MATCH_IOU and` | I3 | kill ('at least 0.8' boundary) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i3_a_box_matches_at_an_iou_of_at_least_0_8[iou-0.80-matches] |
| M07 | app/workers/frame_ocr.py | `UNCHANGED_MEAN = 2.0` -> `UNCHANGED_MEAN = 3.0` | I3 | kill (mean diff 2.0 threshold) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i3_a_window_mean_of_two_or_more_is_recognised_again[mean-2.0-is-changed] |
| M08 | app/workers/frame_ocr.py | `side = min(box_width, box_height)` -> `side = max(box_width, box_height)` | I3 | kill (window = shorter side, so long lines do not average a change away) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i3_a_small_change_in_a_long_box_is_recognised_again[horizontal-middle] |
| M09 | app/workers/frame_ocr.py | `box.grey = picked.grey` -> `box.grey = grey` | I3 | kill (compare against the frame where result was recognised, not a reusing frame) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i3_a_reused_box_is_compared_with_the_frame_it_was_recognised_in |
| M10 | app/workers/frame_ocr.py | `taken.add(best_index)` -> `(deleted)` | I3 | kill (previous box may be taken once) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i3_a_picked_box_is_taken_even_when_its_region_changed |
| M11 | app/workers/frame_ocr.py | `taken.add(best_index)         picked = previous[best_index]         if` -> `picked = previous[best_index]         if _region_unchanged(grey, picke` | I3 | kill (picked box is taken whether or not it passes) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i3_a_picked_box_is_taken_even_when_its_region_changed |
| M12 | app/workers/frame_ocr.py | `previous_boxes = boxes` -> `previous_boxes = boxes or previous_boxes` | I5 | kill (failed frame's boxes (none) must not let older boxes be reused) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_i5_a_failed_frame_stores_no_text_and_offers_no_boxes[detect] |
| M13 | app/workers/frame_ocr.py | `box.line = picked.line` -> `box.line = picked.line if picked.line is not None else ''` | I4 | kill (reused dropped box gives no line) | survived | - |
| M14 | app/workers/frame_ocr.py | `if open_segment is not None and text != open_segment.text:` -> `if open_segment is not None:` | 066-I2/item4 | kill (equal text continues the open segment) | killed | tests/test_frame_page_ocr_readers.py::test_spec_addon_066_a4_equal_text_continues_the_open_segment |
| M15 | app/workers/frame_ocr.py | `open_segment.end = result.last_time + 1.0` -> `open_segment.end = result.last_time` | 066-I2/item4 | kill (last segment ends at last decoded frame + 1 s) | killed | tests/test_frame_page_ocr_readers.py::test_spec_addon_066_i1_i2_landscape_reads_the_first_and_the_three_second_change |
| M16 | app/workers/frame_ocr.py | `if open_segment is None and text:` -> `if open_segment is None:` | 066-I2/item4 | kill (empty frame starts no segment) | survived | - |
| M17 | app/workers/frame_ocr.py | `if result.engine_errors:         logger.warning(             "Frame OC` -> `(deleted)` | I8 | kill (engine failure on any frame keeps old read) | killed | tests/test_spec_addon_122_frame_ocr_reread.py::test_spec_addon_122_i8_an_engine_raising_on_every_frame_was_asked_and_still_keeps_the_read |
| M18 | app/workers/frame_ocr.py | `if result.stalled or (result.exit_status not in (0, None)):         if` -> `if result.stalled:         if not _reachable(path):             logger` | I8 | kill (ffmpeg nonzero exit is early end on re-read) | killed | tests/test_spec_addon_122_frame_ocr_reread_text.py::test_spec_addon_122_i8_an_incomplete_reread_that_read_text_keeps_the_earlier_read[ended-early] |
| M19 | app/workers/frame_ocr.py | `if row is None:                 return False             row.frame_ocr` -> `if row is None:                 return False             return True` | I8 | kill (incomplete re-read sets rule 2 (no endless retry)) | killed | tests/test_spec_addon_122_frame_ocr_reread.py::test_spec_addon_122_i8_an_incomplete_reread_keeps_the_earlier_read_and_sets_rule_two[unreadable] |
| M20 | app/workers/frame_ocr.py | `row.frame_ocr_indexed = False             row.frame_ocr_rule = FRAME_O` -> `row.frame_ocr_indexed = False` | I6 | kill (stored read writes rule 2) | killed | tests/test_spec_addon_122_frame_ocr_reread_text.py::test_spec_addon_122_i6_a_first_read_is_stored_under_rule_two |
| M21 | app/workers/frame_ocr.py | `frames; keeping the earlier read",             file_id,         )     ` -> `frames; keeping the earlier read",             file_id,         )     ` | I8 | kill (times_failed on re-read sets rule 2) | killed | tests/test_spec_addon_122_frame_ocr_reread.py::test_spec_addon_122_i8_an_incomplete_reread_keeps_the_earlier_read_and_sets_rule_two[times-failed] |
| M22 | app/workers/frame_ocr.py | `"Frame OCR for %s decoded no frame; keeping the earlier read",        ` -> `"Frame OCR for %s decoded no frame; keeping the earlier read",        ` | I8 | kill (no frame decoded keeps old rows) | survived | - |
| M23 | app/workers/frame_ocr.py | `int(frame_ocr_rule) < FRAME_OCR_RULE)` -> `int(frame_ocr_rule) <= FRAME_OCR_RULE)` | I6/I7 | kill (rule 2 read is current, not outdated) | killed | tests/test_spec_addon_122_frame_ocr_outdated.py::test_spec_addon_122_i7_index_details_show_a_rule_two_read_as_done |
| M24 | app/workers/frame_ocr.py | `and mode == "on_index"     )` -> `)` | I7 | kill (manual/false never re-reads) | killed | tests/test_spec_addon_122_frame_ocr_outdated.py::test_spec_addon_122_i7_index_details_show_an_outdated_read_as_not_done |
| M25 | app/indexer.py | `if is_reread:                             self._reread_running.add(tas` -> `pass` | I11 | kill (running re-read must not hold backlog (after store step row is no longer outdated)) | killed | tests/test_frame_ocr_worker_reread.py::test_spec_addon_122_i11_a_running_reread_past_its_store_does_not_hold_a_backlog_fetch |
| M26 | app/indexer.py | `return bool(frame_ids - rereads)` -> `return bool(frame_ids)` | I11 | kill (queued re-read must not hold backlog) | killed | tests/test_spec_addon_122_loft_fetch_gate.py::test_spec_addon_122_i11_a_queued_reread_does_not_hold_a_backlog_fetch_and_a_first_read_does |
| M27 | app/indexer.py | `if (             self._queues[TaskType.FRAME_SCAN].qsize()            ` -> `(deleted)` | I11 | kill (native frame_scan still holds backlog) | survived | - |
| M28 | app/routers/files.py | `if raise_reread:             await manager.raise_task_priority(file_id` -> `return JSONResponse(` | I10 | kill (already_queued re-read is raised to 100) | killed | tests/test_spec_addon_122_frame_ocr_outdated.py::test_spec_addon_122_i10_a_reindex_of_a_queued_outdated_read_raises_it_to_100 |
| M29 | app/routers/files.py | `# A fresh task in the same request must not leave the re-read at -10. ` -> `(deleted)` | I10 (multi-task) | kill (re-read raised even when other tasks are fresh) | killed | tests/test_reindex_endpoint.py::TestReindexAlreadyQueued::test_a_queued_reread_is_raised_when_a_fresh_task_comes_with_it |
| M30 | app/database.py | `if "frame_ocr_rule" not in cols:         conn.execute(text(           ` -> `if True:         conn.execute(text(             "ALTER TABLE indexed_f` | I6 | kill (migration runs twice) | killed | tests/test_spec_addon_122_frame_ocr_outdated.py::test_spec_addon_122_i6_the_migration_adds_a_nullable_rule_column_twice_leaving_rows_null |
| M31 | app/database.py | `ADD COLUMN frame_ocr_rule INTEGER"` -> `ADD COLUMN frame_ocr_rule INTEGER DEFAULT 2"` | I6 | kill (existing rows stay NULL (outdated)) | killed | tests/test_spec_addon_122_frame_ocr_outdated.py::test_spec_addon_122_i6_the_migration_adds_a_nullable_rule_column_twice_leaving_rows_null |
| M01b | app/workers/frame_ocr.py | `READ_HASH_BITS = 8` -> `READ_HASH_BITS = 16` | I1 | kill (8 bits for reading, not the scan's 16) | killed | tests/test_frame_page_ocr_readers.py::test_spec_addon_066_a4_equal_text_continues_the_open_segment |
| M32 | app/workers/frame_ocr.py | `"Frame OCR lost the engine partway for %s; nothing written",          ` -> `"Frame OCR lost the engine partway for %s; nothing written",          ` | I8 | kill (engine lost on re-read changes nothing, rule included) | killed | tests/test_spec_addon_123_frame_box_reuse.py::test_spec_addon_123_item_4_an_engine_lost_between_the_two_calls_writes_nothing[re-read] |
| M33 | app/workers/frame_ocr.py | `if paused is not None and paused():                 last_data = time.m` -> `if paused is not None and paused():` | I9 | kill (paused time not counted toward 120 s stall) | survived | - |
| M34 | app/workers/frame_ocr.py | `if not outdated:             return True` -> `(deleted)` | I6/I7 | kill (a current (rule 2) read is not read again) | killed | tests/test_spec_addon_122_frame_ocr_reread.py::test_spec_addon_122_item_8_a_rule_two_read_is_closed_without_asking_for_the_engine |

Notes on truncated changes: M21 replaces `return _keep_earlier_read(file_id)` with `return False` in `_reread`'s `times_failed` branch. M22 replaces `return _keep_earlier_read(file_id)` in `_reread`'s `frames == 0` branch with `_store_read(file_id, [])` + `_build_rows(file_id)` (the first-read behaviour). M32 replaces `return False` with `return _keep_earlier_read(file_id)` in `_reread`'s `engine_lost` branch. M25 replaces the `if is_reread: self._reread_running.add(...)` lines with `pass`. M27 deletes the FRAME_SCAN queued/processing check at the top of `_native_frame_busy`.

Summary: 34 mutants (33 want=kill, all declared kill), 28 killed, 6 survived (M01, M13, M16, M22, M27, M33). M16 is an equivalent mutant.

## Findings

### F1 (M22) A re-read that decodes no frame is not tested to keep the earlier read
- Invariant: I8 lists "no frame decoded" among incomplete re-reads that must leave `video_frame_texts`, `text_content`, `fts_text_content`, `frame_ocr_read` / `frame_ocr_indexed` untouched and set rule 2. The I8 parametrisations cover `unreadable`, `times-failed`, `ended-early`, `one-frame-raised` and engine-every-frame, but not `frames == 0` with ffmpeg exit 0.
- Defect let through: if `_reread`'s `frames == 0` branch fell back to the first-read behaviour (store an empty read), an outdated video's frame text, embeddings and FTS rows would be deleted and the row closed at rule 2, so no automatic pass ever re-reads it. The search index silently loses the video's on-screen text.
- Normal-use condition: an outdated video whose decode under the current ffmpeg yields no frames while exiting 0 (a file replaced or truncated in place since the first read, or a container ffmpeg now opens but decodes nothing from). Rare.
- Frequency 1, impact 8 (silent, unrecoverable loss of stored text until a manual reindex). Meets the "frequency >= 1 and impact >= 8" bar as a test gap: add `no-frame` to the I8 parametrisation in tests/test_spec_addon_122_frame_ocr_reread.py.

### F2 (M01) The 8-bit read threshold is not pinned at its value
- Invariant: I1 (read when the hash differs by at least 8 bits). `READ_HASH_BITS = 9` survives; `16` is killed (by test_spec_addon_066_a4_equal_text_continues_the_open_segment), so only a coarse bound is tested. The I1 selection test uses flips that move the hash far past any threshold, so only the gap is measured.
- Defect let through: a threshold drifting slightly upward (9..15) skips frames whose hash changed by exactly 8..threshold-1 bits; if the change persists, later frames still compare against the old read and also stay below it, so that text is never read.
- Normal-use condition: a small on-screen change (a line of text added to a mostly static slide) that moves the 256-bit hash by 8 to ~15 bits.
- Frequency 1 (only after a regression of the constant), impact 3 (some on-screen text missing from search, noticed only when searching for it). Below the bar; report only.

### F3 (M13) A reused box the engine dropped is not tested in the middle of a frame's lines
- Invariant: I4 (a reused dropped box gives no line). Mutant gives `''` instead of `None`; the test test_spec_addon_123_i4_a_reused_box_the_engine_dropped_gives_no_line survives because the dropped box sits at an edge of the joined text and `ContentExtractor.chunk_text` strips the resulting leading/trailing newline.
- Defect let through: with a dropped box between two others, the stored text gains a blank line, and a static frame read twice (first with `None`, then reusing `''`) no longer equals the open segment's text, so one segment splits into two with the same visible text.
- Normal-use condition: any video where recognition drops a low-confidence box that sits between two kept lines and the scene stays unchanged across reads.
- Frequency 3, impact 2 (an extra blank line or an extra, duplicate-text segment boundary in search results). Below the bar; report only.

### F4 (M27) Native `frame_scan` holding back the `.loft` backlog is not tested
- Invariant: I11 (a backlog `.loft` download is still held back by any other native `frame_scan` or `frame_ocr` task). Removing the FRAME_SCAN check in `_native_frame_busy` survives the targeted set; a grep of tests/ found no other test that queues a native frame scan beside a backlog fetch.
- Defect let through: backlog `.loft` downloads run while native frame scans are queued or running.
- Normal-use condition: adding or rescanning a drive with native videos while a `.loft` backlog exists.
- Frequency 3, impact 3 (ordering and load only; no wrong data, both eventually finish). Below the bar; report only.

### F5 (M33) Paused time in the outer read loop is not tested against the stall limit
- Invariant: I9 (paused time does not count towards the 120 s stall limit). Removing `last_data = time.monotonic()` from the outer pause branch survives.
- Defect let through: after a pause longer than 120 s, the first `select` that times out would mark the read stalled. In practice ffmpeg keeps writing into the pipe during the pause until it fills, so the first post-pause `select` returns ready and `last_data` is refreshed; a stall would need ffmpeg to produce nothing for 1 s right after a long pause with an empty pipe.
- Normal-use condition: none found that reaches the stall branch; on a re-read a stall keeps the old read and sets rule 2 (old text kept, upgrade skipped).
- Frequency 0, impact 3. Below the bar; report only.

### F6 (M16) Equivalent mutant: empty frames opening a segment
- Removing `and text` from the segment-open condition opens empty-text segments, but `ContentExtractor.chunk_text('')` returns `[]`, so they produce no chunks, and the next non-empty frame closes them exactly as the original code would start a fresh segment. No observable difference.
- Frequency 0, impact 1. No action.

TOTAL: 6 findings
