# Triage: r7

## Trajectory

This run:
- claude-read: Round 1 (5fc0b20) removes a branch: the Fragment return for a disabled provider is gone, and one element type remains. Round 2 (6dc5eae) adds four early-return branches to onWheel (ctrl, horizontal, full screen, an inner scroller that can still scroll) and a new predicate, innerScrollerTakes. It extends the wheel forwarder from the earlier round, which had already added its own 'no scroller' branch. Each round adds more cases to a hand-made copy of the browser's scroll chaining, so that part of the design is being patched. Round 3 (afab9e2) changes tests and fixtures only. Round 4 (9e2a2b2) and round 5 (a05a9e3) are review records.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-verify:V-1 is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — partial: Only the diff hunk in measureFill.
- frontend/e2e-components/document-summary-inspector.spec.ts — partial: Only the diff hunk near line 91.
- frontend/e2e-components/fixtures/app.tsx — partial: The diff hunks for PlayerCaptions and TransitionPage, plus the fix commit afab9e2.
- frontend/e2e-components/fixtures/frameOutline.tsx — partial: The diff hunks for NativeArrangement, plus the fix commit.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: The diff hunks only.
- frontend/e2e-components/player-layer-desktop.spec.ts — full: A new file; the whole content is in the diff.
- frontend/e2e-components/player-layer-states-desktop.spec.ts — full: A new file; the whole content is in the diff.
- frontend/e2e-components/player-layer-wheel-desktop.spec.ts — full: A new file; the whole content is in the diff.
- frontend/e2e-components/player-layer-wheel.spec.ts — full: A new file; the whole content is in the diff.
- frontend/e2e-components/player-layer.measure.ts — full: A new file; the whole content is in the diff.
- frontend/e2e-components/player-layer.spec.ts — full: A new file; the whole content is in the diff.
- frontend/e2e-components/player-workbench-desktop.spec.ts — partial: Only the diff hunk in scrollContainer.
- frontend/e2e-components/projects.ts — partial: Only the diff hunk adding DESKTOP_ONLY entries.
- frontend/e2e-components/pseudo-fullscreen-transition.spec.ts — partial: Every diff hunk (selectors, reachButton, enter).
- frontend/e2e-components/spec-viewport.spec.ts — partial: Only the diff hunks adding list entries.
- frontend/e2e-components/workbench-no-page-scroll-desktop.spec.ts — partial: Only the diff hunk in visibleArea.
- frontend/e2e-components/workbench-split-desktop.spec.ts — partial: Only the diff hunk in splitLayout.
- frontend/e2e-layout/fixtures/mobile-inspector-sheet.html — partial: Only the diff hunks near lines 193-246.
- frontend/e2e-layout/fixtures/pseudo-fullscreen.html — partial: Only the diff hunks near lines 71-180.
- frontend/e2e-layout/pseudo-fullscreen.spec.ts — partial: Only the diff hunks.
- frontend/src/app/globals.css — partial: Only the diff hunks near line 1407 and line 1442.
- frontend/src/components/AppShell.tsx — partial: The diff hunks (imports, the nativeShell store, the provider wrap).
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: The diff hunks only.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: The diff hunks only (prop removal).
- frontend/src/components/FileDetail/MediaCanvas.tsx — partial: The diff hunks only (prop removal).
- frontend/src/components/FileDetail/MediaPlayerBlock.tsx — partial: The diff hunks only (prop removal).
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: The diff hunks only (prop removal).
- frontend/src/components/FileDetail/find/FindContext.tsx — partial: The diff hunk adding FindMarksProvider.
- frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts — partial: The diff hunks only (rename to scrollRoot).
- frontend/src/components/FilePreview.tsx — partial: The diff hunks only.
- frontend/src/components/MiniPlayerContainer.tsx — full: Deleted; the removal hunk is the whole file.
- frontend/src/components/folder/RightPaneFile.tsx — partial: The diff hunks only.
- frontend/src/components/player/FindOutlineLayer.tsx — partial: The import diff hunk only.
- frontend/src/components/player/layer/MiniPlayerBoxContext.tsx — full: A new 10-line file read in the diff.
- frontend/src/components/player/layer/PlayerLayer.tsx — full: The whole new file in the diff, the fix diffs, and lines 125-204 from disk.
- frontend/src/components/player/layer/PlayerLayerContext.ts — full: A new file read in the diff.
- frontend/src/components/player/layer/PlayerSlot.tsx — full: A new file read in the diff.
- frontend/src/components/player/layer/index.ts — full: A new 3-line file read in the diff.
- frontend/src/hooks/useMiniPlayer.ts — full: Deleted; the removal hunk is the whole file.
- frontend/src/lib/readingAnchor.ts — partial: The diff hunk adding resolveLayerHit and the change to probeAt.

Test files:
- frontend/src/__tests__/row-action-reveal.test.ts — partial: The diff hunk only.
- frontend/src/__tests__/uploadDrawerPlacement.test.tsx — partial: The diff hunks only.
- frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx — partial: The removed-case hunk only.
- frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx — partial: The diff hunk only.
- frontend/src/components/__tests__/FilePreview.slot.test.tsx — full: A new file read in the diff.
- frontend/src/components/folder/__tests__/RightPaneFile.test.tsx — partial: The removed-case hunk only.
- frontend/src/components/player/__tests__/FindOutlineLayer.test.tsx — partial: The import hunk only.
- frontend/src/components/player/layer/__tests__/PlayerLayer.test.tsx — full: A new file read in the diff and in fix 5fc0b20.
- frontend/src/hooks/__tests__/useMiniPlayer.test.ts — full: Deleted; the removal hunk is the whole file.
- frontend/src/lib/__tests__/mediaClock.consumers.test.ts — partial: The diff hunks only.

