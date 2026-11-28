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
- open finding claude-read:B-1 is bucket A or BLOCKER
- open finding claude-read:B-2 is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — partial: Only the diff hunk in measureFill (about lines 223-233); the file was not opened.
- frontend/e2e-components/document-summary-inspector.spec.ts — partial: Only the diff hunk (about lines 91-100); the file was not opened.
- frontend/e2e-components/fixtures/app.tsx — partial: The diff hunks, plus lines 2440-2490 read from disk, and a grep for player and layer usage.
- frontend/e2e-components/fixtures/frameOutline.tsx — partial: The diff hunks, plus a grep showing VideoPlayer wrapped directly at lines 95-99.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: The diff hunks, plus a grep at lines 17 and 538.
- frontend/e2e-components/player-layer-desktop.spec.ts — full: A new file; its whole content was read in the diff.
- frontend/e2e-components/player-layer-states-desktop.spec.ts — full: A new file; its whole content was read in the diff.
- frontend/e2e-components/player-layer.measure.ts — full: A new file; its whole content was read in the diff.
- frontend/e2e-components/player-layer.spec.ts — full: A new file; its whole content was read in the diff.
- frontend/e2e-components/player-workbench-desktop.spec.ts — partial: Only the diff hunk in scrollContainer (about line 121).
- frontend/e2e-components/projects.ts — partial: Only the diff hunk adding two DESKTOP_ONLY entries.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Only the diff hunks adding three entries.
- frontend/e2e-components/workbench-no-page-scroll-desktop.spec.ts — partial: Only the diff hunk in visibleArea.
- frontend/e2e-components/workbench-split-desktop.spec.ts — partial: Only the diff hunk in splitLayout.
- frontend/e2e-layout/fixtures/mobile-inspector-sheet.html — partial: Only the diff hunks at about lines 193-246.
- frontend/e2e-layout/fixtures/pseudo-fullscreen.html — partial: Only the diff hunks at about lines 71-180.
- frontend/e2e-layout/pseudo-fullscreen.spec.ts — partial: Only the diff hunks at about lines 18-111.
- frontend/src/app/globals.css — partial: Lines 930-990, 1205-1240 and 1400-1565 from disk, and greps for --player-avail and player selectors.
- frontend/src/components/AppShell.tsx — partial: Lines 120-150 and 360-443 from disk, plus the import and constant hunks in the diff.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Lines 40-150 from disk, a grep for ridesShell, and the hunk at about line 358 in the diff.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Lines 30-130 from disk, which cover every changed hunk.
- frontend/src/components/FileDetail/MediaCanvas.tsx — full: The whole file from disk.
- frontend/src/components/FileDetail/MediaPlayerBlock.tsx — full: The whole file from disk.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Lines 700-740 from disk, plus the prop and interface hunks in the diff.
- frontend/src/components/FileDetail/find/FindContext.tsx — partial: Lines 1-90 from disk, which include the new FindMarksProvider.
- frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts — full: The whole file from disk.
- frontend/src/components/FilePreview.tsx — partial: Lines 80-160 from disk, plus the import hunks in the diff.
- frontend/src/components/MiniPlayerContainer.tsx — full: Deleted; the removal hunk is the whole file, and a Glob confirms it is gone.
- frontend/src/components/folder/RightPaneFile.tsx — full: The whole file from disk.
- frontend/src/components/player/FindOutlineLayer.tsx — partial: Lines 1-30 from disk; only the import changed.
- frontend/src/components/player/layer/MiniPlayerBoxContext.tsx — full: A new file of 10 lines, read in the diff.
- frontend/src/components/player/layer/PlayerLayer.tsx — full: The whole file from disk.
- frontend/src/components/player/layer/PlayerLayerContext.ts — full: The whole file from disk.
- frontend/src/components/player/layer/PlayerSlot.tsx — full: The whole file from disk.
- frontend/src/components/player/layer/index.ts — full: A new file of 3 lines, read in the diff.
- frontend/src/hooks/useMiniPlayer.ts — full: Deleted; the removal hunk is the whole file, and a Glob confirms it is gone.
- frontend/src/lib/readingAnchor.ts — full: The whole file from disk.

