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

Note: The error text of every tool changes for a non-string FastAPI `detail` (runTool.ts). This includes per-frame error strings in video.ts via apiErrorDetail, although video.ts is declared as unchanged code.; decisions.md records that batch/tags answers `{"updated":1,"errors":[]}`, not the `count` that batch.test.ts fakes. This was not examined further because it is outside the touch-point question.
- claude-read: The error text of every tool changes for a non-string FastAPI `detail` (runTool.ts). This includes per-frame error strings in video.ts via apiErrorDetail, although video.ts is declared as unchanged code.
- claude-read: decisions.md records that batch/tags answers `{"updated":1,"errors":[]}`, not the `count` that batch.test.ts fakes. This was not examined further because it is outside the touch-point question.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff changes `mcp-server/src/tools/runTool.ts` (`apiErrorDetail`), which is not in the declared touch-point list.
Impact: The error text of every tool changes whenever the backend's `detail` is not a string. For example, a FastAPI 422 on `update_tags`, `rename_file` or `upload_file` now reads `Litloft API error (422): [{...}]` where it used to read `[object Object]`. Because `video.ts:74` also calls `apiErrorDetail`, the per-frame error strings of the video tools change too, although the touch points describe `video.ts` as "unchanged code". This is an improvement, but it is a behavior change across all tools that the touch points and invariants do not plan for, and no invariant covers error text (I9 covers only returned values).
Evidence: mcp-server/src/tools/runTool.ts:9-16 now returns `JSON.stringify(detail)` for a non-string `detail`; before, it returned `String(detail)`. Callers are runTool.ts:25 (all tools) and video.ts:74. decisions.md records that this was added after R-5 found `[object Object]` (fix commit d5fb9edba).
Repro: Read the diff hunk for runTool.ts and grep for `apiErrorDetail`: it has two callers, runTool and video.ts. runTool.test.ts adds a test showing that a 422 list detail is rendered as JSON.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `mcp-server/src/tools/runTool.ts` and `__tests__/runTool.test.ts` to the touch points, and note that error text for a non-string `detail` changes for all tools, including the video frame errors.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The new module `mcp-server/src/tools/textContent.ts` is not in the declared touch-point list, although it holds the logic behind I1, I2, I3 and I4.
Impact: The UTF-8 decoding with the BOM kept, the line splitting and range selection, the size bounds and the editable mime/size constants all live in a file that the touch points do not name. A reviewer who scopes I1, I2 or I4 to read.ts and write.ts can miss the code that actually decides them.
Evidence: mcp-server/src/tools/textContent.ts (new, 86 lines): `decodeUtf8`, `splitLines`, `selectLines`, `isReadableMime`, `FULL_READ_MAX_BYTES`, `RANGED_READ_MAX_BYTES`, `EDITABLE_MIMES` and `EDITABLE_MAX_BYTES`. read.ts and write.ts import them.
Repro: Compare the files in the diff with the touch-point list: textContent.ts does not appear in it.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `mcp-server/src/tools/textContent.ts` (shared text-body helpers) to the touch points.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: Several test files in the diff fall outside the declared test touch points: the shared helper `toolHarness.ts`, the new `fileContent.test.ts` and `compactOutput.test.ts` (which cover existing tools, not new ones), and the edit to `runTool.test.ts`.
Impact: There is no runtime impact. The touch-point list names only `read.test.ts`, `write.test.ts`, `client.test.ts`, `testClient.ts`, `toolMetadata.test.ts`, `videoFrames.test.ts` "and new test files for the new tools". The coverage of `get_file_content`, `search_files` and compact output therefore sits in files the list does not predict. `write.test.ts` and `videoFrames.test.ts` are listed but not touched.
Evidence: The diff adds mcp-server/src/__tests__/toolHarness.ts, fileContent.test.ts (get_file_content and edit_file_content) and compactOutput.test.ts (textResult/textBlock, search_files fields, list_drives and others), and modifies runTool.test.ts. It does not touch write.test.ts or videoFrames.test.ts.
Repro: Compare the diff's file list with the touch points.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List toolHarness.ts, fileContent.test.ts, compactOutput.test.ts and runTool.test.ts in the touch points, and drop write.test.ts and videoFrames.test.ts if they stay unchanged.

</details>

## Not verified

- claude-read: I did not run any test or build.
- claude-read: I did not check whether commit 4a78ef97b alone (a docs-only commit) differs from the branch diff shown. I reviewed the diff as provided.
- claude-read: I did not verify behavioral correctness of textContent.ts or the new tools against invariants I1–I10 beyond the touch-point question.
- claude-read: I did not read invariants.md to check whether it revises the touch-point list.
- claude-verify: Shell access was not available, so I did not read the diff against origin/develop with git. I took the changed file list from r1/classification.json, and the earlier String(detail) behavior from the code comment and decisions.md.
- claude-verify: I did not check the correctness of invariants I1-I10 in textContent.ts, read.ts, write.ts, folders.ts or batch.ts.
- claude-verify: I did not run the tests.

TOTAL: 3 findings
