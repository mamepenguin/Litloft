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

## Read coverage

Product files:
- addons/media_import/backend/service.py — full: Read every changed hunk with its enclosing function: lines 160-359 (`_caption_track`, `_fetch_metadata_sync`, classifiers, new helpers, `_download_captions_sync`), 410-434 (`_should_run_stt`) and 820-1119 (`_worker`, `_retry_failed_captions`, `_fetch_and_update`, start of `_download_stt_and_notify`).
- addons/media_import/backend/subscription/manager.py — full: Read the changed hunk and its enclosing import function (lines 680-789), plus the caller's record of `transcript_error` (lines 520-545).
- addons/media_import/backend/subscription/providers/youtube.py — full: Read the changed hunk in `fetch_item` (lines 505-606, including `fetch_transcript`) and `_classify_fetch_error` with its markers (lines 60-110).
- addons/media_import/backend/subscription/registry.py — full: Read the changed `ItemMetadata` dataclass in full (lines 80-120).

Test files:
- addons/media_import/backend/tests/test_spec_addon_165_caption_track.py — full: Read the whole file from the supplied diff, where it is a new file shown in full; it was not opened with the Read tool. Checked its imported names in test_youtube_item_classification.py.

## Needs a human

### unspecified_behavior

Note: Non-YouTube URLs (Vimeo, other sites) on the fetch path are subject to the YouTube candidate rule and the YouTube error classifier (R3).; `subscription/db.py:1051-1065` (`register_loft`) writes `has_captions` with the new meaning on the subscription path. The touch points cover the table but do not name this writer.; If `_mark_caption_error_permanent` raises (DB error), it replaces the original yt-dlp exception in the `_worker` log.
- claude-read: Non-YouTube URLs (Vimeo, other sites) on the fetch path are subject to the YouTube candidate rule and the YouTube error classifier (R3).
- claude-read: `subscription/db.py:1051-1065` (`register_loft`) writes `has_captions` with the new meaning on the subscription path. The touch points cover the table but do not name this writer.
- claude-read: If `_mark_caption_error_permanent` raises (DB error), it replaces the original yt-dlp exception in the `_worker` log.
- claude-verify: Non-YouTube fetch-path URLs (e.g. Vimeo) are affected by _caption_track and by the YouTube error classifier. The spec does not discuss this (R3).

### unspecified_behavior

Note: Non-YouTube fetch-path URLs (e.g. Vimeo) are affected by _caption_track and by the YouTube error classifier. The spec does not discuss this (R3).
- claude-read: Non-YouTube URLs (Vimeo, other sites) on the fetch path are subject to the YouTube candidate rule and the YouTube error classifier (R3).
- claude-read: `subscription/db.py:1051-1065` (`register_loft`) writes `has_captions` with the new meaning on the subscription path. The touch points cover the table but do not name this writer.
- claude-read: If `_mark_caption_error_permanent` raises (DB error), it replaces the original yt-dlp exception in the `_worker` log.
- claude-verify: Non-YouTube fetch-path URLs (e.g. Vimeo) are affected by _caption_track and by the YouTube error classifier. The spec does not discuss this (R3).

## Findings

A: 0
B: 5
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The change reaches the URL-import speech-to-text path (`_should_run_stt` → `_download_stt_and_notify`, which writes a `.stt_temp` audio file beside the `.loft` and starts an intelligence job), and the touch-point list does not name it.
Impact: A URL import in the "If no captions" (`missing_captions`) mode of a chat-replay-only archive, or of a video with no candidate track, now downloads hours of audio and queues an STT job. Before this change it did neither, because `has_captions` was true. The spec's item 7 describes this, but no touch point or invariant guards it.
Evidence: service.py:1068-1073 passes `has_captions=bool(meta.get("has_captions"))` to `_should_run_stt`. service.py:422-425 returns `not has_captions` for `missing_captions`. service.py:1092-1118 (`_download_stt_and_notify`) downloads audio and emits `scan.complete`. service.py:200 changes `has_captions` to `caption_track is not None`. router.py:199-201 forwards the user's `stt_mode` into `enqueue_fetch`.
Repro: not_reproduced. By reading: for info {language: None, subtitles: {live_chat: ...}, automatic_captions: {}} the old code computed has_captions=True, so `_should_run_stt` returned False. The new code computes has_captions=False, so with stt_mode='missing_captions' `_should_run_stt` returns True. No new test covers this.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `_should_run_stt` / `_download_stt_and_notify` (`.stt_temp` audio, intelligence job) to the touch-point list. Optionally add a test pinning that a `missing_captions` URL import of a chat-replay-only video starts STT and a `manual` one does not.

</details>

### claude-read:R3 — bucket B, LOW, open

