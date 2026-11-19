# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/app/config.py — partial: Only the diff hunk (FrameExtractionConfig default).
- addons/intelligence/app/database.py — partial: Diff hunks for _migrate_vec_clip_if_needed, _migrate_vec_clip_change_if_needed and _migrate_loft_columns, plus get_search_db and the write lock (around lines 2418-2456).
- addons/intelligence/app/indexer.py — partial: Diff hunks only (_collect_incomplete query and snapshot, the loft enqueue condition, prioritize, the loft worker hook).
- addons/intelligence/app/main.py — partial: Lines 95-154 plus the diff hunks for the shutdown block.
- addons/intelligence/app/models.py — partial: Diff hunk only (the loft_candidates_done column).
- addons/intelligence/app/routers/files.py — partial: Diff hunk only (reindex_file clip branch).
- addons/intelligence/app/workers/change_frames.py — full: New file, read in full in the diff.
- addons/intelligence/app/workers/clip.py — partial: Lines 440-623 (the extraction, fill and thinning functions), plus the diff hunks for candidates_gate_holds and _index_youtube_storyboard.
- addons/intelligence/app/workers/frame_scan.py — partial: Diff hunks only (removed embedding code, _store, index_frame_scan).
- addons/intelligence/app/workers/loft_media.py — full: The whole file.
- addons/intelligence/search-config.yml.example — partial: Diff hunk only.

Test files:
- addons/intelligence/tests/test_spec_addon_111_frame_scan_index.py — partial: Diff hunk only.
- addons/intelligence/tests/test_spec_addon_111_frame_scan_model.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_111_frame_scan_task.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_fetch.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_queue.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_schema.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_start.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_121_loft_fetch_storyboard.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_144_scene_fill.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_145_change_frame_move.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_145_frame_scan.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_146_candidates_stage.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_146_loft_candidates_queue.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_z_clip_thumbnail_dispatch.py — partial: Diff hunk only.

## Needs a human

### unspecified_behavior

Note: A candidates-only fetch that finds the file inactive returns before _note_result('success'), so a YouTube download that succeeded is not recorded for the backoff and pause accounting (loft_media.py:705-706).; Shutdown during the background move leaves a worker thread writing after the lifespan has finished cancelling (main.py).
- claude-read: A candidates-only fetch that finds the file inactive returns before _note_result('success'), so a YouTube download that succeeded is not recorded for the backoff and pause accounting (loft_media.py:705-706).
- claude-read: Shutdown during the background move leaves a worker thread writing after the lifespan has finished cancelling (main.py).
- claude-verify: The change-frame move thread keeps running after the shutdown cancel (main.py:473-477; change_frames.py:195-207).
- claude-verify: _OCR_REQUESTED.discard now runs before the failure-count and settled writes (loft_media.py:732-733).

### unspecified_behavior

Note: The change-frame move thread keeps running after the shutdown cancel (main.py:473-477; change_frames.py:195-207).; _OCR_REQUESTED.discard now runs before the failure-count and settled writes (loft_media.py:732-733).
- claude-read: A candidates-only fetch that finds the file inactive returns before _note_result('success'), so a YouTube download that succeeded is not recorded for the backoff and pause accounting (loft_media.py:705-706).
- claude-read: Shutdown during the background move leaves a worker thread writing after the lifespan has finished cancelling (main.py).
- claude-verify: The change-frame move thread keeps running after the shutdown cancel (main.py:473-477; change_frames.py:195-207).
- claude-verify: _OCR_REQUESTED.discard now runs before the failure-count and settled writes (loft_media.py:732-733).

## Findings

A: 1
B: 6
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: _fill_interval_gaps thins a list that is not in time order: all anchors first, then the fill times between them, then the trailing fill. So the kept times are not the times at index (i*count)//M of the time-ordered list.
Impact: A native video, or a YouTube .loft candidates stage, with more than max_frames scene and fill times keeps a different set of frames from the one the spec requires. In effect it thins the scene frames and the fill times separately, so coverage of the video's end and of long takes is not what I2 describes. The result is wrong with no error. It applies to about 324 production videos over M once they are regenerated, and to long YouTube references.
Evidence: addons/intelligence/app/workers/clip.py:599-612. `times = list(anchors)`, then `times.extend(...)` for each gap's fills and the trailing fill, then `times = [times[(i * count) // max_frames] ...]` with no sort first. The sort happens only at line 622, after thinning. The docstring at 579-580 says the thinning runs on the time-ordered list.
Repro: Mental mutation over the gradient fixture (cuts at 5, 12 and 25 s, duration 40 s, I=10). times = [0,5,12,25,18.5,32.5]. With M=3 the indices are 0, 2 and 4, so the code keeps {0,12,18.5}. The time-ordered rule keeps {0,12,25}. With M=2 the code keeps {0,25} and the spec keeps {0,18.5}. The parametrized test in tests/test_spec_addon_144_scene_fill.py covers only M=1, 4, 5, 6 and 7, and for those the two orders happen to give the same set. Adding a sort before the thinning, or removing it, leaves the whole suite green.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Sort `times` by timestamp before thinning, and add M=2 and M=3 cases to test_spec_addon_144_i2_more_times_than_max_frames_are_thinned_over_the_whole_video.

</details>

### claude-read:U1 — bucket B, LOW, open

