# Triage: r7

## Trajectory

This run:
- claude-read: One fix round (31294ed45) came after r6. It adds a new branch: an effect keyed on [videoId] that clears failedVideoIdRef. That branch patches the failedVideoIdRef guard, a state with an early return that an earlier round had added so a failed load would not retry on a youtubeUi toggle. The guard then needed a reset rule for the case r6 F2 found. So the retry policy of YouTubeEmbed is being patched with extra state rather than designed: a ref plus an ordering-dependent reset effect beside loadFailed, when a single 'failed for id X' state could carry both. The round removes no branch or state. It closes the A→B→A empty box, and I found no new invariant break.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/routers/rag.py — partial: Changed image_applies hunk in the diff only; unchanged in this fix round.
- addons/media_import/backend/router.py — partial: Changed hunks (create_loft except branches, _loft_url_from_file, refresh_loft) in the diff only; unchanged in this fix round.
- addons/media_import/backend/service.py — partial: Changed hunks (LoftTitleFetchError, _title_fetch_failure_code, create_loft_sync title wrap) in the diff only.
- addons/media_import/frontend/CaptionStatusBadge.ja.test.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/CaptionStatusBadge.test.tsx — partial: Changed hunks in the diff only.
- addons/media_import/frontend/Composer.test.tsx — partial: Changed hunk in the diff only.
- addons/media_import/frontend/Composer.tsx — partial: Changed hunks (imports, ti hook, createLoft try/catch) in the diff only.
- addons/media_import/frontend/ImportErrors.ja.test.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/ImportErrors.test.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/ImportFromUrl.test.tsx — partial: Changed hunks in the diff only.
- addons/media_import/frontend/ImportFromUrlDialog.tsx — partial: Changed hunks in the diff only.
- addons/media_import/frontend/api.ts — partial: Changed hunks (CreateLoftError, createLoft) in the diff only.
- addons/media_import/frontend/lib/linkFailure.ts — full: New file, read in full from the diff.
- addons/media_import/frontend/messages/en.json — partial: Changed hunks in the diff only.
- addons/media_import/frontend/messages/ja.json — partial: Changed hunks in the diff only.
- addons/media_import/frontend/players/VimeoEmbed.tsx — partial: Changed hunks in the diff, which include the whole component body.
- addons/media_import/frontend/players/YouTubeEmbed.tsx — full: Read lines 100-499 from disk (the component, the new clearing effect, the load effect and the render branches) and the import hunk in the diff; this covers every changed hunk with its enclosing function.
- addons/media_import/frontend/players/loadYouTubeIframeApi.ts — full: Read the whole file from disk.
- frontend/src/components/loft/LoftPlayer.tsx — partial: Changed hunks in the diff (state type, isLoftContent, the effect and the render branches).
- frontend/src/messages-core/en.json — partial: Changed hunk in the diff only.
- frontend/src/messages-core/ja.json — partial: Changed hunk in the diff only.

Test files:
- addons/intelligence/tests/test_spec_addon_114_text_video_frames.py — partial: Changed hunk in the diff only.
- addons/media_import/backend/tests/test_spec_addon_188_189_link_errors.py — full: New file, read in full from the diff.
- addons/media_import/frontend/__tests__/importErrorCases.tsx — full: New file, read in full from the diff.
- addons/media_import/frontend/players/__tests__/EmbedLinkCard.test.tsx — full: New file, read in full from the diff, including the test added in this fix round.
- addons/media_import/frontend/players/__tests__/loadYouTubeIframeApi.test.ts — full: New file, read in full from the diff.
- frontend/src/components/loft/__tests__/LoftPlayer.pictureOverlay.test.tsx — partial: Changed hunk in the diff only.
- frontend/src/components/loft/__tests__/LoftPlayer.readFailure.ja.test.tsx — full: New file, read in full from the diff.
- frontend/src/components/loft/__tests__/LoftPlayer.readFailure.test.tsx — full: New file, read in full from the diff.
- frontend/src/components/loft/__tests__/LoftPlayer.test.tsx — partial: Changed hunk in the diff only.

## Unspecified behavior, recorded

- claude-read: Two different .loft files that point to the same YouTube video id share the no-retry guard when one embed instance moves between them. After the first file's API load failed, the second file shows the link card without a new load attempt.
  - F0 × I2 = 0, claude-read: It needs two .loft files for the same video played one after the other in the same embed instance, right after a transient script failure. The user sees the link card, not a blank box.
  - F1 × I2 = 2, claude-verify: The reported behavior exists in the code. YouTubeEmbed.tsx:127-130 keys failedVideoIdRef on videoId only, and the effect at :266-267 returns early when the video id matches. So if the IFrame API load failed (rare: offline or a script blocker) and the user then goes straight to a second .loft of the same video without a remount, that file shows the link card from the earlier failure (loadFailed stays true) and no new load is tried, even though loadYouTubeIframeApi.ts:69-74 resets the cache so a retry could work; the user still gets a working link and a reload fixes it.
- claude-verify: When LoftPlayer's fileId changes, the old file's content stays rendered until the new .loft fetch resolves. In that window the embed gets the new fileId together with the old URL, so a player for the previous video can briefly be bound to the new file's progress tracking.
  - F1 × I2 = 2, claude-verify: Moving between two .loft files in place keeps the previous video on screen for the short fetch window on a LAN; the 5-second progress threshold makes a wrong progress write unlikely.
  - single-scored

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: Ran no tests; the fix was judged by reading YouTubeEmbed.tsx and the new test.
- claude-read: Did not confirm React 18's ordering of passive-effect state updates against the microtask from an already-resolved loadYouTubeIframeApi in a real browser (see regression_risks).
- claude-read: Did not re-read the files outside this fix round beyond the diff, because they did not change since r6.
- claude-read: Did not check whether pages above LoftPlayer key it by fileId, which affects how often embed instances are reused.
- claude-verify: Backend router/service changes behind I1-I4b (create_loft, refresh_loft, error classification) were not read.
- claude-verify: Composer.tsx, ImportFromUrlDialog.tsx and api.ts error mapping (I2, I2b) were not read.
- claude-verify: The intelligence file_question _has_frame_source change (I8) and the caption badge messages (I5) were not read.
- claude-verify: VimeoEmbed.tsx was not read.
- claude-verify: Whether FilePreview remounts LoftPlayer on navigation in real routing was not checked.

TOTAL: 0 findings