Test files:
- frontend/src/__tests__/row-action-reveal.test.ts — partial: Only the diff hunk changing the count to 14.
- frontend/src/__tests__/uploadDrawerPlacement.test.tsx — partial: The diff hunks, plus a grep showing that the MINI_PLAYER_* imports are still used at lines 49 and 55.
- frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx — partial: Only the removed-case diff hunk.
- frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx — partial: Only the diff hunk at about line 1373.
- frontend/src/components/__tests__/FilePreview.slot.test.tsx — full: A new file; its whole content was read in the diff.
- frontend/src/components/folder/__tests__/RightPaneFile.test.tsx — partial: Only the removed-case diff hunk.
- frontend/src/components/player/__tests__/FindOutlineLayer.test.tsx — partial: Only the import diff hunk.
- frontend/src/components/player/layer/__tests__/PlayerLayer.test.tsx — full: A new file; its whole content was read in the diff.
- frontend/src/hooks/__tests__/useMiniPlayer.test.ts — full: Deleted; the removal hunk is the whole file, and a Glob confirms it is gone.
- frontend/src/lib/__tests__/mediaClock.consumers.test.ts — partial: Only the diff hunks removing the useMiniPlayer cases.

## Needs a human

### unspecified_behavior

Note: In the iOS shell, AppShell's whole content remounts once after hydration, because PlayerLayerProvider's returned element type flips from Provider to Fragment.
- claude-read: In the iOS shell, AppShell's whole content remounts once after hydration, because PlayerLayerProvider's returned element type flips from Provider to Fragment.
  - F5 × I3 = 15, claude-read: Every app launch in the iOS shell triggers it; the user may see a re-render flash, and a video page opened at launch creates, destroys and recreates its player.
  - F5 × I3 = 15, claude-verify: Each time the iOS shell loads or reloads a page, AppShell's content remounts once after hydration. A video page opened at that moment loses its first player instance and its fetches, and the user sees a flash or a restart.

## Unspecified behavior, recorded

- claude-read: A wheel over any part of the layer, including the player's scrollable settings panel, scrolls the page's canvas; ctrl+wheel and horizontal deltas are swallowed.
  - F2 × I3 = 6, claude-read: Wheeling over an overflowing settings panel on a short frame moves the page instead of the panel; a pinch-zoom or swipe-back started on the player does not work.
  - F3 × I3 = 9, claude-verify: On a desktop with a long settings panel open, a wheel over the panel scrolls the page behind it instead of the panel. A trackpad pinch over the player also scrolls the page instead of zooming, and horizontal swipes do nothing.
- claude-read: While the player is in pseudo full screen on a desktop browser that refuses element full screen, a wheel over it scrolls the hidden canvas under it, so the page has moved on exit.
  - F0 × I2 = 0, claude-read: Only when requestFullscreen is refused on a device with a wheel; on exit the page is at a different scroll position.
  - F1 × I3 = 3, claude-verify: Pseudo full screen is the fallback when element full screen is refused, which on a wheel-equipped desktop is rare. There a wheel scrolls the hidden canvas, so the page is at a different scroll position when the user exits.
- claude-read: Every render of the slot publishes to the store, which re-renders the layer and the player element tree with the page's latest props.
  - F10 × I1 = 10, claude-read: Every page re-render re-renders the player subtree; nothing visible, only extra render work.
  - F8 × I1 = 8, claude-verify: Each render of the file page's slot publishes to the store and re-renders the layer's player tree with the latest props. That is the intended way props reach the player and the user sees nothing.
- claude-verify: In system (element) full screen, the full-screen element is inside the layer's frame, so a wheel over it reaches the frame's onWheel. The handler does not check isFullscreenNow and scrolls the canvas hidden behind the full-screen player.
  - F3 × I3 = 9, claude-verify: A desktop user who scrolls the wheel while watching full screen comes back to the page at a different scroll position on exit.
  - single-scored

## Findings

A: 2
B: 6
C: 0

### claude-read:B-1 — bucket A, MEDIUM, open

