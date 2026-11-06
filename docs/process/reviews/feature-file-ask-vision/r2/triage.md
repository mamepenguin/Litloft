# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-read: The only fix since r1 adds a test for the non-finite 422 on the two drive-wide routes and moves the submodule pin. It adds no branch, state or prediction to the code, and it removes none. Nothing in the fixes suggests the design is being patched. The r1 inventory-test gap (F3) is still open.

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The app-wide RequestValidationError handler applies to every addon route, not only the file-question route.; On a generic mid-stream failure the route now emits a meta event before done.; An Ollama 404, for example a missing model, is recorded as a permanent vision-unsupported verdict until the process restarts.
- claude-read: The app-wide RequestValidationError handler applies to every addon route, not only the file-question route.
- claude-read: On a generic mid-stream failure the route now emits a meta event before done.
- claude-read: An Ollama 404, for example a missing model, is recorded as a permanent vision-unsupported verdict until the process restarts.

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: tests/test_llm_caller_inventory.py is a declared touch point where the new streaming call should be registered, but it still has no reference to generate_stream_with_image or any stream or vision call, and neither the original diff nor the r1 fix commits changed it.
Impact: Nothing pins the two new generate_stream_with_image methods to the resolved client, so a later direct client construction or a call that bypasses resolve would pass the inventory test.
Evidence: Grep for 'generate_stream|vision' in addons/intelligence/tests/test_llm_caller_inventory.py returns no matches; the fix commits 3d46e45d5 and 74eba744a only add a validation-body test and move the pin. This repeats r1 F3, which is still unaddressed.
Repro: Grep the inventory test for generate_stream_with_image: 0 matches.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Register the new streaming call in the inventory test, or delete that touch point from the spec.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The new frontend source filter withoutImagesAndRefusedLinks only recognises fenced code that starts at column 0 to 3 spaces, so a Markdown image or link written inside an indented code block, a blockquote fence or a list-nested fence is rewritten before rendering.
Impact: Code shown in an answer can lose its image or link syntax. The image and refused-link rules of I10 still hold, so this is a drawing inaccuracy rather than a security gap.
Evidence: AnswerMarkdown.tsx: the fence regex /^ {0,3}(`{3,}|~{3,})/ is applied per line. Indented code (4 spaces) and '> ```' are not detected, so stripInlineMarkup runs on those lines.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I ran no tests, because I only had read tools.
- claude-read: I did not read workers/vision.py, frame_cache.py or MarkdownPreview.
- claude-read: I did not check the other routes' request models for a field that would now produce a different 422 body.
- claude-read: I did not check the frontend renderer against every I10 case.
- claude-verify: Backend invariants I1-I9, I11 and I12 were not examined.
- claude-verify: No tests were run; I only had read-only tools.
- claude-verify: Frontend rendering was checked by reading the code, not by rendering it in markdown-it.

TOTAL: 2 findings
