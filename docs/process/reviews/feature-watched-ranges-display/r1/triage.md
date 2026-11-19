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
- backend/app/routers/drives.py — full: Read the whole of get_watch_history (lines 1736-1808) and the import hunk.
- backend/app/routers/shelves.py — full: Read lines 180-549: _item, _keyed_shelf, _unkeyed_shelves, the endpoints, _attach_watched_ranges and _shelves.
- backend/app/schemas.py — full: Read all changed hunks with their enclosing classes in the diff.
- backend/app/services/watched_ranges.py — full: New file, read whole in the diff.
- frontend/e2e-components/fixtures/app.tsx — full: Both changed hunks (import and registry entry) read in the diff.
- frontend/e2e-components/fixtures/watchedRanges.tsx — full: New file, read whole in the diff.
- frontend/e2e-components/projects.ts — full: One-line hunk in the DESKTOP_ONLY array read in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: Both list hunks read in the diff.
- frontend/e2e-components/watched-band-desktop.spec.ts — full: New file, read whole in the diff.
- frontend/e2e-components/watched-band.serve.ts — full: New file, read whole in the diff.
- frontend/e2e-components/watched-band.spec.ts — full: New file, read whole in the diff.
- frontend/e2e-components/watched-range-cards.spec.ts — full: New file, read whole in the diff.
- frontend/e2e-layout/fixtures/video-app.html — partial: Only the three changed hunks (SPEC entries, card build loop, measurement fields) read in the diff.
- frontend/e2e-layout/video-app.spec.ts — partial: Only the changed hunks (Measurement interface, constants, assertions) read in the diff.
- frontend/src/components/CardProgress.tsx — full: New file, read whole in the diff.
- frontend/src/components/ContinueWatchingSection.tsx — full: Single-line prop hunk read in the diff with its FileCard call site.
- frontend/src/components/FileCard.tsx — partial: Changed hunks only (imports, props, progress JSX near lines 157-167); the rest of FileCardImpl not read.
- frontend/src/components/player/MediaControls/CompactControlsPresenter.tsx — partial: Changed hunks only (prop destructuring and SeekBar props).
- frontend/src/components/player/MediaControls/MediaControlsContainer.tsx — full: Read lines 60-330, the whole component body.
- frontend/src/components/player/MediaControls/PointerControlsPresenter.tsx — partial: Changed hunks only (prop destructuring and SeekBar props).
- frontend/src/components/player/MediaControls/TouchControlsPresenter.tsx — full: Read lines 25-260, the whole component.
- frontend/src/components/player/MediaControls/hooks/useMediaControlsState.ts — full: Read lines 155-359, the whole hook body, plus the diff's option and interface hunks.
- frontend/src/components/player/MediaControls/hooks/usePlayerGestures.ts — partial: Changed hunks only: options interface, callbacksRef, applySkip, and the tap branch in the pointer-up handler.
- frontend/src/components/player/MediaControls/parts/SeekBar.tsx — full: Read lines 60-216 and the constants and props hunks in the diff.
- frontend/src/components/player/MediaControls/types.ts — full: Changed hunks within MediaControlsPresenterProps read in the diff.
- frontend/src/components/player/hooks/useVideoShortcuts.ts — full: The changed hunk covers the four arrow-key handler entries; consumers grepped.
- frontend/src/components/videoapp/VideoCard.tsx — full: The diff covers the whole of VideoCard's changed body.
- frontend/src/lib/api.ts — partial: Changed hunks only (import line, ShelfItem type, getPlayedSegments).
- frontend/src/lib/playbackProgress.ts — full: Read the whole file.
- frontend/src/lib/watchedRangesStore.ts — full: New file, read whole in the diff.
- frontend/src/types/index.ts — full: Changed hunks (new interfaces, WatchHistoryItem field) read in the diff.

Test files:
- backend/tests/test_watched_ranges.py — full: New file, read whole in the diff.
- frontend/src/__tests__/VideoPlayer.test.tsx — partial: Only the one-line mock hunk.
- frontend/src/components/__tests__/VideoPlayerShell.test.tsx — partial: Only the one-line mock hunk.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Only the arrangement-list hunk.
- frontend/src/components/__tests__/watchedBand.shortcuts.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/__tests__/watchedRangesCards.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/__tests__/watchedBand.data.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/__tests__/watchedBand.visibility.test.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/__tests__/watchedBandHarness.tsx — full: New file, read whole in the diff.
- frontend/src/components/player/MediaControls/hooks/__tests__/usePlayerGestures.test.tsx — partial: Only the changed hunks (callbacks object and the skip-report test).

## Needs a human

### unspecified_behavior

Note: TouchControlsPresenter.tsx:109 replaces `focus-within:opacity-100` with `has-[:focus-visible]:opacity-100`. This changes when faded touch chrome becomes visible on focus (programmatic or mouse focus no longer reveals it). The spec does not mention this change.; watched_ranges on a shelves item is attached after the try/except, so a failure of that query is not logged by the 'Shelves failed' handler (shelves.py:544-547).
- claude-read: TouchControlsPresenter.tsx:109 replaces `focus-within:opacity-100` with `has-[:focus-visible]:opacity-100`. This changes when faded touch chrome becomes visible on focus (programmatic or mouse focus no longer reveals it). The spec does not mention this change.
- claude-read: watched_ranges on a shelves item is attached after the try/except, so a failure of that query is not logged by the 'Shelves failed' handler (shelves.py:544-547).
- claude-verify: _attach_watched_ranges runs outside the try/except in _shelves (shelves.py:547), so a failure while building watched_ranges skips the 'Shelves failed' log line. The request still fails with an error.

