# Triage: r2

## Warnings

- R-5 ran at e4c732356f2244cce9b34636da12fd7d9cbc1cd0, and these files changed since: backend/app/routers/shelves.py; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: One fix round (f94a4efe) since r1. It adds no branch, state or prediction. It moves the existing `_attach_watched_ranges` call from after the try/except to inside the try, so a failure goes through the existing 'Shelves failed' handler, and it adds one test for that log line. It removes nothing and repeats nothing from an earlier round. There is no sign that the design is being patched.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- backend/app/routers/drives.py — full: Read get_watch_history whole (lines 1736-1808) and the import hunk in the diff.
- backend/app/routers/shelves.py — full: Read lines 410-549: the endpoint tail, _attach_watched_ranges and the whole of _shelves, which encloses the fix hunk.
- backend/app/schemas.py — partial: Changed hunks in the diff only: WatchedRange, the watched_ranges field of WatchHistoryItemResponse, and the whole of ShelfItemResponse with its serializer.
- backend/app/services/watched_ranges.py — full: Read the whole file on disk.
- frontend/e2e-components/fixtures/app.tsx — partial: The import hunk and the ARRANGEMENTS registry hunk, in the diff.
- frontend/e2e-components/fixtures/watchedRanges.tsx — full: New file, read whole in the diff.
- frontend/e2e-components/projects.ts — partial: The one-line DESKTOP_ONLY hunk in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: The two list hunks in the diff.
- frontend/e2e-components/watched-band-desktop.spec.ts — full: New file, read whole in the diff.
- frontend/e2e-components/watched-band.serve.ts — full: New file, read whole in the diff.
- frontend/e2e-components/watched-band.spec.ts — full: New file, read whole in the diff.
- frontend/e2e-components/watched-range-cards.spec.ts — full: New file, read whole in the diff.
- frontend/e2e-layout/fixtures/video-app.html — partial: The three changed hunks in the diff only.
- frontend/e2e-layout/video-app.spec.ts — partial: The changed hunks in the diff only.
- frontend/src/components/CardProgress.tsx — full: New file, read whole in the diff.
- frontend/src/components/ContinueWatchingSection.tsx — partial: The single prop hunk in the diff.
- frontend/src/components/FileCard.tsx — partial: The import, props and progress JSX hunks in the diff.
- frontend/src/components/player/MediaControls/CompactControlsPresenter.tsx — partial: The prop destructuring and SeekBar prop hunks in the diff.
- frontend/src/components/player/MediaControls/MediaControlsContainer.tsx — full: Read lines 60-330 on disk, the whole component body, plus the import hunk.
- frontend/src/components/player/MediaControls/PointerControlsPresenter.tsx — partial: The prop destructuring and SeekBar prop hunks in the diff.
- frontend/src/components/player/MediaControls/TouchControlsPresenter.tsx — full: Read lines 25-260 on disk, the whole component.
- frontend/src/components/player/MediaControls/hooks/useMediaControlsState.ts — full: Read lines 150-359 on disk, the whole hook body, plus the option and interface hunks in the diff.
- frontend/src/components/player/MediaControls/hooks/usePlayerGestures.ts — full: Read lines 90-289 on disk: the hook start, applySkip and handleTap, which enclose every changed hunk; the options interface hunk was read in the diff.
- frontend/src/components/player/MediaControls/parts/SeekBar.tsx — full: Read lines 60-216 on disk, plus the constants and props hunks in the diff.
- frontend/src/components/player/MediaControls/types.ts — full: The changed hunks in MediaControlsPresenterProps and the import, in the diff.
- frontend/src/components/player/hooks/useVideoShortcuts.ts — partial: The four arrow-key handler hunks and the import, in the diff.
- frontend/src/components/videoapp/VideoCard.tsx — partial: The diff hunks, which cover most of the VideoCard body; not opened on disk.
- frontend/src/lib/api.ts — partial: The import line, ShelfItem and getPlayedSegments hunks in the diff.
- frontend/src/lib/playbackProgress.ts — full: Read the whole file on disk.
- frontend/src/lib/watchedRangesStore.ts — full: Read the whole file on disk.
- frontend/src/types/index.ts — full: The changed hunks (new interfaces and the WatchHistoryItem field) in the diff.

Test files:
- backend/tests/test_watched_ranges.py — full: Read whole in the diff, including the new caplog test from the fix commit.
- frontend/src/__tests__/VideoPlayer.test.tsx — partial: The one-line mock hunk only.
- frontend/src/components/__tests__/VideoPlayerShell.test.tsx — partial: The one-line mock hunk only.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: The arrangement list hunk only.
- frontend/src/components/__tests__/watchedBand.shortcuts.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/__tests__/watchedRangesCards.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/__tests__/watchedBand.data.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/__tests__/watchedBand.visibility.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/__tests__/watchedBandHarness.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/hooks/__tests__/usePlayerGestures.test.tsx — partial: The changed hunks only (the callbacks object and the skip-report test).

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: In the touch layout, a scrub started from bottom-only while the player is paused immediately turns the chrome into the whole chrome, because the auto-hide effect re-runs on the `scrubbing` change and clears bottom-only whenever `paused` is true.
Impact: A viewer pauses, double-taps to skip (bottom-only), then drags the seek bar. The centre play button and the top-right buttons appear at the start of the drag instead of staying hidden until 2 s after the scrub ends. The spec's step 5 says a scrub started in bottom-only stays bottom-only. Nothing is lost: the chrome would have turned whole 2 s later anyway, because the player is paused.
Evidence: frontend/src/components/player/MediaControls/hooks/useMediaControlsState.ts:222-234: the effect `if (paused || holdVisible) setBottomOnly(false)` has deps `[paused, scrubbing, holdVisible, autoHideMs, revealNonce]`, so beginScrub (line 279-282, setScrubTime) re-runs it while paused and clears bottomOnly. The separate paused-transition effect at 238-242 already handles pause and resume, so the `paused` half of line 223 matters only when the effect re-runs for an unrelated dep. watchedBand.visibility.test.tsx 'a scrub started in bottom-only stays there...' uses only a playing stub (paused false), so this path is untested.
Repro: not_reproduced (read only). Steps: touchPage({ paused: true }); doubleTap(); expect chrome() 'bottom-only'; pointerDown on the Seek slider (touch). By reading, chrome() then returns 'whole'.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Clear bottomOnly in that effect only for holdVisible, and leave pause and resume to the dedicated paused-transition effect. Add a paused variant of the scrub-in-bottom-only test.

</details>

## Not verified

- claude-read: No tests were run; whether the new caplog test passes (e.g. logger propagation to caplog under TestClient with raise_server_exceptions=False) was not executed.
- claude-read: R1 is derived by reading the effect dependencies; I did not execute a reproduction.
- claude-read: Pre-existing backend shelves tests for keyed requests were not opened.
- claude-read: The repository's .claude/rules and process documents were not read in full.
- claude-read: Several modified frontend files were read only at their changed hunks (see coverage).
- claude-verify: Did not run the tests; the confirmation comes from reading the code statically.
- claude-verify: Did not check whether the keyboard scrub path (SeekBar.tsx:150) behaves the same in the touch layout.
- claude-verify: Did not review other invariants (I1-I4, I6-I10) beyond what R1 touches.

TOTAL: 1 findings