Claim: The fetch-path changes apply to every URL the `.loft` fetch path handles, including Vimeo and other sites. The touch points and invariants describe only YouTube.
Impact: For a non-YouTube URL, two things change. `has_captions` is now decided by the YouTube candidate rule: language-or-`ja`, `-orig`, then the base. A metadata error whose text matches the YouTube classifier's markers (`video unavailable`, `private video`, `this video is not available`, ...) marks the row `permanent`, which removes it from the startup retry. For example, a Vimeo video with no reported language and only `en` subtitles now shows the "YouTube has no captions" badge. In `missing_captions` mode it gets STT. Before, it had `has_captions` true and was retried forever. Whether this is right for other providers was not decided in the touch points.
Evidence: service.py:945-951 classifies any `_fetch_metadata_sync` exception with `_classify_fetch_error` from `subscription/providers/youtube.py`. That function is documented at youtube.py:63-71 as matching yt-dlp's YouTube ExtractorError texts. It runs regardless of `detect_provider(item.url)` (service.py:980). `_caption_track` (service.py:166-177) runs for every info dict. The docs say Vimeo is supported on the fetch path (docs/addons/media-import.md: "YouTube and Vimeo play in embedded players").
Repro: not_reproduced. Vimeo and other extractors' subtitle keys and error texts were not checked.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add non-YouTube URLs on the fetch path to the touch points, and state their intended handling. Alternatively, gate the `permanent` write on `detect_provider(item.url) == 'youtube'`.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The change alters what the subscription path writes to `subscription_videos.error_kind`, and the touch-point list names only `loft_metadata`, not that table.
Impact: Take a newly imported item with no usable track on a subscription without `include_no_transcript`. It is recorded `imported` with `error_kind` NULL instead of `no_transcript`, and `subdb.update_caption_state` is no longer called for it. Spec item 4 states that nothing reads the difference for an `imported` row, so no user-visible defect was found. The table change is still unplanned with respect to the touch-point list.
Evidence: manager.py:730 now skips `fetch_transcript` because `meta.has_captions` is False for chat-replay-only items. manager.py:729/738 then leaves `transcript_error` None. manager.py:532-535 records `imported` with `error_kind=outcome.transcript_error`. Before, the provider returned `ERROR_NO_TRANSCRIPT` (youtube.py:599-604, registry.py:33) for these items.
Repro: not_reproduced. test_spec_addon_166_subscription_imports_a_chat_replay_only_video_without_a_caption_download asserts (status, error_kind) == ('imported', None), which confirms the new write.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `subscription_videos` (`error_kind` written by `SubscriptionManager`) to the touch-point list.

</details>

### claude-read:R4 — bucket B, INFO, open

Claim: The change reaches the frontend `CaptionStatusBadge` (and `LoftMetadataPanel` through it) through the new `has_captions` meaning and the new `permanent` write. The touch-point list names no frontend file.
Impact: Rows that showed the retryable "Caption download failed" now show "YouTube has no captions". Unavailable rows show the permanent-failure label. There is no code change; only displayed state changes, as spec item 7 describes.
Evidence: CaptionStatusBadge.tsx:59 branches on `!metadata.has_captions` before `caption_error_kind`. api.ts:26 and schemas.py:35 expose `has_captions`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `frontend/CaptionStatusBadge.tsx` (read-only, behaviour changes) in the touch-point list.

</details>

### claude-read:R5 — bucket B, INFO, open

Claim: The new test module imports its data table (`_CASES`, `_PREFIX`, `UNAVAILABLE`) from an existing test module, `tests/test_youtube_item_classification.py`. The touch points describe only new tests.
Impact: If someone edits the classification table in the other test file, the SPEC-ADDON-167 test silently changes what it checks. If they remove or rename those names, the new test breaks at import time. No product impact.
Evidence: test_spec_addon_165_caption_track.py:21-25 imports from addons.media_import.tests.test_youtube_item_classification. That file defines _PREFIX at line 28, UNAVAILABLE at line 36 and _CASES at line 40.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Tests were not run; this review is read-only.
- claude-read: Vimeo and other non-YouTube extractors' subtitle key shapes and error texts versus `_classify_fetch_error` markers.
- claude-read: Whether real yt-dlp writes exactly one track for `subtitleslangs: [key]` when sibling keys such as `en-orig` are listed.
- claude-read: The `def` line of the manager.py import function (line 679) and the rest of manager.py outside lines 520-545 and 680-789.
- claude-read: The intelligence addon's handling of the new `.stt_temp` jobs.
- claude-verify: I did not run the test suite, and I did not compare against origin/develop with git: the pre-change has_captions definition was taken from the spec's description (line 19).
- claude-verify: api.ts:26 and schemas.py:35, which the R4 evidence cites, were not opened.
- claude-verify: How yt-dlp actually names Vimeo subtitle keys and errors was not checked.

TOTAL: 5 findings
