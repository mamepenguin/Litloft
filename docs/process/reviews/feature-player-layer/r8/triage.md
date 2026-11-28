# Triage: r8

## Trajectory

This run:
- claude-read: No fix round since r7: the one new commit (ee4e6f6e) records r7 and revises the I7 invariant text, with no code change. The r7 trajectory still holds. Round 1 (5fc0b20) removed a branch, the Fragment return. Round 2 (6dc5eae) added four early-return branches to onWheel on top of the earlier 'no scroller' branch, so the hand-made scroll chaining has been patched more than once. This round settles V-1 by narrowing the invariant to what the design can do, not by adding another branch. The wheel-forwarding design is still patched: it was extended once and then its specification was relaxed.

Earlier runs:
- r7 / claude-read: Round 1 (5fc0b20) removes a branch: the Fragment return for a disabled provider is gone, and one element type remains. Round 2 (6dc5eae) adds four early-return branches to onWheel (ctrl, horizontal, full screen, an inner scroller that can still scroll) and a new predicate, innerScrollerTakes. It extends the wheel forwarder from the earlier round, which had already added its own 'no scroller' branch. Each round adds more cases to a hand-made copy of the browser's scroll chaining, so that part of the design is being patched. Round 3 (afab9e2) changes tests and fixtures only. Round 4 (9e2a2b2) and round 5 (a05a9e3) are review records.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — partial: Only the diff hunk in measureFill.
- frontend/e2e-components/document-summary-inspector.spec.ts — partial: Only the diff hunk near line 91.
- frontend/e2e-components/fixtures/app.tsx — partial: Only the diff hunks for PlayerCaptions and TransitionPage.
- frontend/e2e-components/fixtures/frameOutline.tsx — partial: Only the diff hunk for NativeArrangement.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: Only the diff hunks.
- frontend/e2e-components/player-layer-desktop.spec.ts — full: A new file; its whole content is in the diff.
- frontend/e2e-components/player-layer-states-desktop.spec.ts — full: A new file; its whole content is in the diff.
- frontend/e2e-components/player-layer-wheel-desktop.spec.ts — full: A new file; its whole content is in the diff.
- frontend/e2e-components/player-layer-wheel.spec.ts — full: A new file; its whole content is in the diff.
- frontend/e2e-components/player-layer.measure.ts — full: A new file; its whole content is in the diff.
- frontend/e2e-components/player-layer.spec.ts — full: A new file; its whole content is in the diff.
- frontend/e2e-components/player-workbench-desktop.spec.ts — partial: Only the diff hunk in scrollContainer.
- frontend/e2e-components/projects.ts — partial: Only the diff hunk adding the DESKTOP_ONLY entries.
- frontend/e2e-components/pseudo-fullscreen-transition.spec.ts — partial: Every diff hunk (selectors, reachButton, enter).
- frontend/e2e-components/spec-viewport.spec.ts — partial: Only the diff hunks adding list entries.
- frontend/e2e-components/workbench-no-page-scroll-desktop.spec.ts — partial: Only the diff hunk in visibleArea.
- frontend/e2e-components/workbench-split-desktop.spec.ts — partial: Only the diff hunk in splitLayout.
- frontend/e2e-layout/fixtures/mobile-inspector-sheet.html — partial: Only the diff hunks near lines 193-246.
- frontend/e2e-layout/fixtures/pseudo-fullscreen.html — partial: Only the diff hunks near lines 71-180.
- frontend/e2e-layout/pseudo-fullscreen.spec.ts — partial: Only the diff hunks.
- frontend/src/app/globals.css — partial: Only the diff hunks near lines 1407 and 1442.
- frontend/src/components/AppShell.tsx — partial: Only the diff hunks (imports, the nativeShell store, the provider wrap).
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Only the diff hunks.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Only the diff hunks (prop removal).
- frontend/src/components/FileDetail/MediaCanvas.tsx — partial: Only the diff hunks (prop removal).
- frontend/src/components/FileDetail/MediaPlayerBlock.tsx — partial: Only the diff hunks (prop removal).
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Only the diff hunks (prop removal).
- frontend/src/components/FileDetail/find/FindContext.tsx — partial: Only the diff hunk adding FindMarksProvider.
- frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts — partial: Only the diff hunks (the rename to scrollRoot).
- frontend/src/components/FilePreview.tsx — partial: Only the diff hunks.
- frontend/src/components/MiniPlayerContainer.tsx — full: Deleted; the removal hunk is the whole file.
- frontend/src/components/folder/RightPaneFile.tsx — partial: Only the diff hunks.
- frontend/src/components/player/FindOutlineLayer.tsx — partial: Only the import diff hunk.
- frontend/src/components/player/layer/MiniPlayerBoxContext.tsx — full: A new 10-line file, read in the diff.
- frontend/src/components/player/layer/PlayerLayer.tsx — full: The whole file, read from disk.
- frontend/src/components/player/layer/PlayerLayerContext.ts — full: A new file, read in the diff.
- frontend/src/components/player/layer/PlayerSlot.tsx — full: A new file, read in the diff.
- frontend/src/components/player/layer/index.ts — full: A new 3-line file, read in the diff.
- frontend/src/hooks/useMiniPlayer.ts — full: Deleted; the removal hunk is the whole file.
- frontend/src/lib/readingAnchor.ts — partial: Only the diff hunk adding resolveLayerHit and the change to probeAt.