Claim: The change adds a new module, addons/intelligence/app/workers/change_frames.py, which holds the whole change-frame move. The touch-point list names only main.py's start-up sequence for the move.
Impact: Reviewers who scope by the declared touch points do not look at the module that rewrites embeddings and vec_clip / vec_clip_change for every file with change frames.
Evidence: addons/intelligence/app/workers/change_frames.py (new, 215 lines). It is imported at addons/intelligence/app/main.py:48. The touch-point list contains no entry for app/workers/change_frames.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add app/workers/change_frames.py (move_change_frames, _plan, _move_file, _scene_times) to the touch points.

</details>

### claude-read:U5 — bucket B, LOW, open

Claim: main.py changes the lifespan's shutdown path as well (it cancels and awaits change_frame_move_task). The touch-point list names only the start-up sequence. Cancelling an asyncio task that wraps asyncio.to_thread does not stop the worker thread, so the move keeps writing during shutdown.
Impact: On shutdown during a long first-start move, the thread keeps taking the write lock and committing per file while the index manager stops. The spec's per-file transaction makes an interrupted move safe, so the effect is limited, but the shutdown behaviour is unreviewed.
Evidence: addons/intelligence/app/main.py:132-134 (create_task(asyncio.to_thread(move_change_frames))). The diff adds `change_frame_move_task.cancel()` and an await in the shutdown block (around main.py:473-477).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U2 — bucket B, INFO, open

Claim: clip.py gains functions that are not on the touch-point list: candidates_gate_holds, _thin_frames and _gap_fill_times. It also gains a new get_search_db_read dependency. Its private helpers _remove_clip_embeddings and _store_clip_embedding, and embed_image, gain a new caller in loft_media.
Impact: The gate that both the storyboard leg and the fetch's storyboard step depend on is a new shared function outside the listed names. The new read-session import broke an unrelated test fixture, which had to be patched.
Evidence: addons/intelligence/app/workers/clip.py:547-565 (_thin_frames, _gap_fill_times). The diff adds candidates_gate_holds near clip.py:1049 and changes the import `from app.database import get_search_db, get_search_db_read`. loft_media.py:36-45 imports _extract_frame_paths, _remove_clip_embeddings, _store_clip_embedding, candidates_gate_holds and embed_image.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add candidates_gate_holds, _thin_frames, _gap_fill_times, and loft_media's use of _remove_clip_embeddings and _store_clip_embedding to the touch points.

</details>

### claude-read:U3 — bucket B, INFO, open

Claim: The candidates stage in loft_media reaches app/workers/metadata.py (_remove_embeddings) and app/frame_cache.py (extract_frame_to_cache, frame_cache_path, tile_cache_dir). Neither module is on the touch-point list; only the frame-cache directories are.
Impact: A change to those helpers' semantics would silently change the candidates stage's delete and cache behaviour (I5, I6, revised SPEC-ADDON-117 I11), and reviewers would not see it.
Evidence: addons/intelligence/app/workers/loft_media.py:33 and 48 (imports), 401 (_remove_embeddings(session, file_id, CHANGE_TYPE)), 423 (tile_cache_dir), 469-473 (frame_cache_path, extract_frame_to_cache).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add app/workers/metadata.py:_remove_embeddings and app/frame_cache.py helpers to the touch points.

</details>

### claude-read:U4 — bucket B, INFO, open

Claim: loft_media.py changes code outside its listed names: _State and _load_state (new candidates_done field), index_loft_media (passes candidates_set through), the new _candidates_stage, _embed_frames, _write_candidates, _clear_tiles, _discard_entries and _stored_duration, and the move of `_OCR_REQUESTED.discard` from after the failure-count write to before it.
Impact: Mostly new code. The move of the OCR-request discard changes the order of in-memory and database effects in every fetch that ran OCR, which the list does not flag for review.
Evidence: addons/intelligence/app/workers/loft_media.py:206-238, 356-490, 523-548, 732-733. Before the change, the discard ran after _count_failure and the settled write.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U6 — bucket B, INFO, open

Claim: Tests outside the listed categories (change-frame writes, the scan's CLIP requirement, small pictures, the storyboard leg) are modified. In test_spec_addon_117_loft_media_queue, _start and _schema, existing fixtures now set loft_candidates_done=True or have their expected queue changed. test_z_clip_thumbnail_dispatch adds a get_search_db_read patch.
Impact: Adding loft_candidates_done=True to the fixtures narrows what the earlier SPEC-ADDON-117 queue tests exercise: they no longer cover .lofts with the flag false. A regression in how those paths interact with the new flag would go unnoticed outside the new 146 tests.
Evidence: tests/test_spec_addon_117_loft_media_queue.py hunks at 132, 166, 295 and 322. tests/test_spec_addon_117_loft_media_start.py:108-113 (expected queue grows from 1 to 4 entries). tests/test_spec_addon_117_loft_media_schema.py:101-136. tests/test_z_clip_thumbnail_dispatch.py:90.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test, so the F1 repro is reasoned out, not executed.
- claude-read: I did not read the enclosing functions of the indexer.py, database.py and routers/files.py hunks beyond the diff.
- claude-read: I did not check repair_unkeyed_vec_rows for interaction with a move running at the same time.
- claude-read: I did not read the vec_partition.insert_vector_sql implementation.
- claude-verify: I did not diff against origin/develop directly. The prior order of _OCR_REQUESTED.discard was taken from a sibling checkout assumed to match the base.
- claude-verify: I ran no tests; all results come from reading the code.
- claude-verify: I did not read the test_spec_addon_117_loft_media_schema.py hunk at 101-136 line by line.
- claude-verify: I did not verify the invariants for the database migrations, indexer and routers/files.py.

TOTAL: 7 findings