## Unspecified behavior, recorded

- claude-read: In pseudo or system full screen a wheel over the player is no longer forwarded; the browser applies it to the layer's own ancestors (the document) instead of the canvas.
  - F1 × I1 = 1, claude-read: If the document itself can scroll on some host page, a wheel during full screen could move it under the player; on the file page nothing visible is expected.
  - F2 × I2 = 4, claude-verify: A wheel over the player in pseudo or system full screen is not forwarded (PlayerLayer.tsx:249); the covered page cannot be seen anyway and the e2e case confirms the page stays put, so the user sees nothing wrong.
- claude-read: The forwarder emulates scroll chaining by hand: an overflowing element inside the player keeps the wheel until its end, and the rest is applied to the slot's nearest scroller, ignoring overscroll-behavior and smooth-scroll settings.
  - F2 × I2 = 4, claude-read: A wheel over the player scrolls the canvas instantly instead of with the browser's smooth wheel scrolling, which may feel different from a wheel beside it.
  - F3 × I2 = 6, claude-verify: Hand-made scroll chaining: wheeling over the player's settings panel scrolls it to its end and then the canvas jumps instantly by the raw delta, ignoring overscroll-behavior and smooth scrolling; it feels slightly different from a native scroll.
- claude-read: A diagonal trackpad scroll over the player loses its horizontal component (W-1).
  - F1 × I1 = 1, claude-read: Only visible if a horizontally scrolling ancestor existed; none is known on the file page.
  - F2 × I2 = 4, claude-verify: A diagonal trackpad swipe over the player moves only vertically, which shows only if the canvas also overflows horizontally, and that is rare on the file page.
- claude-verify: A wheel whose horizontal and vertical parts are equal and non-zero is treated as vertical and preventDefaulted, so the horizontal part is dropped as well.
  - F1 × I1 = 1, claude-verify: An exactly diagonal trackpad input over the player scrolls only vertically, which is barely noticeable.
  - single-scored

## Findings

A: 1
B: 1
C: 0

### claude-verify:V-1 — bucket A, MEDIUM, open

Claim: A wheel that starts over a `.loft` provider iframe (YouTube) is never seen by the layer's wheel forwarder. The iframe sits in the `position: fixed` layer outside the canvas scroller, so the browser chains that scroll to the document instead of the slot's scrolling ancestor.
Impact: On a desktop file page with a YouTube `.loft`, a wheel over the embed probably does not scroll the canvas the way it did before the layer, while the same wheel over a native video does. I7 requires the same scroll for both.
Evidence: frontend/src/components/player/layer/PlayerLayer.tsx:261 registers the wheel listener on the layer frame in the parent document. Wheel events inside a cross-origin iframe are dispatched in the iframe's own document and never bubble to that listener. frontend/src/app/globals.css:1416-1419 makes `[data-player-layer]` `position: fixed`, so the iframe's scroll chain no longer passes through the canvas scroller. The only I7 e2e case (frontend/e2e-components/player-layer-desktop.spec.ts:443-488) opens the default file page and does not exercise a provider iframe.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Verify in a real browser with a YouTube `.loft` and add an I7 e2e case over the iframe. If the canvas does not scroll, forward the scroll some other way, for example with a transparent wheel-catching overlay while the iframe is not being interacted with, or by scrolling the canvas when the document scrolls.

</details>

### claude-read:W-1 — bucket B, INFO, open

Claim: The layer's wheel forwarder drops the horizontal part of a diagonal wheel. When |deltaY| >= |deltaX| it calls preventDefault and applies only deltaY to the slot's scroller.
Impact: A trackpad scroll over the player that is mostly vertical loses its sideways component. Without the layer the browser would apply both axes. No file-page scroller is known to scroll sideways, so nothing visible is expected today.
Evidence: PlayerLayer.tsx onWheel (fix 6dc5eae): it returns only when `Math.abs(event.deltaX) > Math.abs(event.deltaY)`. Otherwise it calls `event.preventDefault(); scroller.scrollTop += event.deltaY * unit`, and nothing applies deltaX.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Also apply deltaX to scrollLeft, or document that only vertical scrolling is forwarded.

</details>

## Not verified

- claude-read: I ran no test and no browser; every claim was reasoned from the code and the diffs.
- claude-read: Whether, in the iOS shell, the file page's player can render before AppShell's post-hydration re-render to enabled=false (I assumed the file fetch makes it later).
- claude-read: Whether the document scrolls on any host page when a wheel is left to the browser in full screen.
- claude-read: Whether OverFrameSettingsPanel or any other player element sets overscroll-behavior; my grep found none, but its glob may have missed the file.
- claude-read: The full bodies of most changed files beyond the diff hunks and PlayerLayer.tsx lines 125-204.
- claude-verify: Did not run any browser to confirm V-1's scroll chaining for a cross-origin iframe inside a fixed layer.
- claude-verify: Did not check whether the default fixture in the I7 desktop test is a native video or a `.loft` embed.
- claude-verify: Did not verify behavior in Safari/WebKit.

TOTAL: 2 findings
