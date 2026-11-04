# Triage: r4

## Warnings

- R-5 ran at 37a930af4e7f13888774aba6cf0c73847a94bb15, and these files changed since: docs/ADDON-DEVELOPMENT.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: The frontend refresh queue has now been changed in three consecutive rounds, each in the same spot (refreshProcessing's in-flight branch). First came a boolean set only for id-less calls. Then (aee93a7) a boolean set unconditionally, which removed that branch. Now (77314cd) a tagged state `{ all } | { ids: Set } | null` with a held-id filter. This round adds a state and a branch, the id set plus the held filter, that neither earlier round had. It replaces the boolean instead of stacking on it, but the repeated rework of one queue means this part of the design is being patched round by round rather than settled. This version tracks pending ids, which is what r3 proposed, so it looks like the end state. 29a2054c9 is a docs-only correction that adds no branch or state. dbfcfb3ad is a review record.
- claude-read: This round has one code fix (77314cd1f) and one docs fix (29a2054c9), plus the record dbfcfb3ad. 77314cd1f touches the frontend refresh queue for the third consecutive round. r2's fix queued only id-less calls. r3's fix (aee93a7) collapsed every call into an unconditional boolean. This round replaces the boolean with a tri-state queue: null, {all}, or {ids: Set}. That adds state and a new prediction (that only held, still-fetching ids deserve a follow-up) to the same mechanism the two previous rounds patched, so the refresh scheduling is still being patched incrementally rather than settled. The new state is what r3's reviewer proposed, though, and it supersedes the earlier boolean rather than stacking a parallel branch next to it. 29a2054c9 adds no branch or state. It aligns the prose with the encoding r3 introduced.

Earlier runs:
- r2 / claude-deep: The record holds three commits since r1. 9f90576 (docs) widened the spec with I14. 13dc968 changed code. 30a9962 (docs) recorded R-5. The code round added a new guard branch to the shared poster: it refuses drive-less posts. This repeats the earlier pattern of the previous fix (97bb107), which added the secret header to the same helper. Each review round has added one more precondition to app/addon_events.py after an earlier change made previously dropped events deliverable. So the poster's contract is being patched step by step rather than designed once. The round also removed a branch: _payload's conditional 'add drive only if present' is gone, and drive is now always set at the top level. It moved refine.started after the snapshot, so that event can name the drive. The core endpoint and the frontend did not change in these rounds.
- r2 / claude-read: Round 1 (97bb1070f, before r1) added a shared poster with a secret header, so events that had been 403-dropped started to be delivered. That newly exposed the drive-less broadcast. Round 2 (9f90576f2 spec I14, then 13dc9688a code) did not add a parallel branch for the same prediction. It removed the 'global broadcast when there is no drive' state from addon_events._payload, replaced it with a single refusal branch, and threaded an explicit drive through the refine, summaries and vision emitters. 30a9962a2 is a record only. Each round did fix a consequence the previous round exposed (secret, then drive scope), so the poster is still being patched incrementally. But round 2 removed a state rather than stacking one, and it moved refine.started after the snapshot, which created the drop described in R2-1.
- r3 / claude-deep: The rounds since r2 are two code fixes and two record commits. 7e28bdc adds no new branch or state. It replaces the raw header value with a percent-encoded one, matching the existing proxy convention, and does not repeat an earlier round's pattern. aee93a7 removes a branch: the 'fileIds === undefined' condition on queuing is gone, so every in-flight call collapses into one boolean flag. That widens the earlier prediction ('an in-flight answer cannot cover the new entry') into 'any call may be stale', and this over-reach produces deep-r3-1. The refresh queue has now been adjusted in two rounds: an id-less queue first, then an unconditional queue. It is still a single boolean, not a design that tracks pending ids, so the frontend refresh scheduling is being patched incrementally. 37a930af and a51507602 are review records only.
- r3 / claude-read: The two code fixes in this round do not add a branch, state or prediction of the kind earlier rounds added. 7e28bdc adds one encoding step at the existing call site (quote on X-Lit-Drive). It reuses the decoding the addon already performed, so it adds no new branch. aee93a7 removes a branch: the `fileIds === undefined` condition, which predicted that only tick or entry-driven calls could be stale, is gone, and every in-flight call is now queued. 37a930af4 and a51507602 are review records only. Earlier rounds patched app/addon_events.py one step at a time (first the secret header, then the drive refusal). This round touches other code (the core router and the frontend store) and simplifies rather than stacks. The one new seam is documentation: the processing_status section of ADDON-DEVELOPMENT.md still describes the header as raw (R3-1).

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-deep:deep-r4-1 — bucket B, LOW, open

Claim: The new mid-request test pins the follow-up to the event's ids with only one entry in the drawer, so it cannot tell an id-narrowed follow-up from a full one. A regression that queues `{ all: true }` whenever a held id is named would still pass.
Impact: No current defect. queueProcessingRefresh at frontend/src/hooks/useUpload.ts:232-250 keeps the union of held ids, and the follow-up at :268 asks only for those. If a later change widened the follow-up again, every other entry in processing view would fetch on an event that does not name it (the r3 I8 issue), and no test would fail.
Evidence: frontend/src/__tests__/uploadProcessingRefresh.test.tsx: in the it.each case 'a held id', renderCompleted drops one file (file_a) and asserts `callsSoFar[1]` equals `["file_a"]`. With one entry, a refresh with no ids and a refresh for file_a produce the same request.
Repro: Mutation, reasoned and not executed: in queueProcessingRefresh, replace the ids branch with `processingRefreshQueued = { all: true }` after the `held.length === 0` check. Both it.each cases still pass: the foreign case still has 1 call, and the held case's second call is still ["file_a"]. The mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a case with two entries in processing view where the mid-request event names one of them, and assert that the follow-up request lists only that id.

</details>

### claude-read:R4-1 — bucket B, LOW, open

Claim: The new tests for a mid-request event use a single drawer entry, so they cannot tell an id-scoped follow-up request apart from a follow-up for every entry. The I8 (r2) property that 77314cd1f adds, that only the named entries are fetched again, has no test that would fail if it regressed.
Impact: If the follow-up went back to `refreshProcessing()` with no ids (the r3 behaviour), entries in processing view that the event did not name would fetch again after an in-flight request. That is the I8 violation r3 reported. With two or more drawer entries a user would see extra core and addon requests during bulk indexing, and no test would catch it. The code is correct today. Only the guard is missing.
Evidence: frontend/src/hooks/useUpload.ts:264-268 replays `refreshProcessing([...queued.ids])` for an id queue. frontend/src/__tests__/uploadProcessingRefresh.test.tsx (the it.each 'follows a mid-request event naming $label') uses renderCompleted, which uploads only file_a, and asserts `callsSoFar[1]` equals `[["file_a"]]`. With one entry, an id-less follow-up also requests `["file_a"]`, so the assertion holds under both behaviours.
Repro: Mutation, reasoned and not executed: in useUpload.ts:267 replace `else void refreshProcessing([...queued.ids]);` with `else void refreshProcessing();`. The 'a held id' case still passes because the only entry is file_a, and the 'a foreign id' case still passes because queueProcessingRefresh returns before queuing. The mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a case with two completed entries (file_a and file_b, both in progress), deliver a mid-request event naming only file_a, and assert that the follow-up call is exactly [["file_a"]].

</details>

## Not verified

- claude-deep: I ran no frontend or backend tests. Mutant results are reasoned, not executed.
- claude-deep: I did not check that the proxy forwards the original percent-encoded header to upstream services rather than the decoded one. I relied on the drive-context section and drive_context.py's unquote.
- claude-deep: I did not re-read the truncated remainder of the submodule diff or docs/addons/intelligence.md.
- claude-deep: I did not check the exact file list of dbfcfb3ad, beyond its subject saying it is a review record.
- claude-read: I ran no tests or mutations. The survival of the R4-1 mutant is reasoned, not executed.
- claude-read: I did not re-read the truncated tail of the submodule diff or re-check the addon-side files, which were not changed in this round.
- claude-read: I did not verify how GitHub or the docs renderer slugs the heading behind the #drive-context-header-x-lit-drive anchor beyond the standard slug rule.
- claude-verify: I did not run the test suite or a mutation; the claims were checked by reading the code only.
- claude-verify: I did not review test files outside frontend/src/__tests__ for multi-entry mid-request coverage.

TOTAL: 2 findings
