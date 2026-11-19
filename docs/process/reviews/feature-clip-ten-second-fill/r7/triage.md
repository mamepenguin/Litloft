# Triage: r7

## Trajectory

This run:
- claude-read: There has been one product fix round since r6 (0bb67da). The other two commits (1c475b8, 6ca58a3) only record review documents. With a single round there is no earlier round to compare against, so no branch, state or prediction is repeated. The round adds one ordering statement (`times.sort` before thinning at clip.py:610), which corrects the existing thinning path without adding a branch or a state. It also adds two test parameters (M=2, M=3) and makes two test harnesses import app.search so the cache-clear patch applies. It removes nothing. There is no sign that the design is being patched.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- addons/intelligence/app/config.py — partial: Lines 91-96 (FrameExtractionConfig) only.
- addons/intelligence/app/database.py — partial: Lines 120-159 (init and migration order), 436-545 (_migrate_vec_clip_if_needed, _migrate_vec_clip_change_if_needed) and 1200-1246 (_migrate_loft_columns).
- addons/intelligence/app/indexer.py — partial: Lines 918-1077 (_collect_incomplete and the flags block), 1170-1229 (the loft enqueue), 1395-1464 (prioritize) and 2125-2184 (the loft worker hook).
- addons/intelligence/app/main.py — partial: Lines 110-154 (start-up, with the move after cleanup_orphaned_embeddings), plus the shutdown hunk from the diff.
- addons/intelligence/app/models.py — partial: Lines 110-134 (the loft columns, including loft_candidates_done).
- addons/intelligence/app/routers/files.py — partial: Lines 1100-1189 (reindex_file's _reset_flags and enqueue).
- addons/intelligence/app/workers/change_frames.py — full: The whole file, lines 1-216.
- addons/intelligence/app/workers/clip.py — partial: Lines 440-629 (_extract_frame_paths, _thin_frames, _gap_fill_times, _fill_interval_gaps), 1000-1139 (storyboard_lock, _index_clip_loft, candidates_gate_holds, _index_youtube_storyboard, the start of index_storyboard) and the _remove_clip_embeddings signature at 1600-1612.
- addons/intelligence/app/workers/frame_scan.py — partial: Lines 150-287 (_store and index_frame_scan in full), plus the removed code in the diff.
- addons/intelligence/app/workers/loft_media.py — partial: Lines 260-810 (the storyboard step through _apply_recorded_requests, every changed function), plus the diff hunks for the imports, _State and _load_state.
- addons/intelligence/search-config.yml.example — partial: Lines 557-563 (the frame_extraction block).

Test files:
- addons/intelligence/tests/test_spec_addon_111_frame_scan_index.py — partial: Diff hunk only.
- addons/intelligence/tests/test_spec_addon_111_frame_scan_model.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_111_frame_scan_task.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_fetch.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_queue.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_schema.py — partial: Diff hunk only.
- addons/intelligence/tests/test_spec_addon_117_loft_media_start.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_121_loft_fetch_storyboard.py — partial: Diff hunks only.
- addons/intelligence/tests/test_spec_addon_144_scene_fill.py — full: New file, read in full in the diff, including the fix round's M-2 and M-3 parameters.
- addons/intelligence/tests/test_spec_addon_145_change_frame_move.py — full: New file, read in full in the diff, including the fix round's importlib change.
- addons/intelligence/tests/test_spec_addon_145_frame_scan.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_146_candidates_stage.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_spec_addon_146_loft_candidates_queue.py — full: New file, read in full in the diff.
- addons/intelligence/tests/test_z_clip_thumbnail_dispatch.py — partial: Diff hunk only.

## Needs a human

### unspecified_behavior

Note: Time spent paused counts toward the candidates stage's embedding budget (F2). The spec says the stage waits while paused, and also gives a 600 s budget, but does not say whether the pause counts against that budget.; When a CLIP regenerate is recorded during a running fetch, its CLIP task can run while the flag is still true. The storyboard leg then finds the gate holding and skips the storyboard, and the flag is reset only when the fetch ends. The requeued fetch rebuilds from the video, but the 'storyboard leg writes the storyboard as before' step of I7 does not happen in that ordering.
- claude-read: Time spent paused counts toward the candidates stage's embedding budget (F2). The spec says the stage waits while paused, and also gives a 600 s budget, but does not say whether the pause counts against that budget.
- claude-read: When a CLIP regenerate is recorded during a running fetch, its CLIP task can run while the flag is still true. The storyboard leg then finds the gate holding and skips the storyboard, and the flag is reset only when the fetch ends. The requeued fetch rebuilds from the video, but the 'storyboard leg writes the storyboard as before' step of I7 does not happen in that ordering.
- claude-verify: The spec does not say whether paused time counts toward the candidates stage's embedding budget (EMBED_BUDGET_SECONDS). The code counts it (F2).
- claude-verify: The spec does not say what priority the text rebuild of a read-but-unindexed YouTube .loft gets when prioritize queues a fetch instead (F3).

### unspecified_behavior

Note: The spec does not say whether paused time counts toward the candidates stage's embedding budget (EMBED_BUDGET_SECONDS). The code counts it (F2).; The spec does not say what priority the text rebuild of a read-but-unindexed YouTube .loft gets when prioritize queues a fetch instead (F3).
- claude-read: Time spent paused counts toward the candidates stage's embedding budget (F2). The spec says the stage waits while paused, and also gives a 600 s budget, but does not say whether the pause counts against that budget.
- claude-read: When a CLIP regenerate is recorded during a running fetch, its CLIP task can run while the flag is still true. The storyboard leg then finds the gate holding and skips the storyboard, and the flag is reset only when the fetch ends. The requeued fetch rebuilds from the video, but the 'storyboard leg writes the storyboard as before' step of I7 does not happen in that ordering.
- claude-verify: The spec does not say whether paused time counts toward the candidates stage's embedding budget (EMBED_BUDGET_SECONDS). The code counts it (F2).
- claude-verify: The spec does not say what priority the text rebuild of a read-but-unindexed YouTube .loft gets when prioritize queues a fetch instead (F3).

## Findings

A: 0
B: 2
C: 0

### claude-read:F2 — bucket B, MEDIUM, open

Claim: The candidates stage's 600 s embedding budget includes the time the queue spends paused. The deadline is set once, before the batch loop, and the pause wait sits inside that loop, so a pause during embedding uses up the budget.
Impact: If the operator pauses the indexing queue for more than 10 minutes while a .loft's candidates stage is embedding, the next frame check raises BudgetExceeded and the stage fails. In a candidates-only fetch (every already-fetched YouTube reference after the upgrade backfill), that failure sets loft_candidates_done true for good. The reference silently keeps its storyboard until someone regenerates CLIP by hand. No error is shown, and the dashboard drops the reference from the pending list.
Evidence: addons/intelligence/app/workers/loft_media.py:368 sets `deadline = time.monotonic() + EMBED_BUDGET_SECONDS` once. Lines 372-374 wait with `while is_paused(): time.sleep(...)` inside the loop. Line 376 raises `_CandidatesFailure("BudgetExceeded")` when `time.monotonic() >= deadline`. _candidates_stage maps that to "failed" (478-481), and _fetch lines 740-742 then write `loft_candidates_done: True` for a candidates-only fetch.
Repro: Not executed. Traced as follows: a candidates-only fetch reaches _embed_frames with at least 2 batches, and is_paused returns True for 601 s between batches. When it resumes, the first frame of the next batch hits the deadline. The stage returns "failed", the flag is written true, and the scene candidates stay the storyboard. No test reaches BudgetExceeded: grep shows no test in tests/test_spec_addon_146_candidates_stage.py that patches EMBED_BUDGET_SECONDS or the clock.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Exclude paused time from the budget (extend the deadline by the time spent waiting), and add a test that pauses between batches past the budget.

</details>

### claude-read:F3 — bucket B, LOW, open

Claim: Take a YouTube .loft whose frame text is read but not indexed and whose candidates are not settled. `prioritize` on it queues only the fetch and drops the priority-100 FRAME_OCR rebuild it queued before. The fetch does not rebuild that text, because _stages_wanted treats OCR as wanted only when frame_ocr_read is false.
Impact: After the upgrade, every already-fetched YouTube reference has loft_candidates_done false. A user who prioritizes one with stored but unindexed frame text gets a candidates-only fetch. The on-screen text stays unsearchable until the next reconciliation sweep queues the rebuild at -10, where earlier it was rebuilt at once.
Evidence: addons/intelligence/app/indexer.py:1430-1449: `if rebuild_only and not wants_candidates:` appends FRAME_OCR at 100, `else:` appends only LOFT_MEDIA at 100. loft_media.py:514-518: ocr is wanted only when `not state.frame_ocr_read`. The sweep's separate FRAME_OCR enqueue at indexer.py:1221-1226 runs at priority -10 only.
Repro: not_reproduced. tests/test_spec_addon_146_loft_candidates_queue.py::test_spec_addon_146_i8_prioritize_queues_a_fetch_at_100_when_only_the_candidates_are_wanted checks the fetch queue only and never checks the frame_ocr queue.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> When wants_candidates and rebuild_only are both true, queue the FRAME_OCR rebuild at 100 as well as the fetch.

</details>

## Not verified

- claude-read: I ran no tests. Every mutant outcome above comes from reading the code.
- claude-read: I did not read repair_unkeyed_vec_rows or vec_partition.insert_vector_sql.
- claude-read: I did not compare the selection's _pool filter (types, vector presence, finite times) with change_frames._scene_times and _movable line by line, so I3's pool equality is assumed, not proven.
- claude-read: I did not read the body of _remove_clip_embeddings past its signature and docstring.
- claude-read: I did not read the unchanged parts of the test files beyond the diff hunks.
- claude-verify: I could not run git diff or tests, so I did not check whether the FRAME_OCR enqueue in prioritize existed before this change.
- claude-verify: I did not read the EMBED_BUDGET_SECONDS value or settings.workers.clip_frame_batch_size.
- claude-verify: I did not check how often reconcile/_resume_incomplete runs after start-up.
- claude-verify: I did not verify the other invariants (I1-I7, I9-I13) beyond the paths relevant to F2 and F3.

TOTAL: 2 findings
