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
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Non-processing intelligence events (refine, summaries, transcription, vision) now reach the browser when CORE_INTERNAL_SECRET is set; before this change they were dropped with 403.; refine, summaries, whisper and vision posts now use trust_env=False, so a proxy set through the environment is no longer used for the core call.; chapter_suggestions and video_visual now swallow every exception, not only httpx.HTTPError.
- claude-deep: Vision, refine, summaries and transcription events now pass the core's secret gate and are broadcast. Vision events without a drive go to every viewer.
- claude-deep: chapter_suggestions and video_visual now swallow every exception, where before they caught only httpx.HTTPError.
- claude-read: Non-processing intelligence events (refine, summaries, transcription, vision) now reach the browser when CORE_INTERNAL_SECRET is set; before this change they were dropped with 403.
- claude-read: refine, summaries, whisper and vision posts now use trust_env=False, so a proxy set through the environment is no longer used for the core call.
- claude-read: chapter_suggestions and video_visual now swallow every exception, not only httpx.HTTPError.
- claude-verify: Unscoped intelligence events (vision_describe.*, and possibly others that do not set data['drive']) are now delivered to every connected viewer when CORE_INTERNAL_SECRET is set. Before this change they were presumably dropped with a 403.

### unspecified_behavior

Note: Unscoped intelligence events (vision_describe.*, and possibly others that do not set data['drive']) are now delivered to every connected viewer when CORE_INTERNAL_SECRET is set. Before this change they were presumably dropped with a 403.
- claude-deep: Vision, refine, summaries and transcription events now pass the core's secret gate and are broadcast. Vision events without a drive go to every viewer.
- claude-deep: chapter_suggestions and video_visual now swallow every exception, where before they caught only httpx.HTTPError.
- claude-read: Non-processing intelligence events (refine, summaries, transcription, vision) now reach the browser when CORE_INTERNAL_SECRET is set; before this change they were dropped with 403.
- claude-read: refine, summaries, whisper and vision posts now use trust_env=False, so a proxy set through the environment is no longer used for the core call.
- claude-read: chapter_suggestions and video_visual now swallow every exception, not only httpx.HTTPError.
- claude-verify: Unscoped intelligence events (vision_describe.*, and possibly others that do not set data['drive']) are now delivered to every connected viewer when CORE_INTERNAL_SECRET is set. Before this change they were presumably dropped with a 403.

### unspecified_behavior

Note: Vision, refine, summaries and transcription events now pass the core's secret gate and are broadcast. Vision events without a drive go to every viewer.; chapter_suggestions and video_visual now swallow every exception, where before they caught only httpx.HTTPError.
- claude-deep: Vision, refine, summaries and transcription events now pass the core's secret gate and are broadcast. Vision events without a drive go to every viewer.
- claude-deep: chapter_suggestions and video_visual now swallow every exception, where before they caught only httpx.HTTPError.
- claude-read: Non-processing intelligence events (refine, summaries, transcription, vision) now reach the browser when CORE_INTERNAL_SECRET is set; before this change they were dropped with 403.
- claude-read: refine, summaries, whisper and vision posts now use trust_env=False, so a proxy set through the environment is no longer used for the core call.
- claude-read: chapter_suggestions and video_visual now swallow every exception, not only httpx.HTTPError.
- claude-verify: Unscoped intelligence events (vision_describe.*, and possibly others that do not set data['drive']) are now delivered to every connected viewer when CORE_INTERNAL_SECRET is set. Before this change they were presumably dropped with a 403.

## Findings

A: 0
B: 7
C: 0

### claude-deep:scope-1 — bucket B, MEDIUM, open

Claim: The gitlink bump rewrites the event emitters of five intelligence workers that are not in the touch-point list (chapter_suggestions.py, refine.py, summaries.py, video_visual.py, vision.py), plus whisper's generic _emit_ws_event, by routing them through a new unlisted module app/addon_events.py. This changes how events that have nothing to do with processing.updated get delivered.
Impact: In production, CORE_INTERNAL_SECRET is set and /api/internal/addon-events rejects any request without the header (backend/app/routers/internal.py:62-65, 731). Before this change, the refine, summaries, vision and whisper emitters posted without the header, so their events were dropped. Now they arrive and are broadcast. Vision's events carry no drive (vision.py:763-808: data is {file_id, model|reason}), so the core broadcasts them with drive=None (internal.py:740) to every connected viewer. That includes viewers who cannot open the file's drive, which breaks the design-decisions rule on the drive boundary for locked drives. Frontend handlers for refine, summary, vision and transcription events, which effectively never fired before, now fire in normal use.
Evidence: addons/intelligence/app/addon_events.py (new) adds X-Internal-Secret, trust_env=False and raise_for_status. The old refine.py, summaries.py, vision.py and whisper.py _emit_ws_event bodies sent no secret header, and vision.py sent no top-level drive. The new vision.py:473-476 calls post_addon_event(event, data), and _payload lifts a drive only from data['drive'], which vision never sets. The spec's touch points name only metadata.py, whisper.py (for processing.updated), indexer.py, routers/files.py, the manifest, the messages and the tests.
Repro: Read-only. With CORE_INTERNAL_SECRET set, trace one vision event: the old body posted {event, data} with no secret, which verify_internal_secret rejects with 403. The new body posts with the secret, and broadcast is called with drive=None. Not executed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either keep the shared helper limited to the processing.updated poster and leave the other workers alone, or add the five workers and addon_events.py to the touch points through a spec revision and make vision events carry drive before they become deliverable.

</details>

### claude-read:TP-1 — bucket B, MEDIUM, open

