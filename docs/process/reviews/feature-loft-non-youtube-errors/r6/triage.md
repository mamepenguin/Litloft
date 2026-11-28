# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F2 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/app/routers/rag.py — partial: Read lines 545-614 (_text_question_stream, including the changed image_applies hunk) and file_question.py lines 300-360.
- addons/media_import/backend/router.py — partial: Read the imports and lines 170-330 (create_loft, _require_active_file_in_drive, _loft_url_from_file, refresh_loft).
- addons/media_import/backend/service.py — partial: Read the imports and lines 225-395 and 745-840 (classification helpers, _resolve_drive_file_path, create_loft_sync, enqueue_fetch).
- addons/media_import/frontend/CaptionStatusBadge.ja.test.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/CaptionStatusBadge.test.tsx — partial: Changed hunks in the diff only.
- addons/media_import/frontend/Composer.test.tsx — partial: Changed hunk in the diff only.
- addons/media_import/frontend/Composer.tsx — partial: Changed hunks of the submit handler in the diff only.
- addons/media_import/frontend/ImportErrors.ja.test.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/ImportErrors.test.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/ImportFromUrl.test.tsx — partial: Changed hunks in the diff only.
- addons/media_import/frontend/ImportFromUrlDialog.tsx — partial: Changed hunks in the diff only.
- addons/media_import/frontend/api.ts — partial: Changed hunks (CreateLoftError, createLoft) in the diff only.
- addons/media_import/frontend/lib/linkFailure.ts — full: New file, read in full from the diff.
- addons/media_import/frontend/messages/en.json — partial: Changed hunks in the diff only.
- addons/media_import/frontend/messages/ja.json — partial: Changed hunks in the diff only.
- addons/media_import/frontend/players/VimeoEmbed.tsx — partial: Changed hunks in the diff, which include the component body.
- addons/media_import/frontend/players/YouTubeEmbed.tsx — partial: Read lines 95-494, covering the component, the player effect and the render branches. The import hunk was read in the diff.
- addons/media_import/frontend/players/loadYouTubeIframeApi.ts — partial: Changed onerror hunk in the diff only.
- frontend/src/components/loft/LoftPlayer.tsx — partial: Changed hunks in the diff, which cover the state, effect and render branches.
- frontend/src/messages-core/en.json — partial: Changed hunk in the diff only.
- frontend/src/messages-core/ja.json — partial: Changed hunk in the diff only.

Test files:
- addons/intelligence/tests/test_spec_addon_114_text_video_frames.py — partial: Changed hunk in the diff only.
- addons/media_import/backend/tests/test_spec_addon_188_189_link_errors.py — full: New file, read in full from the diff.
- addons/media_import/frontend/__tests__/importErrorCases.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/players/__tests__/EmbedLinkCard.test.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/players/__tests__/loadYouTubeIframeApi.test.ts — full: New file, read in full from the diff.
- frontend/src/components/loft/__tests__/LoftPlayer.pictureOverlay.test.tsx — partial: Changed hunk in the diff only.
- frontend/src/components/loft/__tests__/LoftPlayer.readFailure.ja.test.tsx — full: New file, read in full from the diff.
- frontend/src/components/loft/__tests__/LoftPlayer.readFailure.test.tsx — full: New file, read in full from the diff.
- frontend/src/components/loft/__tests__/LoftPlayer.test.tsx — partial: Changed hunk in the diff only.

## Unspecified behavior, recorded

- claude-read: A YouTubeEmbed reused for a video id whose API load failed earlier, after another URL loaded in between, renders an empty player box and makes no new load attempt.
  - F1 × I4 = 4, claude-read: It needs a transient IFrame API failure followed by success while the same embed moves A→B→A in queue play; the user sees a blank player until a reload.
  - F1 × I5 = 5, claude-verify: The IFrame API load has to fail for one video, succeed for another, and then the same player instance has to return to the first (for example A→B→A in a collection or through navigation). The user then sees an empty black player box with no link and no retry, until the page reloads.
- claude-read: rag.py now calls _has_frame_source, which reads the .loft file, for every question about a .loft video with a position, including for a profile that cannot see.
  - F5 × I1 = 5, claude-read: Each Ask on a .loft reads one small file from disk; nothing visible changes.
  - F5 × I1 = 5, claude-verify: Every question about a .loft video with a position now reads one small file from disk, even when the profile cannot see images, and the user notices nothing.
