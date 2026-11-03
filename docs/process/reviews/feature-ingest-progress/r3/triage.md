# Triage: r3

## Trajectory

This run:
- claude-deep: The rounds since r2 are two code fixes and two record commits. 7e28bdc adds no new branch or state. It replaces the raw header value with a percent-encoded one, matching the existing proxy convention, and does not repeat an earlier round's pattern. aee93a7 removes a branch: the 'fileIds === undefined' condition on queuing is gone, so every in-flight call collapses into one boolean flag. That widens the earlier prediction ('an in-flight answer cannot cover the new entry') into 'any call may be stale', and this over-reach produces deep-r3-1. The refresh queue has now been adjusted in two rounds: an id-less queue first, then an unconditional queue. It is still a single boolean, not a design that tracks pending ids, so the frontend refresh scheduling is being patched incrementally. 37a930af and a51507602 are review records only.
- claude-read: The two code fixes in this round do not add a branch, state or prediction of the kind earlier rounds added. 7e28bdc adds one encoding step at the existing call site (quote on X-Lit-Drive). It reuses the decoding the addon already performed, so it adds no new branch. aee93a7 removes a branch: the `fileIds === undefined` condition, which predicted that only tick or entry-driven calls could be stale, is gone, and every in-flight call is now queued. 37a930af4 and a51507602 are review records only. Earlier rounds patched app/addon_events.py one step at a time (first the secret header, then the drive refusal). This round touches other code (the core router and the frontend store) and simplifies rather than stacks. The one new seam is documentation: the processing_status section of ADDON-DEVELOPMENT.md still describes the header as raw (R3-1).

Earlier runs:
- r2 / claude-deep: The record holds three commits since r1. 9f90576 (docs) widened the spec with I14. 13dc968 changed code. 30a9962 (docs) recorded R-5. The code round added a new guard branch to the shared poster: it refuses drive-less posts. This repeats the earlier pattern of the previous fix (97bb107), which added the secret header to the same helper. Each review round has added one more precondition to app/addon_events.py after an earlier change made previously dropped events deliverable. So the poster's contract is being patched step by step rather than designed once. The round also removed a branch: _payload's conditional 'add drive only if present' is gone, and drive is now always set at the top level. It moved refine.started after the snapshot, so that event can name the drive. The core endpoint and the frontend did not change in these rounds.
- r2 / claude-read: Round 1 (97bb1070f, before r1) added a shared poster with a secret header, so events that had been 403-dropped started to be delivered. That newly exposed the drive-less broadcast. Round 2 (9f90576f2 spec I14, then 13dc9688a code) did not add a parallel branch for the same prediction. It removed the 'global broadcast when there is no drive' state from addon_events._payload, replaced it with a single refusal branch, and threaded an explicit drive through the refine, summaries and vision emitters. 30a9962a2 is a record only. Each round did fix a consequence the previous round exposed (secret, then drive scope), so the poster is still being patched incrementally. But round 2 removed a state rather than stacking one, and it moved refine.started after the snapshot, which created the drop described in R2-1.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-deep:deep-r3-1 is bucket A or BLOCKER

## Findings

A: 1
B: 2
C: 0

### claude-deep:deep-r3-1 — bucket A, LOW, open

Claim: Since aee93a7, any processing.updated event that arrives while a drawer request is in flight queues a follow-up refresh with no id filter. This holds even when the event names only files the drawer does not hold, so the follow-up request fetches every entry in processing view, including entries the event did not name.
Impact: During bulk indexing (resume, metadata batches, scans on a drive the viewer can open), events arrive every few seconds for files outside the drawer. Each event that lands during a request triggers another full request once that request ends. The drawer can then chain requests back to back, each costing up to about 3 s of addon calls, for as long as any entry is not ready (up to 30 minutes), instead of sending one request per 30 s tick. No stage is shown wrongly. The cost is extra core and addon load, and the spec says events for files the drawer does not hold are ignored.
Evidence: frontend/src/hooks/useUpload.ts:285-287 handleProcessingUpdated forwards any non-empty id list without checking that a held entry matches it. useUpload.ts:234-237 sets processingRefreshQueued = true unconditionally when a request is in flight. useUpload.ts:244-246 then calls refreshProcessing() with no fileIds, which targets every entry that needsProcessingFetch. The id filter in refreshProcessingOnce applies only when a request is not already in flight. The test 'refreshes on an event naming its file and ignores another file' sends the foreign event while no request is in flight, so it does not exercise this path. The new mid-request test uses an event that names the held file.
Repro: Mutation thought experiment on uploadProcessingRefresh.test.tsx: copy the 'refreshes after a request ends when its event arrives mid-request' test, but set the event's file_ids to ['file_other']. At HEAD, getFilesProcessing is called a second time after first.resolve. The spec's 'ignored' behaviour expects one call. Not executed (read-only review).
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In the in-flight branch, queue the refresh only when fileIds is undefined or names a held entry that still needs fetching, and keep the union of queued ids so that the follow-up request asks only for those ids (or for all entries when an id-less call was queued).