Claim: In the iOS shell, `PlayerLayerProvider` hydrates with `enabled` true (server snapshot) and then re-renders with `enabled` false. It switches its returned element from `PlayerLayerContext.Provider` to a Fragment, which remounts every child of AppShell's content, the routed page included. A video page open at that moment gets a player mounted in the layer and then torn down.
Impact: On every load of the app in the iOS shell, the whole shell content (sidebar, header, routed page) mounts twice, and its fetches and effects run twice. When the app opens on a video or `.loft` file page, the player is first created in the layer outside the slot (with the `GET /progress` and the native-shell player messages that go with it), then destroyed with its teardown sends, then created again in place.
Evidence: AppShell.tsx:43-45 and :136-140: `useSyncExternalStore(subscribeToShell, inNativeShell, notNativeShell)`, where the server snapshot is always false and `subscribe` is a no-op. AppShell.tsx:381: `<PlayerLayerProvider enabled={!nativeShell}>`. PlayerLayer.tsx:270-280: `if (!store) return <>{children}</>;` versus `<PlayerLayerContext.Provider value={store}>{children}<PlayerLayerFrame/></PlayerLayerContext.Provider>`. A different element type at the same position remounts the subtree. app/layout.tsx:84 renders AppShell in the server-rendered root layout. nativeBridge.ts:165-167: isNativeShell reads `window.webkit.messageHandlers` and `__litloftShell`, which exist on the client in the shell.
Repro: not_reproduced. This was reasoned from React's reconciliation rules: hydration uses getServerSnapshot, then React re-renders when getSnapshot differs, and the Provider-to-Fragment type change remounts the children.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the element type stable across the flip: always render the Provider, with a null store when disabled, and render PlayerLayerFrame only when enabled. Or decide `enabled` before the first client render.

</details>

### claude-read:B-2 — bucket A, MEDIUM, open

Claim: The layer's wheel handler calls preventDefault on every wheel event over the frame and applies only deltaY to the slot's scroller. A wheel over the player's own scrollable settings panel then scrolls the page instead of the panel. Ctrl+wheel (trackpad pinch-zoom) and horizontal wheel or swipe deltas are swallowed.
Impact: With a short frame, for example with a workbench panel shown, the settings panel overflows. Its lower rows (speed, subtitles) cannot be reached with the wheel: the wheel moves the canvas under the player instead. A trackpad pinch or a two-finger horizontal swipe that starts on the player scrolls the canvas vertically, or does nothing, instead of zooming or going back.
Evidence: PlayerLayer.tsx:217-230: `onWheel` returns early only when there is no scroller; otherwise it always calls `event.preventDefault()` and sets `scroller.scrollTop += event.deltaY * unit`. It checks neither `event.ctrlKey` nor `deltaX`, nor whether an element inside the frame can scroll. OverFrameSettingsPanel.tsx:91-92: the panel is `max-h-[calc(100%-5rem)]` with `overflow-y-auto` and sits inside the frame, so inside the layer.
Repro: not_reproduced. Steps: open a video file page at 1280x800 with a workbench panel shown, open the player's Settings, and scroll the wheel over the panel. The canvas scrolls and the panel does not. The I7 test (player-layer-desktop.spec.ts, the "a wheel that starts on the player" case) only wheels over the bare video, so it does not catch this.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Before calling preventDefault, skip events with ctrlKey, and skip those whose target has a scrollable ancestor inside the frame that can still scroll in the wheel's direction. Apply deltaX to the scroller as well, or let horizontal deltas pass through.

</details>

### claude-read:T-1 — bucket B, LOW, open

Claim: The fixtures that wrap a bare `<VideoPlayer>` in `PlayerLayerProvider` (PlayerCaptions and TransitionPage in app.tsx, NativeArrangement in frameOutline.tsx) never run the layer. Only `PlayerSlot` registers with the store, so the player still renders in place.
Impact: The captions, pseudo-full-screen transition and find-outline suites pass without exercising the layer. In particular, I6's frame outlines through the forwarded FindMarks context, and the pseudo-full-screen move from inside the layer, have no real-browser check. A regression in FindMarksProvider forwarding would pass.
Evidence: e2e-components/fixtures/app.tsx:2424-2437 and :2452-2472, :2481; fixtures/frameOutline.tsx:95-99: the provider wraps VideoPlayer directly. PlayerSlot.tsx:42-55 is the only caller of `store.register`, and PlayerLayer.tsx:247 renders nothing while no slot is served.
Repro: Mutation: remove `<FindMarksProvider value={served.findMarks}>` from PlayerLayer.tsx:251. The frame-outline suite still passes, because its VideoPlayer never enters the layer.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Wrap the player in these fixtures in `<PlayerSlot>`, or render it through FilePreview, so the suites run through the layer.

</details>

### claude-read:TP-1 — bucket B, LOW, open