- claude-read: A refresh with no metadata row queues the .loft file's url as stored, without stripping it, though the emptiness check uses strip().
  - F0 × I2 = 0, claude-read: Only a hand-edited .loft with surrounding whitespace in url triggers it; yt-dlp receives the padded URL.
  - F0 × I2 = 0, claude-verify: The url field would need surrounding whitespace, and the app does not write .loft files that way, so the file would have to be hand-edited before a fetch could get a padded URL.
- claude-verify: When LoftPlayer's fileId changes, it keeps showing the previous content and passes the new fileId with the old url to the embed until the new fetch resolves.
  - F5 × I2 = 10, claude-verify: Moving between .loft files, for example to the next video in a collection, briefly mounts or keeps the previous video's player under the new fileId, which can cause a short flash of the old video.
  - single-scored

## Findings

A: 1
B: 2
C: 0

### claude-read:F2 — bucket A, LOW, open

Claim: After a YouTubeEmbed instance's IFrame API load fails for video A, then succeeds for video B, then the same instance is given A again, the effect returns early at the failedVideoIdRef check while loadFailed is false, so it shows an empty player box instead of a player or the link card.
Impact: In collection or queue play, a rebuilt-in-place embed that returns to a video whose earlier load failed shows a blank player area and never retries, although the API loads by then. Reopening the page recovers it.
Evidence: YouTubeEmbed.tsx:264 `if (failedVideoIdRef.current === videoId) return;` skips setLoadFailed. Line 266 cleared loadFailed when B's effect ran, and line 380 sets failedVideoIdRef only on failure, so it still holds A. B's cleanup (lines 383-415) destroys the player and empties the host. Line 451 then renders neither the link card nor a player for A.
Repro: not_reproduced. Mentally: render URL_A with a rejecting loader; rerender URL_B with a working loader; rerender URL_A. No YT.Player is constructed for A and no link card is shown. EmbedLinkCard.test.tsx covers only A→B.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In the early-return branch, call setLoadFailed(true). Alternatively, reset failedVideoIdRef when videoId changes, so a new URL retries.

</details>

### claude-read:F1 — bucket B, INFO, open

Claim: The diff adds a product module, addons/media_import/frontend/lib/linkFailure.ts, which the touch-point list of the declared invariants does not name.
Impact: None at runtime. A reviewer who scopes by the touch-point list would skip the function that decides which message Composer and ImportFromUrlDialog show (the I2/I2b mapping).
Evidence: addons/media_import/frontend/lib/linkFailure.ts:1-19 (new file) defines linkFailureMessage, which Composer.tsx and ImportFromUrlDialog.tsx import. The touch points list api.ts, Composer.tsx and ImportFromUrlDialog.tsx but no lib/ module. Every other product path the diff reaches is listed: router.py, service.py, api.ts, Composer.tsx, ImportFromUrlDialog.tsx, the messages files, VimeoEmbed, YouTubeEmbed, loadYouTubeIframeApi, rag.py, LoftPlayer and messages-core. file_question.py is listed but is only called, not changed.
Repro: Compare the product file list with the Touch points section of docs/specs/loft-non-youtube-errors.md.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add addons/media_import/frontend/lib/linkFailure.ts to the touch points.

</details>

### claude-read:F3 — bucket B, INFO, rejected

Claim: With no metadata row, a refresh whose stored file_path hits an AmbiguousPath in resolve_on_disk raises an uncaught exception and answers 500, not the 404 'unreadable' answer.
Impact: The menu shows the same refreshFailed toast. It needs case-ambiguous duplicate directory names on disk.
Evidence: router.py:265-270 catches only (OSError, ValueError). service.py:367-373 _resolve_drive_file_path calls resolve_on_disk, which can raise AmbiguousPath (backend/app/services/diskpath.py:31 subclasses Exception directly).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Also catch AmbiguousPath in _loft_url_from_file.

</details>

## Not verified

- claude-read: Ran no tests; every behaviour above was judged by reading the code.
- claude-read: Did not read the internals of _classify_fetch_error in subscription/providers/youtube.py or the marker lists.
- claude-read: Did not check whether LoftPlayer keeps the same YouTubeEmbed instance across fileId changes in collection play, which F2 depends on.
- claude-read: Did not read GenericLinkCard or the rest of LoftPlayer outside the diff.
- claude-verify: I could not confirm with git that linkFailure.ts is new in this diff.
- claude-verify: I did not execute any frontend or backend tests.
- claude-verify: I did not check whether parent pages above LoftPlayer remount it per fileId (for example with a key prop), which would affect how often F2 can occur.

TOTAL: 3 findings