</details>

### claude-read:R3-1 — bucket B, LOW, open

Claim: docs/ADDON-DEVELOPMENT.md documents the core-to-addon processing call as carrying `X-Lit-Drive: <drive>`. Since 7e28bdc the core sends `quote(drive, safe="")`, so the value an addon receives is percent-encoded.
Impact: An addon author who follows this section and reads the header literally, without percent-decoding it, gets the wrong drive name for any drive whose name is non-ASCII or contains reserved characters. That addon then matches no rows and leaves every such file out, so the file shows the unavailable stage and is never Ready. Intelligence itself is unaffected because drive_context.py:30 unquotes the header. Litloft has only first-party addons, so the risk is limited to a future addon.
Evidence: docs/ADDON-DEVELOPMENT.md:371-373 says 'The request carries `X-Lit-Drive: <drive>`'. backend/app/routers/files_processing.py sends headers={"X-Lit-Drive": quote(drive, safe="")}. addons/intelligence/app/drive_context.py:30 returns unquote(x_hv_drive). The proxy section at ADDON-DEVELOPMENT.md:350 and :722 describes the browser path as percent-encoded, but the processing section does not.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Change the line to say the header carries the percent-encoded drive name (as `encodeURIComponent(drive)` does for the proxy), or remove `<drive>` and point to the Drive context header section.

</details>

### claude-deep:deep-r3-2 — bucket B, INFO, open

Claim: The X-Lit-Drive fix (7e28bdc) is covered by a single test that only checks the stub's decoded header and ids. Nothing tests the addon side end to end, so a drive name the stub decodes correctly is assumed to also be decoded by intelligence's require_drive.
Impact: There is no current defect: drive_context.py:30 calls unquote, which matches quote(drive, safe=''). Drive names that contain '%' now round-trip correctly where before they did not. The only risk is that a future change to the addon's decoding would not be caught by the core test.
Evidence: backend/app/routers/files_processing.py:155 sends quote(drive, safe=''). addons/intelligence/app/drive_context.py:30 returns unquote(x_hv_drive). backend/tests/test_files_processing.py test_spec_core_031_i2_each_call_carries_one_drives_ids_and_its_name decodes the header with unquote inside the stub.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I ran no tests, frontend or backend.
- claude-deep: I did not measure how often intelligence posts processing.updated during bulk resume in practice.
- claude-deep: I did not re-read the truncated tail of the submodule diff or the docs/addons/intelligence.md change.
- claude-deep: I did not re-check the core WS drive filtering for processing.updated, and relied on r1 and r2 for it.
- claude-read: I ran no tests, gates or mutations. The killed or survived judgements above are reasoned, not executed.
- claude-read: I did not confirm the exact file list of a51507602 or 37a930af4. I assume from their subjects that they are docs-only.
- claude-read: I did not check whether an intelligence-side test exercises require_drive with a percent-encoded non-ASCII header on POST /files/processing.
- claude-read: I did not re-check the truncated remainder of the submodule diff.
- claude-verify: I did not run the test suites; I have no command execution.
- claude-verify: I did not check whether docs/reference/api.md also describes the header encoding.
- claude-verify: I did not check needsProcessingFetch's exact conditions beyond its use in refreshProcessingOnce.

TOTAL: 3 findings