Claim: The intelligence diff changes five event-posting workers that are not in the touch-point list (app/workers/chapter_suggestions.py, refine.py, summaries.py, video_visual.py, vision.py), and also rewrites whisper.py's general _emit_ws_event; the list names whisper.py only for processing.updated posts.
Impact: Every intelligence WebSocket event (refine, summaries, transcription, vision_describe, video_visual, chapter_suggestions) now goes through app.addon_events.post_addon_event, which adds X-Internal-Secret and trust_env=False. Before this change, refine, summaries, whisper and vision posted with no secret. With CORE_INTERNAL_SECRET set, verify_internal_secret rejected those posts with 403 and the events were silently dropped. They are now delivered. That is a user-visible change in which progress and completion events reach the browser, and the spec does not plan or describe it.
Evidence: addons/intelligence/app/workers/refine.py:627, summaries.py:53, whisper.py:77 and vision.py:476 now call post_addon_event; the removed code posted json without headers. backend/app/routers/internal.py:62-66 returns 403 when a secret is set and the header is missing; internal.py:729-731 applies that gate to /addon-events. The touch-point list (docs/specs/ingest-progress.md, Touch points, Addon) names only metadata.py, whisper.py and indexer.py among the workers.
Repro: Read the diff: chapter_suggestions.py, refine.py, summaries.py, video_visual.py and vision.py appear in the submodule diff and are absent from the touch-point list. decisions.md records 21 addon-events posts answering 204 after the change.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either add the shared-poster refactor and its effect (non-processing events now delivered when the secret is set) to the spec's touch points and section 7, or split it into its own change.

</details>

### claude-deep:scope-4 — bucket B, LOW, open

Claim: whisper.py changes go beyond posting processing.updated: _record_failed_job gains a required drive parameter, and the generic transcription event emitter is replaced.
Impact: Any other caller of _record_failed_job that does not pass drive raises TypeError. That error is not caught by the function's own best-effort wrapper, because it happens at the call site. intelligence.transcription.* events now reach browsers in production; before, the missing secret dropped them.
Evidence: whisper.py, in the hunks around lines 1001-1035 (signature) and 61-77 (_emit_ws_event). In the diff, only the two index_whisper call sites were updated. I did not grep for other callers.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-2 — bucket B, LOW, open

Claim: vision.py's events carry no drive, so now that the shared poster delivers them, the core broadcasts intelligence.vision_describe.* with file_id to every connected viewer, including viewers who cannot open the file's drive.
Impact: A viewer without a locked drive's group receives vision_describe started/failed/succeeded events naming a file id from that drive. The design rule 'drive boundary and absence for locked drives' says such viewers should not see these. Before the change the events were dropped with 403 whenever the secret was set, so the leak could not happen in production.
Evidence: addons/intelligence/app/workers/vision.py:763-766, 786-789 and 914-918 build data with file_id and no drive. addon_events.py:_payload sets the top-level drive only when drive or data['drive'] is given. backend/app/services/ws.py:51-59: when drive is None, access_group is None and the message goes to every connection.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pass the file's drive to vision's _emit_ws_event, or record that vision events stay drive-less.

</details>

### claude-deep:scope-2 — bucket B, INFO, open

Claim: The diff adds addons/intelligence/app/processing_events.py, a new module that the touch-point list does not name.
Impact: It contains the 100-id splitting and the swallow-on-failure policy that I6 depends on, so a reader who works from the touch points would miss where I6 is actually enforced.
Evidence: addons/intelligence/app/processing_events.py (new). It is imported by metadata.py, whisper.py and indexer.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:scope-3 — bucket B, INFO, open

Claim: The diff changes addons/intelligence/app/schemas.py (it adds ProcessingRequest, ProcessingStage, ProcessingFile and ProcessingResponse), and the touch-point list does not name that file.
Impact: There is no user-visible effect. The touch-point list is incomplete for the addon's request/response models, even though the core-side schemas.py is listed.
Evidence: addons/intelligence/app/schemas.py at the hunk at line 266.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, INFO, open

Claim: Three intelligence modules not in the touch-point list are added or changed: app/addon_events.py (new shared poster), app/processing_events.py (new processing.updated emitter) and app/schemas.py (intelligence request and response models). The list names only the core backend/app/schemas.py.
Impact: These are supporting code for listed behaviour. A user cannot hit anything beyond TP-1. The list does not describe the module boundary that now owns every addon-event post, and tests/test_addon_event_secret.py enforces that boundary.
Evidence: Submodule diff: new addons/intelligence/app/addon_events.py and app/processing_events.py; addons/intelligence/app/schemas.py:269-297 adds ProcessingRequest, ProcessingStage, ProcessingFile and ProcessingResponse.
Repro: Compare the submodule file list in the diff with the spec's Addon touch points.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I did not grep for other callers of whisper._record_failed_job.
- claude-deep: I did not check which frontend handlers consume intelligence.vision_describe, refine or summary events.
- claude-deep: I ran no tests and did not run the gates.
- claude-deep: I did not check the full set of submodule commits between bb0b6aa and c1d2c57 beyond the diff shown.
- claude-read: I took the supplied diff, which is the branch against origin/develop, as the change. I did not confirm which of these files commit ce7f9f4fe itself touches; its subject says it is docs-only.
- claude-read: I did not check whether the frontend subscribes to vision_describe or refine events and how it shows them.
- claude-read: I did not run any test.
- claude-verify: The pre-change bodies of the worker emitters, because I have no git or diff access. Whether they lacked the secret header is taken from the reviewers.
- claude-verify: Whether refine, summaries, chapter_suggestions and video_visual events set data['drive'].
- claude-verify: The contents of test_addon_event_secret.py, and whether any test exercises the delivery of drive-less vision events.
- claude-verify: Frontend handling of intelligence.vision_describe.* events.

TOTAL: 7 findings
