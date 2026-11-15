# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:F1-touchpoint-109-frame-citations — bucket B, LOW, open

Claim: The diff rewrites assertions in addons/intelligence/tests/test_spec_addon_109_frame_citations.py, a file the spec's touch-point list does not name.
Impact: The spec's scope list is incomplete, so a reader using it to judge which expectations changed would miss this rewrite. Runtime behaviour is not changed by this file alone.
Evidence: Diff hunks tests/test_spec_addon_109_frame_citations.py @@ -13,15 +13,14 @@ (listed_in_order and user_prompt imports removed, assert_labelled import added) and @@ -80,7 +79,7 @@ (listed_in_order(user_prompt(wire), ['0:12', '1:02:05']) replaced by assert_labelled(wire, wire.image_bodies[0], first=1, times=[12.3456, 3725.9])). The spec's Touch points list (docs/specs/video-ask-text-and-frames.md) names the 071 picture_frame, 077 youtube, 071 image_stream, 072 position and 108 video_frames files, and for the I11 layout only test_vision_llm_client.py, test_spec_addon_108_video_frames.py and the SPEC-ADDON-114 acceptance tests. 109 is not among them.
Repro: not_reproduced: a comparison of the diff's file list with the spec's touch-point list. Every other changed file in the diff is covered by a listed item or is an implicit touch point (new spec, INDEX.md, review records, new SPEC-ADDON-114 test files and frame_label_layout.py helper, submodule pointer).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add test_spec_addon_109_frame_citations.py to the spec's touch-point list under the I11 layout rewrite.

</details>

## Not verified

- claude-read: I did not run the tests or read test_spec_addon_109_frame_citations.py in full. The finding rests on the diff hunks and the spec's list.
- claude-read: I did not check whether .flash/spec.md, which matched a grep for the spec text, is tracked or generated.
- claude-read: I did not read every test in test_spec_addon_071_picture_frame.py, test_spec_addon_077_youtube_ask.py or test_spec_addon_108_video_frames.py against the listed ranges.
- claude-verify: Did not run the test suite. The tools available are Read, Glob and Grep only.
- claude-verify: Did not inspect the git diff or the commit 0febb32a0 directly. I read the working-tree state of the files, which I assume matches the commit, and did not confirm that by git.
- claude-verify: Did not read tests/frame_label_layout.py to check that assert_labelled checks the I11 layout correctly.
- claude-verify: Did not check whether the 109 test's sent-key and citation expectations are consistent with the implementation in addons/intelligence/app/rag/file_question.py.
- claude-verify: The spec's bucket and severity definitions for this finding were not in the input, so I left the bucket decision to the lead.

TOTAL: 1 findings
