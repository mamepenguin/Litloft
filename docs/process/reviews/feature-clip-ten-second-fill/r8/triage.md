# Triage: r8

## Trajectory

This run:
- claude-read: There have been two product fix rounds. The r6->r7 round (0bb67da) added one statement, `times.sort` before thinning in clip.py's _fill_interval_gaps, and two test parameters. The r7->r8 round (ef0a094 via 35018de) touches different functions. In loft_media._embed_frames it adds one deadline adjustment, which extends the existing budget by the time spent paused. It adds no new branch or state, only a local timestamp. In indexer.prioritize it removes the `and not wants_candidates` condition and turns the if/else into two independent conditions, so the FRAME_OCR rebuild is queued again exactly when it was before this change, and the fetch is queued alongside it. Neither round repeats a branch, state or prediction that the other added. The second round removes a condition the original change had introduced, rather than layering a new one. There is no sign that the design is being patched.

Earlier runs:
- r7 / claude-read: There has been one product fix round since r6 (0bb67da). The other two commits (1c475b8, 6ca58a3) only record review documents. With a single round there is no earlier round to compare against, so no branch, state or prediction is repeated. The round adds one ordering statement (`times.sort` before thinning at clip.py:610), which corrects the existing thinning path without adding a branch or a state. It also adds two test parameters (M=2, M=3) and makes two test harnesses import app.search so the cache-clear patch applies. It removes nothing. There is no sign that the design is being patched.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/config.py — partial: Lines 92-96 (FrameExtractionConfig), read via Grep context.
- addons/intelligence/app/database.py — partial: Lines 470-545 (_migrate_vec_clip_if_needed tail, _migrate_vec_clip_change_if_needed) and 1200-1246 (_migrate_loft_columns).
- addons/intelligence/app/indexer.py — partial: Lines 1200-1229 (loft enqueue in the sweep), 1395-1465 (prioritize, including the F3 fix), 2125-2224 (loft worker, Visual Index hook, _defer_backlog, _native_frame_busy) and 2030-2069 (frame OCR worker); the _collect_incomplete hunks from the diff only.
- addons/intelligence/app/main.py — partial: Lines 115-144 (start-up and the move task), plus the shutdown hunk from the diff.
- addons/intelligence/app/models.py — partial: Lines 121-130 (loft_candidates_done column), read via Grep context.
- addons/intelligence/app/routers/files.py — partial: Lines 1080-1159 (reindex_file loft request handling and _reset_flags).
- addons/intelligence/app/workers/change_frames.py — full: The whole file, lines 1-216.
- addons/intelligence/app/workers/clip.py — partial: Lines 445-624 (_extract_frame_paths through _fill_interval_gaps) and 960-1149 (storyboard lock, _index_clip_loft, candidates_gate_holds, _index_youtube_storyboard, index_storyboard).
- addons/intelligence/app/workers/frame_scan.py — partial: Lines 150-287 (_store and index_frame_scan in full), plus the removed code in the diff.
- addons/intelligence/app/workers/loft_media.py — partial: Lines 255-814 (storyboard step through __all__, every changed function including the F2 fix); lines 1-254 only as diff hunks.
- addons/intelligence/search-config.yml.example — partial: Lines 558-562 (frame_extraction block), read via Grep context.

Test files:
- addons/intelligence/tests/test_spec_addon_111_frame_scan_index.py — partial: Diff hunk only.
- addons/intelligence/tests/test_spec_addon_111_frame_scan_model.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_111_frame_scan_task.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_fetch.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_queue.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_schema.py — partial: Diff hunk only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_start.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_121_loft_fetch_storyboard.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_144_scene_fill.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_145_change_frame_move.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_145_frame_scan.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_146_candidates_stage.py — full: New file, read in full in the diff, including this round's pause-budget test.
- addons/intelligence/tests/test_spec_addon_146_loft_candidates_queue.py — full: New file, read in full in the diff, including this round's frame_ocr assertion.
- addons/intelligence/tests/test_z_clip_thumbnail_dispatch.py — partial: Diff hunk only.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I ran no tests. Every mutant outcome above comes from reading the code.
- claude-read: I did not read loft_media.py lines 1-254 (imports, _State, _load_state, _note_result, backoff) in this round.
- claude-read: I read only the diff hunks of the changed test files outside the new 144/145/146 files, not their unchanged bodies, including the LoftWorld fixtures used by the pause test.
- claude-read: I did not read vec_partition.insert_vector_sql, repair_unkeyed_vec_rows or the selection's _pool filter, so I3 pool equality is taken from the r7 reading and the decisions.md R-5 run.
- claude-read: I did not read index_frame_ocr's handling of a .loft rebuild-only task that runs at the same time as a candidates-only fetch.
- claude-verify: Change-frame move at start-up (I3, I4) in main.py and vec_partition.py
- claude-verify: Candidates stage commit, tile removal and frame cache entries (I5, I6, SPEC-ADDON-117 I11)
- claude-verify: Storyboard leg gate and tile timing (SPEC-ADDON-078 I7/I8) in clip.py index_storyboard
- claude-verify: indexer.py _collect_incomplete, prioritize priority 100 and the Visual Index hook (I8, I12)
- claude-verify: routers/files.py CLIP regenerate (I7)
- claude-verify: The docs in docs/addons/intelligence.md and the tests

TOTAL: 0 findings
