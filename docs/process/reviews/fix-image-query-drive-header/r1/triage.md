# Triage: r1

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

### claude-read:R1-scan-scope-mcp — bucket B, MEDIUM, open

Claim: The new source scan, which its describe block says covers 'every X-Lit-Drive sender', reads only frontend/src and addons/*/frontend, so the MCP server's three raw-drive senders pass it.
Impact: An MCP client that calls `ask` (mcp-server/src/tools/ask.ts:60) or `clip_url`/`clip_pasted` (mcp-server/src/tools/write.ts:418, :446) with a drive whose name is not Latin-1 (e.g. 動画, which this repo's test data uses) fails in Node's fetch before the request is sent. This is the same failure the change fixes for the image query, and the new guard test stays green.
Evidence: frontend/src/__tests__/driveHeaderEncoding.test.ts:16-24 builds ROOTS from frontend/src and addons/<name>/frontend only. mcp-server/src/tools/ask.ts:60 and mcp-server/src/tools/write.ts:418,446 send `{ "X-Lit-Drive": drive }` without encodeURIComponent. mcp-server/src/client.ts:158-170 and :249-262 spread options.headers into fetch unchanged. Sibling MCP tools already encode (search.ts:23, video.ts:53, read.ts:337,372), and mcp-server/src/__tests__/readDocument.test.ts:125-130 asserts encoding for one of them, so the raw senders break the repository's own convention. The proxy decodes the header (addons/intelligence/app/drive_context.py unquote, per docs/process/reviews/feature-ingest-progress/r3/triage.md:47).
Repro: not_reproduced. Static reading: under the HEADER_VALUE regex, ask.ts:60 would be reported if mcp-server/src were in ROOTS. It is not, so `sends no raw drive name` passes.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Encode the drive at mcp-server/src/tools/ask.ts:60 and write.ts:418,446, and add mcp-server/src to the scan's ROOTS. Alternatively, narrow the describe text to the browser senders.

</details>

## Not verified

- claude-read: I did not run any tests. The mutation-kill claims come from reading the code.
- claude-read: I did not confirm at runtime that Node's fetch in the MCP server throws on a non-Latin-1 header value. The finding relies on the WHATWG ByteString conversion that undici applies.
- claude-read: I did not read the backend addon proxy or drive_context.py source directly; I relied on the triage note that quotes its unquote behavior.
- claude-read: I did not check docs/specs/ for a SPEC-CORE-046 entry or its wording.
- claude-verify: I did not run the test suite or execute fetch with a non-Latin-1 header. The throw comes from the WHATWG Headers ByteString rule and from the repository's own test comments, not from a run.
- claude-verify: I did not check whether the core backend proxy changes X-Lit-Drive before forwarding it to the addons.
- claude-verify: I did not audit other non-frontend TypeScript or Python senders outside mcp-server (scripts, browser extensions) for raw X-Lit-Drive values.

TOTAL: 1 findings
