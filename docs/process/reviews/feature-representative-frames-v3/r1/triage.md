# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: After a model change, an on_index request is now refused as run_exists whenever the file has any run, including a failed one. Earlier tests expected it to be accepted. Nothing in the approved spec states this.
- claude-read: After a model change, an on_index request is now refused as run_exists whenever the file has any run, including a failed one. Earlier tests expected it to be accepted. Nothing in the approved spec states this.

## Findings

A: 0
B: 5
C: 0

### claude-read:TP-5 — bucket B, MEDIUM, rejected

Claim: Several existing stickiness tests in test_video_visual_worker.py changed from accepted True to reason run_exists, which changes an automatic-request rule that no Revises line names.
Impact: An on_index request after a model change is now refused whenever the file has any run, including a failed one (refused as run_exists, not unsupported_sticky). A user who changed the vision model no longer gets an automatic retry on the new model; they must regenerate by hand. The new behaviour matches I9's ban on retrying a failed run, but the spec does not say that a model change no longer re-admits an automatic request.
Evidence: addons/intelligence/tests/test_video_visual_worker.py: test_unsupported_sticky_clears_on_model_change (around line 774) and the test near the 'Revises' comments at the hunk asserting result == {'accepted': False, 'reason': 'run_exists'}; app/workers/video_visual.py enqueue hunk: _automatic_request_reason returns 'run_exists' when runs.first() is not None and the run is not an active run of the current pipeline version.
Repro: Set the vision model to a different value after a failed on_index run for a video with a candidate pool, then call enqueue(file_id, requested_by='on_index'). Expected by the old test: accepted True. Current code: {'accepted': False, 'reason': 'run_exists'}. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-1 — bucket B, INFO, rejected

Claim: The diff adds a new module addons/intelligence/app/video_frames.py that the touch-point list does not name; the list only says the helpers move into shared helpers without naming a destination.
Impact: A reader of the touch-point list cannot tell that this module holds the shared dhash, probe, reachability and extract_frame code used by clip.py, frame_ocr.py and the scan. Review scope is under-specified; no runtime defect follows from this alone.
Evidence: addons/intelligence/app/video_frames.py:1-135 (new file, 135 lines); clip.py hunk imports extract_frame from app.video_frames; frame_ocr.py hunk imports GAP_SECONDS, HASH_BITS_THRESHOLD, Unreadable, dhash, probe, probe_geometry, reachable from app.video_frames; touch-point text lists only app/workers/clip.py and app/workers/frame_ocr.py for the move.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff changes three MCP test files under mcp-server/src/__tests__/ (loftYoutube.test.ts, videoFrames.test.ts, and the new videoScenesSections.test.ts) that the touch-point list does not name; only mcp-server/src/tools/video.ts and mcp-server/README.md are listed.
Impact: No user-facing effect. The rewritten expectations pin the new frame_time behaviour of list_video_scenes (SPEC-CORE-110) and the SPEC-CORE-009 I7 labels.
Evidence: mcp-server/src/__tests__/loftYoutube.test.ts hunk at lines 56-61 and 189-192; mcp-server/src/__tests__/videoFrames.test.ts hunks at lines 219-225 and 320-331; mcp-server/src/__tests__/videoScenesSections.test.ts (new, 132 lines).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff adds or rewrites addon test files and test helpers that the touch-point list does not name: tests/scene_sections_db.py, tests/video_frames_doubles.py, test_spec_addon_111_frame_scan_{index,model,regenerate,task}.py, test_spec_addon_112_scene_sections.py, test_spec_addon_113_ask_frames.py, and rewrites of test_spec_addon_068_protection_redo.py, test_video_visual_router.py, test_video_visual_scene_label_migration.py and test_video_visual_worker.py.
Impact: No runtime effect. A reviewer working from the touch-point list would not expect these files to change, so the scope of the test rewrites is harder to audit.
Evidence: Diff hunks in addons/intelligence/tests/ for the files named above; the touch-point list names only test_video_visual_selection.py, test_video_scenes_endpoint.py, test_spec_addon_078_youtube_scenes.py and the SPEC-ADDON-108 test doubles.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-4 — bucket B, INFO, open

Claim: The diff adds a new public function clip.load_image_model in a file whose touch-point scope is only the interval-frame helper move with behaviour unchanged.
Impact: The new function is the scan's model-load gate (frame_scan.py calls it before any embedding). Its behaviour is new, not a move, so the 'behaviour unchanged' scope does not cover it.
Evidence: addons/intelligence/app/workers/clip.py hunk at lines 363-377 adds load_image_model, which calls _ensure_siglip_full_loaded or _ensure_loaded; frame_scan.py imports it at the module top.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Test suites were not run (pytest, vitest, mcp-server tests). No claim here is about a passing or failing test.
- claude-read: The submodule SHA 1539ec1343ad5c648e8d8434960254ece2ae5f84 and the commit 3fd0bfcc2 were not checked against the worktree; only the presence of app/video_frames.py and the absence of removed names in app code were checked.
- claude-read: Whether metadata._store_embedding accepts vec_clip_change and whether the vec partition DDL matches were not checked.
- claude-read: The original approved text of the stickiness rule (which spec id pins test_unsupported_sticky_clears_on_model_change) was not read; the bucket reason for TP-5 rests on the test name and the diff.
- claude-verify: Did not run any tests or the git diff; this is a read-only review with Read, Glob and Grep only.
- claude-verify: Did not verify that the worktree HEAD is 3fd0bfcc2; I assumed the files read are the commit under review.
- claude-verify: Did not verify the behaviour of clip.py, frame_ocr.py or video_frames.py beyond the code read here; I did not check that the moved helpers are byte-for-byte unchanged in behaviour.
- claude-verify: Did not check the invariants I1-I10 beyond the stickiness rule (I9) and the scope claims in the findings.

TOTAL: 5 findings
