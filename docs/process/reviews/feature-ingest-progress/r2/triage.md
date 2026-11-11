# Triage: r2

## Trajectory

This run:
- claude-deep: The record holds three commits since r1. 9f90576 (docs) widened the spec with I14. 13dc968 changed code. 30a9962 (docs) recorded R-5. The code round added a new guard branch to the shared poster: it refuses drive-less posts. This repeats the earlier pattern of the previous fix (97bb107), which added the secret header to the same helper. Each review round has added one more precondition to app/addon_events.py after an earlier change made previously dropped events deliverable. So the poster's contract is being patched step by step rather than designed once. The round also removed a branch: _payload's conditional 'add drive only if present' is gone, and drive is now always set at the top level. It moved refine.started after the snapshot, so that event can name the drive. The core endpoint and the frontend did not change in these rounds.
- claude-read: Round 1 (97bb1070f, before r1) added a shared poster with a secret header, so events that had been 403-dropped started to be delivered. That newly exposed the drive-less broadcast. Round 2 (9f90576f2 spec I14, then 13dc9688a code) did not add a parallel branch for the same prediction. It removed the 'global broadcast when there is no drive' state from addon_events._payload, replaced it with a single refusal branch, and threaded an explicit drive through the refine, summaries and vision emitters. 30a9962a2 is a record only. Each round did fix a consequence the previous round exposed (secret, then drive scope), so the poster is still being patched incrementally. But round 2 removed a state rather than stacking one, and it moved refine.started after the snapshot, which created the drop described in R2-1.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-deep:deep-r2-1 is bucket A or BLOCKER

## Findings

A: 1
B: 3
C: 0

### claude-deep:deep-r2-1 — bucket A, HIGH, open

Claim: The core's processing call puts the raw drive name in the X-Lit-Drive header. httpx 0.28 encodes str header values as ASCII, so for a drive whose name is non-ASCII (for example Japanese) the request raises before it is sent, and intelligence is never asked about that drive's files.
Impact: Every file uploaded to a drive with a non-ASCII name gets intelligence's required `unavailable` stage on every answer. The drawer never shows Ready, shows 確認できません with a spinner for 30 minutes, then switches to grey dashes, even though the file is indexed. The WARNING log fires once a minute. Non-ASCII drive names are a supported case: the proxy and the frontend percent-encode them for exactly this reason.
Evidence: backend/app/routers/files_processing.py:152 sends `headers={"X-Lit-Drive": drive}` with the unencoded name. The proxy receives the header already percent-encoded by the browser (frontend/src/lib/semanticSearch.ts:14 uses `encodeURIComponent(drive)`) and its comment at backend/app/routers/addon_proxy.py:496-498 says 'Header values are ISO-8859-1 only; the frontend percent-encodes drive names so non-ASCII (e.g. Japanese) names round-trip safely'. The addon decodes with `unquote` (addons/intelligence/app/drive_context.py:30). backend/requirements.txt:9 pins httpx==0.28.1, whose header normalisation calls `value.encode('ascii')`; the UnicodeEncodeError is swallowed by `except Exception` at files_processing.py:160 and turns into the unavailable stage. Every test uses the ASCII TEST_DRIVE or 'other-drive', so none would catch this.
Repro: Mutation in head: add a drive named with Japanese characters to drives.json in test_spec_core_031_i2_each_call_carries_one_drives_ids_and_its_name, put a file on it, and register a stub addon. Expected: the stub records no call for that drive, and the file's stages are [saved, unavailable]. Not executed (read-only review).
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Send `quote(drive, safe='')` in X-Lit-Drive, the same way the frontend encodes it for the proxy. Add a test with a non-ASCII drive name that asserts the stub receives the decoded drive and the ids.

</details>

### claude-deep:deep-r2-2 — bucket B, LOW, open