Test files:
- frontend/src/__tests__/row-action-reveal.test.ts — partial: Only the diff hunk.
- frontend/src/__tests__/uploadDrawerPlacement.test.tsx — partial: Only the diff hunks.
- frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx — partial: Only the removed-case hunk.
- frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx — partial: Only the diff hunk.
- frontend/src/components/__tests__/FilePreview.slot.test.tsx — full: A new file, read in the diff.
- frontend/src/components/folder/__tests__/RightPaneFile.test.tsx — partial: Only the removed-case hunk.
- frontend/src/components/player/__tests__/FindOutlineLayer.test.tsx — partial: Only the import hunk.
- frontend/src/components/player/layer/__tests__/PlayerLayer.test.tsx — full: A new file, read in the diff.
- frontend/src/hooks/__tests__/useMiniPlayer.test.ts — full: Deleted; the removal hunk is the whole file.
- frontend/src/lib/__tests__/mediaClock.consumers.test.ts — partial: Only the diff hunks.

## Unspecified behavior, recorded

- claude-read: Wheel scrolling over the player is applied by hand as an instant scrollTop change, so it ignores the browser's smooth wheel scrolling and overscroll-behavior that a wheel beside the player gets.
  - F3 × I2 = 6, claude-read: A wheel over the video moves the canvas in steps rather than with the smooth animation the same wheel gets beside the player.
  - F6 × I2 = 12, claude-verify: A mouse wheel over the player on desktop jumps the canvas instantly where a wheel beside the player scrolls smoothly, so the user sees a small difference in feel and nothing is lost.
- claude-read: A player element that handles the wheel in script without CSS overflow (none known today, a future slider or an addon embed) loses the wheel to the page, because innerScrollerTakes only looks at overflow-y auto or scroll.
  - F1 × I2 = 2, claude-read: It applies only if such an element is added; the user would see the page scroll instead of the control reacting.
  - F0 × I3 = 0, claude-verify: No element known today handles the wheel in script without CSS overflow, so the behavior only appears with a future control or addon and does not reach ordinary use now.
- claude-read: A diagonal trackpad scroll over the player loses its horizontal component.
  - F1 × I1 = 1, claude-read: It is visible only if the slot's scroller also scrolled horizontally, which is not known on the file page.
  - F2 × I2 = 4, claude-verify: A diagonal trackpad scroll over the player drops its sideways part, which shows only when the slot's scroller can also scroll sideways, and that is rare on the file page.

## Findings

A: 0
B: 2
C: 0

### claude-read:T-2 — bucket B, LOW, open

Claim: No real-browser test drives a wheel over a `.loft` provider player, so the I7 forwarding for the iframe case is unchecked. That case is the path through the GestureOverlay in the parent document while the overlay is interactive.
Impact: A regression that left the overlay pointer-events none outside ads and end screens would pass every suite. A wheel over a YouTube `.loft` would then stop scrolling the canvas, which is the defect r7's V-1 described.
Evidence: PlayerLayer.tsx:240-261 forwards only wheels that reach the layer frame in the parent document. GestureOverlay.tsx:45-46 covers the frame `absolute inset-0` with `pointerEvents: interactive ? "auto" : "none"`, so the wheel reaches the frame only while the overlay is interactive. The I7 cases (player-layer-desktop.spec.ts, the 'a wheel that starts on the player' case; player-layer-wheel*.spec.ts) all use openFilePage, which opens video0000001, a native video.
Repro: Mutation: in GestureOverlay.tsx:46, force `pointerEvents: "none"` for `.loft` players. No I7 case fails, because none of them opens a `.loft` file.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add an I7 case on a `.loft` fixture with a stub provider iframe: wheel over the frame while the overlay is interactive, and check that the canvas scrolls by the same amount as a wheel beside the player.

</details>

### claude-read:W-1 — bucket B, INFO, open

Claim: Still open from r7: the wheel forwarder drops the horizontal part of a mostly-vertical wheel. It calls preventDefault and applies only deltaY to the slot's scroller.
Impact: A diagonal trackpad scroll over the player loses its sideways part. No file-page scroller is known to scroll sideways, so nothing visible is expected.
Evidence: PlayerLayer.tsx:247 returns only when |deltaX| > |deltaY|. PlayerLayer.tsx:252-259 then calls preventDefault and does `scroller.scrollTop += event.deltaY * unit`. Nothing applies deltaX.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Also apply deltaX to scroller.scrollLeft.

</details>

## Not verified

- claude-read: I ran no test and no browser; every claim was reasoned from the code.
- claude-read: Whether the YouTube iframe in LoftPlayer is actually rendered under GestureOverlay in every `.loft` mode (Vimeo embed, link card, restricted card). I checked GestureOverlay and its single use in MediaControlsContainer only.
- claude-read: Whether the content of commit ee4e6f6e is limited to docs. I relied on the prompt's statement that there are no fix commits and on the commit subject.
- claude-read: Safari/WebKit wheel delivery over a fixed layer.
- claude-verify: I did not run any test or browser, so the claims are confirmed by reading the code only.
- claude-verify: I did not check whether the wheel event bubbles from GestureOverlay to the layer frame under every wrapper element in LoftPlayer.
- claude-verify: I did not check e2e specs outside frontend/ or the iOS Simulator runs.

TOTAL: 2 findings
