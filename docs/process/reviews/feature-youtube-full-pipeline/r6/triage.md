# Triage: r6

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

Note: The /scenes route for a .loft (app/routers/scenes.py _require_youtube_loft) now answers 400 Not a video file from the stored loft_source without reading the file, for any non-youtube classified .loft. The spec does not name this route's answer for other .loft files.
- claude-read: The /scenes route for a .loft (app/routers/scenes.py _require_youtube_loft) now answers 400 Not a video file from the stored loft_source without reading the file, for any non-youtube classified .loft. The spec does not name this route's answer for other .loft files.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff changes addons/intelligence/app/routers/scenes.py (_require_youtube_loft now trusts indexed loft_source before reading the .loft), but that file is not in the declared touch-point list.
Impact: Changes to the /scenes route for a .loft are outside the reviewed scope; a reader checking the change against the touch-point list would not look at this route's behaviour for other or unclassified .loft files.
Evidence: addons/intelligence/app/routers/scenes.py:56-66 (hunk adds classified = indexed.get("loft_source"); returns for "youtube", raises 400 Not a video file for any other non-null value, and falls through to read_loft only when NULL). Touch-point list names routers/video_visual.py and routers/files.py but not routers/scenes.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add addons/intelligence/app/routers/scenes.py to the Touch points list of docs/specs/youtube-full-pipeline.md.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: The diff rewrites expectations of existing tests for SPEC-ADDON-085, SPEC-ADDON-078, SPEC-ADDON-111 and the frontend SPEC-ADDON-089 suite, which are not in the touch-point list.
Impact: A changed reindex answer for a queued CLIP task (202 already_queued becomes 200 accepted with a loft_media enqueue) and a removed already_queued helper are visible only in test edits; a reader relying on the old tests would not see that existing expectations changed.
Evidence: addons/intelligence/tests/test_spec_addon_085_storyboard_retry.py:104-109 (already_queued helper deleted), :178-183 and :401-404 (assertions moved from 202 to 200 and enqueued list changed); test_spec_addon_078_youtube_reset_sites.py:118 (enqueued list gains loft_media); frontend ScenesSectionRequests.test.tsx:415-552 (mount requests and the no-Visual-Index test rewritten).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the edited SPEC-ADDON-078, 085 and 111 tests and the SPEC-ADDON-089 frontend test under the touch points, noting that their expectations change.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff adds or edits many test files that are not in the touch-point list: tests/loft_media_world.py, tests/youtube_frame_doubles.py, tests/test_spec_addon_117_*.py (seven new files), tests/test_listing_call_inventory.py, and frontend tests IndexDetailsDialogLoft.test.tsx, IndexStatusWidgetLoftMedia.test.tsx, ScenesSection/__tests__/ScenesSectionLoftVisualIndex.test.tsx and ScenesSectionRequests.test.tsx.
Impact: Test-harness changes such as the yt-dlp double's download mode and the new loft_media_world helper are not covered by the review scope, so their own defects could hide behind a passing suite.
Evidence: Diff paths under addons/intelligence/tests/ and addons/intelligence/frontend/**/*.test.tsx; the touch list names only production frontend files.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the test directories and the new test files to the touch-point list, or state that tests are outside it.

</details>

## Not verified

- claude-read: I did not open addons/intelligence/app/routers/scenes.py beyond the diff hunk, nor the full text of the touch-point list in the spec, so I did not check whether the list was meant to include tests.
- claude-read: I did not run the test suite or any mutation; the repro entries are not_reproduced.
- claude-read: I did not check whether scenes.py has other callers that depend on the old read-based check.
- claude-verify: Did not run git diff or git show, so I could not confirm from git that scenes.py and the test files are part of commit 65a7f4e8e's diff. I checked existence and content in the working tree only.
- claude-verify: Did not run the test suites or the frontend tests; the read-only tool set does not allow it.
- claude-verify: Did not verify the invariants I1-I13 in depth beyond the scenes.py route and the rewritten test expectations. The new fetch worker, indexer and yt-dlp download paths were not reviewed.
- claude-verify: Did not confirm the exact line numbers quoted in TP-3; the content matches but the offsets differ slightly.

TOTAL: 3 findings