Claim: handleProcessingUpdated drops an event-driven refresh, without queuing it, when a request is already in flight. An event that arrives during a tick request is therefore lost even though the drawer received it.
Impact: A file whose search index finishes while a drawer request is running keeps its old pending line for up to 30 s more, instead of switching to Ready when the event arrives. This is cosmetic, and the next tick recovers it.
Evidence: frontend/src/hooks/useUpload.ts refreshProcessing: `if (processingInFlight) { if (fileIds === undefined) processingRefreshQueued = true; return; }`. Only tick-driven or entry-driven calls are queued; event-driven calls (fileIds defined) are discarded. The in-flight answer may have been computed by the core before the addon's write committed.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Queue event-driven refreshes too, either by setting processingRefreshQueued for both cases or by keeping a pending id set.

</details>

### claude-read:R2-1 — bucket B, LOW, open

Claim: A refine job whose file row cannot be read posts no events at all. When the snapshot raises, `drive` stays None and the `intelligence.refine.failed` event is refused by the new drive gate. When the row is missing, `refine.started` and `refine.completed` are refused too, because `refine.started` now waits for the snapshot that supplies the drive.
Impact: Before the fix, refine.started always went out first and refine.failed followed on a snapshot error (whenever the secret check let the post through). Now a client gets no lifecycle event for these jobs, and a warning is logged instead. A grep of the frontend found no consumer of intelligence.refine.*, so the user-visible effect today is nil. A future listener would wait forever on a job that failed at snapshot.
Evidence: addons/intelligence/app/workers/refine.py:695-710: `drive` is initialised to None, and the except branch emits refine.failed with drive=None. refine.py:713 moves refine.started after the snapshot. addon_events.py:62-65 returns False without posting when no drive is given. tests/test_addon_event_drive.py covers refine only with a present IndexedFile row.
Repro: not_reproduced. Read-only trace: make the `_snapshot` call raise, then follow `_emit_ws_event`, which calls `post_addon_event`, where `_scoped_drive` returns None, the warning is logged and nothing is posted.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pass the drive into start_refine_job from the drive-scoped route that starts the job, so that started and failed can name a drive without depending on the snapshot.

</details>

### claude-read:R2-2 — bucket B, INFO, open

Claim: fail_orphaned_running_jobs, which runs at container startup, now makes one synchronous HTTP post to the core per drive, with a 3 s timeout each, before startup continues.
Impact: When the intelligence container restarts with orphaned running jobs while the core is down or still starting, startup is delayed by up to 3 s per affected drive, and the processing.updated event is lost. The drawer recovers on its next tick, so the user sees no wrong result.
Evidence: addons/intelligence/app/workers/whisper.py:1584-1590 calls emit_processing_updated synchronously after the session closes. processing_events.py:40 calls post_addon_event_sync, and addon_events.py:28 sets _TIMEOUT_SECONDS = 3.0.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I did not execute any test. The httpx ASCII header behaviour comes from httpx 0.28 source knowledge and the pinned version, not from a run.
- claude-deep: I did not check whether any configured drive in the user's drives.json actually has a non-ASCII name.
- claude-deep: I did not read backend/app/routers/internal.py or ws.py again to confirm how processing.updated is drive-filtered; I rely on r1's verification.
- claude-deep: I did not review every hunk of the truncated submodule diff, such as the remainder of the processing-events tests or the docs/addons/intelligence.md change.
- claude-deep: I did not check the frontend consumers of intelligence.refine.* to see whether the reordered started event matters.
- claude-read: I ran no tests and no gates.
- claude-read: I did not read the exact file list of commit 30a9962a2 itself. I assume from its subject that it touches only docs/process.
- claude-read: I did not check the core frontend for consumers of intelligence.refine.*, transcription.* or vision_describe.* events beyond a grep of .ts/.tsx files for refine event names.
- claude-read: I did not verify the frontend processing view (useUpload.ts and UploadProgress.tsx) beyond the earlier reviews' scope, because the fix commits do not touch it.
- claude-verify: I could not run httpx to observe the UnicodeEncodeError; this rests on knowledge of httpx 0.28.1's header normalisation.
- claude-verify: I did not diff against origin/develop to confirm which of these behaviours this branch introduced.
- claude-verify: I did not read tests/test_addon_event_drive.py to confirm what it covers.

TOTAL: 4 findings
