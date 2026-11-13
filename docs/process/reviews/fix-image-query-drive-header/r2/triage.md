# Triage: r2

## Trajectory

This run:
- claude-read: There was one fix round after r1 (03a007848). It applied the existing encodeURIComponent convention to three more call sites and added one directory to the scan's ROOTS. It adds no new branch, state or prediction: the same mechanical transform and the same scan are extended in scope. 94711b140 and 4c61d2863 are review-record commits only. The design is not being patched; the fix completes a convention that already existed rather than layering conditions on it.

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

### claude-read:R2-mcp-encoding-only-guarded-by-scan — bucket B, LOW, open

Claim: The three newly encoded MCP senders (ask, clip_url, clip_pasted) have no behavioral test in mcp-server's own suite that uses a non-ASCII drive. The only check that fails if the encoding is reverted is the source scan in the frontend test suite.
Impact: No user-visible defect today. If someone reverts encodeURIComponent in mcp-server/src/tools/ask.ts:60 or write.ts:418/446, the mcp-server vitest job stays green, and only the frontend job catches it. A sender written in a form the scan regex does not match (for example a helper returning the raw drive, or headers.set) would pass both suites.
Evidence: mcp-server/src/__tests__/ask.test.ts:30,39 sends drive 'media' and expects the header 'media'. encodeURIComponent('media') === 'media', so that assertion cannot tell encoded from raw. No test file under mcp-server/src/__tests__ asserts the X-Lit-Drive header for clip_url or clip_pasted (grep for X-Lit-Drive in mcp-server shows none). Sibling tools do have such tests: read.test.ts:264-269, searchTools.test.ts:142-147, readDocument.test.ts:125-130. frontend/src/__tests__/driveHeaderEncoding.test.ts:19 now scans mcp-server/src, and .github/workflows/ci.yml has no path filters, so the frontend job runs on every change and the scan does catch a plain revert.
Repro: Mutation in thought: revert ask.ts:60 to `{ "X-Lit-Drive": drive }`. Result: ask.test.ts passes. driveHeaderEncoding.test.ts 'sends no raw drive name' fails and reports mcp-server/src/tools/ask.ts:60. Not run.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a 動画 case to mcp-server/src/__tests__/ask.test.ts, and an equivalent test for clip_url and clip_pasted, asserting headers equal { 'X-Lit-Drive': encodeURIComponent('動画') }, in the same way as read.test.ts:264.

</details>

## Not verified

- claude-read: I did not run any test suite. The mutation outcomes come from reading the code.
- claude-read: I did not check whether GlobalSearch.imageQuery.test.tsx or ImageQueryView.test.tsx (via helpers/imageQuery.ts:52) use a non-ASCII drive whose expected header value would have to change. ImageQueryView.test.tsx:342 expects 'media', which is the same encoded or raw.
- claude-read: I did not confirm that the frontend CI job checks out mcp-server/ so that the scan can read it.
- claude-verify: I did not run any test suite (no execution tools).
- claude-verify: I did not confirm that the CI frontend job's checkout includes mcp-server/src at runtime; I inferred it because there is no sparse-checkout configuration in the lines I read.
- claude-verify: I did not check whether the addon proxy decodes the header correctly on the server side.

TOTAL: 1 findings