### unspecified_behavior

Note: _attach_watched_ranges runs outside the try/except in _shelves (shelves.py:547), so a failure while building watched_ranges skips the 'Shelves failed' log line. The request still fails with an error.
- claude-read: TouchControlsPresenter.tsx:109 replaces `focus-within:opacity-100` with `has-[:focus-visible]:opacity-100`. This changes when faded touch chrome becomes visible on focus (programmatic or mouse focus no longer reveals it). The spec does not mention this change.
- claude-read: watched_ranges on a shelves item is attached after the try/except, so a failure of that query is not logged by the 'Shelves failed' handler (shelves.py:544-547).
- claude-verify: _attach_watched_ranges runs outside the try/except in _shelves (shelves.py:547), so a failure while building watched_ranges skips the 'Shelves failed' log line. The request still fails with an error.

## Findings

A: 0
B: 2
C: 0

### claude-read:R2 — bucket B, LOW, open

Claim: The shelves change rewrites the request-level dispatch in `_shelves`: it merges the `by == "all"` branch with the keyed branch and turns the early returns into a single `response`. The touch-point list names only `_item` and the item builders, and those are left unchanged.
Impact: Every shelves request (GET /shelves and POST /shelves/query, all `by` values) now goes through restructured control flow. As I read it, the behaviour is the same: the merged call passes `key="all" if params.key is None else params.key`, which matches both old branches, and keyed responses still omit `base`. Even so, I9 (same files, order and counts) depends on a refactor the plan did not announce. Because `_attach_watched_ranges` runs outside the try block, a failure of the ranges query is not logged by the existing 'Shelves failed' handler.
Evidence: backend/app/routers/shelves.py:513-548: the merged `if params.by == "all" or params.key is not None` branch, the single `response` variable, and `_attach_watched_ranges(db, viewer_id, response.shelves)` called after the try/except at line 547. New helper `_attach_watched_ranges` at lines 420-434. `_item` (186-192), `_keyed_shelf` and `_unkeyed_shelves` are unchanged.
Repro: not_reproduced: read only. Mutation reasoning: dropping `or params.key is not None` would send keyed requests for by != all into `_unkeyed_shelves`. The new backend tests use only unkeyed `by=watch` and `by=folder`, so it is not clear that they would catch this. Pre-existing shelves tests, which I did not read, probably cover keyed shelves.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List `_shelves` (the dispatch and the single attach point) in the touch points. Consider calling `_attach_watched_ranges` inside the try so its failures get the same log line.

</details>

### claude-read:R1 — bucket B, INFO, open

Claim: The diff adds a new shared product component, frontend/src/components/CardProgress.tsx, which the touch-point list does not name (it names only FileCard.tsx, VideoCard.tsx and ContinueWatchingSection.tsx for the bar and tick).
Impact: Both card kinds now render their progress bar through one new module, so a later change to either card's bar goes through a file no reviewer was told to expect. The module also imports RESUME_THRESHOLD from frontend/src/lib/playbackProgress.ts. That puts the player's progress module, with its imports of ProfileProvider, playedRanges, watchedRangesStore and api, into the dependency graph of every FileCard grid. A user cannot see this.
Evidence: frontend/src/components/CardProgress.tsx:1-64 (new file); frontend/src/components/FileCard.tsx:7,160 and frontend/src/components/videoapp/VideoCard.tsx:6,39 import it; CardProgress.tsx:2 imports RESUME_THRESHOLD from @/lib/playbackProgress, which playbackProgress.ts:24 now exports (it was module-private before).
Repro: not_reproduced: this is a touch-point comparison, not a runtime defect. Compare the 'Touch points' section of docs/specs/watched-ranges-display.md with the file list in the diff.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add CardProgress.tsx, and the export of RESUME_THRESHOLD from playbackProgress.ts, to the touch-point list. Optionally move RESUME_THRESHOLD to a small constants module so the cards do not import the player hook module.

</details>

## Not verified

- claude-read: Whether pre-existing backend shelves tests cover keyed requests (key with page, by=all with key) after the dispatch refactor; I did not open them.
- claude-read: Full bodies of FileCard.tsx, PointerControlsPresenter.tsx, CompactControlsPresenter.tsx, usePlayerGestures.ts and api.ts beyond the changed hunks.
- claude-read: No test or build was run; all conclusions come from reading the code.
- claude-read: The repository's .claude/rules documents were not read in full.
- claude-verify: I used the main checkout at /Users/libre/Sources/video_share as the base. I could not confirm that it matches origin/develop, because I cannot run git.
- claude-verify: watched_ranges_by_file in backend/app/services was not read.
- claude-verify: Did not run any tests.

TOTAL: 2 findings