Claim: frontend/e2e-layout/pseudo-fullscreen.spec.ts is reached by the diff but is not in the touch-point list; the list names only its fixtures, and the diff changes an assertion in it.
Impact: The check that guarded the iOS WebKit pinned-frame rule changes meaning: before, it asserted that the pinned frame carries its own z-index 60 (the old comment says a stacking context above the frame is what iOS refuses to paint the frame out of). Now it asserts that the layer, an ancestor stacking context, carries z-index 60. A reader of the touch-point list would not expect a suite assertion to change.
Evidence: frontend/e2e-layout/pseudo-fullscreen.spec.ts:80-85: `expect(m.frameZ).toBe("60")` is replaced by `expect(m.layerZ).toBe("60")`. The diff also adds `layerZ` 15 checks at about :95 and :111. The touch-point list names only `frontend/e2e-layout/fixtures/pseudo-fullscreen.html`, `mobile-inspector-sheet.html` and `build-fixture-css.ts`.
Repro: Compare the diff's file list with the touch-point list. The spec file is absent from the list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the spec to the touch-point list, or record in the review that the assertion was re-keyed from the frame's tier to the layer's tier.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: frontend/e2e-components/spec-viewport.spec.ts is reached by the diff but is not in the touch-point list.
Impact: None for a user. The new specs are registered in the width-guard list, which is a planning gap only.
Evidence: frontend/e2e-components/spec-viewport.spec.ts:59 adds "player-layer.spec.ts" to AT_THE_PHONE_WIDTH, and :170-171 add the two desktop specs to AT_THE_DESKTOP_WIDTH. The touch-point list names only `projects.ts` `DESKTOP_ONLY`.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, INFO, open

Claim: Three real-browser specs are re-keyed from the `video` element to `[data-player-slot]`, and none of them is in the touch-point list: player-workbench-desktop.spec.ts, workbench-no-page-scroll-desktop.spec.ts and workbench-split-desktop.spec.ts.
Impact: These suites now find their scroller from the slot's ancestors instead of the video's. The list only covers specs that use the `.media-detail-player > :first-child` selector, so these edits were not planned.
Evidence: player-workbench-desktop.spec.ts:121 changes `node.querySelector("video")` to `node.querySelector("[data-player-slot]")`. workbench-no-page-scroll-desktop.spec.ts:57-60 changes `page.locator("video")` to `page.locator("[data-player-slot]")`. workbench-split-desktop.spec.ts:137-138 changes `document.querySelector("video")` to the slot.
Repro: Compare the diff's file list with the touch-point list, which says "a check that reads the player's box through `.media-detail-player > :first-child` ... and any other spec using that selector". These specs used `video`, not that selector.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-4 — bucket B, INFO, open

Claim: frontend/src/__tests__/row-action-reveal.test.ts is reached by the diff but is not in the touch-point list.
Impact: The expected reveal count drops from 15 to 14 because MiniPlayerContainer's `group-hover/mini` reveal is deleted. The edit is correct but was not planned.
Evidence: row-action-reveal.test.ts:141 changes `expect(reveals.length).toBe(15)` to `toBe(14)`. The touch-point list's unit-test section does not name this file.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-5 — bucket B, INFO, open

Claim: The new unit test frontend/src/components/__tests__/FilePreview.slot.test.tsx is not in the touch-point list.
Impact: None for a user. The list's unit-test section names only removed, re-imported and kept tests, so the I9 test is an unplanned addition.
Evidence: frontend/src/components/__tests__/FilePreview.slot.test.tsx is a new file in the diff (I9 cases). The list names `FilePreview.test.tsx` as kept as it is, and does not name this file.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or browser; every behavior claim was reasoned from the code.
- claude-read: Whether React's hydration of useSyncExternalStore with a mismatching server snapshot runs the first commit's passive effects before the forced re-render (B-1).
- claude-read: Whether iOS WebKit paints the pinned YouTube iframe over the chrome from inside the layer's z-60 stacking context.
- claude-read: Whether the OverFrameSettingsPanel actually overflows at common frame heights (B-2's frequency).
- claude-read: Addon embeds (player-side, file-preview-actions) for page-context reads or DOM-ancestor assumptions that the layer would break.
- claude-read: Every DialogPortal target and its DOM order relative to the layer, for desktop pseudo full screen at equal z-50.
- claude-read: The full bodies of ShellLayout.tsx, AppShell.tsx and the e2e fixtures beyond the ranges listed in coverage.
- claude-verify: No command, test or browser was run; every finding was checked by reading the code only.
- claude-verify: I did not view the actual diff hunks. Which files changed is taken from r6/product-files.txt and r6/test-files.txt, and the changed lines are checked against their current content only.
- claude-verify: Whether, without the layer, a wheel in element full screen chains to the inner canvas scroller in Chrome or Safari.
- claude-verify: The exact order of the post-hydration re-render relative to the slot's registration in the iOS shell.

TOTAL: 8 findings
