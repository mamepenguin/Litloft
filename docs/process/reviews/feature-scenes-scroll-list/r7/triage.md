# Triage: r7

## Trajectory

This run:
- claude-read: The fix round after r6 (277b53fb4, with the submodule moved to 432e4758) mostly removed things. It deleted the section's private 250 ms poller, the isJump/onJump jump detection and the noop callback, and went back to the shared media clock. It also dropped `mediaController != null` from the Container's reset effect and narrowed the button checks to the primary button. It added two things: a hasPlaybackRef, so the show effect reads the controller without re-running on it, and a `cardDrawn` branch that hides the flow card box. e57b7174c changed only a test wait, from a guessed 400 ms to MEDIA_CLOCK_IDLE_MS + 300, matching the accepted clock timing. 0f20db72f is documentation only. The ref and the cardDrawn branch are new state and a new condition placed to dodge an effect's dependencies and an empty box, where the r6 round had added the private poller to dodge the clock. So the pattern of patching around effects continues in a smaller form. On balance this round removed more state than it added, and the remaining defect (R7-1) comes from the reader-scroll listener, not from these patches.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R7-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx — full: Opened lines 100-799 in the worktree; the earlier lines (imports, DragStart type) read in the diff.
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx — full: Every changed hunk read in the supplied diff, including the cardDrawn fix hunk.
- addons/intelligence/frontend/ScenesSection/browseLifetime.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/usePlaybackClock.ts — full: Whole resulting file reconstructed from both the full diff and the fix diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneList.ts — full: Opened the whole file in the worktree.
- addons/intelligence/frontend/ScenesSection/hooks/useScenePictures.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneRows.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useWindowPictures.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/sceneList.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/scenesModel.ts — full: The only hunk (removals) read in the diff.
- addons/intelligence/frontend/messages/en.json — full: The single added key read in the diff.
- addons/intelligence/frontend/messages/ja.json — full: The single added key read in the diff.
- frontend/e2e-components/fixtures/app.tsx — full: All changed hunks read in the diff.
- frontend/e2e-components/fixtures/scenesSection.tsx — full: All changed hunks and the new arrangements read in the diff.
- frontend/e2e-components/fixtures/scenesSectionData.ts — full: The changed hunk read in the diff.
- frontend/e2e-components/projects.ts — full: The changed hunk read in the diff.
- frontend/e2e-components/scenes-scroll-list-desktop.spec.ts — full: New file; whole content read in the diff; MEDIA_CLOCK_IDLE_MS export checked in mediaClock.ts:28.
- frontend/e2e-components/scenes-scroll-list-flow.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list-scrollbar-desktop.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list.cases.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-section-desktop.spec.ts — full: Whole new content read in the diff.
- frontend/e2e-components/scenes-section-rows-desktop.spec.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section-rows-scrollbar-desktop.spec.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section-rows.cases.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section-rows.spec.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section.cases.ts — full: Every changed hunk read in the diff.
- frontend/e2e-components/scenes-section.spec.ts — full: Whole new content read in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: The changed hunks read in the diff.

Test files:
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionClock.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionController.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionKeyboard.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionOneList.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionReload.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRequests.test.tsx — partial: Changed hunk only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRows.test.ts — full: Deleted file; content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRulerButtons.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRulerMap.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionScrollList.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionSeek.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionTimeline.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionVisualIndex.test.tsx — partial: Changed hunk only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionWidth.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/scrollListLayout.tsx — full: New file; whole content read in the diff.

## Needs a human

### unspecified_behavior

Note: A mouse drag that starts outside the ruler with the primary button held and then enters the ruler sets the ruler point on pointermove (`buttons & 1`), with no pointerdown on the ruler. I13 says only that a press with another button does nothing.; On every new showing, failedTimes and the requested pictures are reset for a .loft as well as a native file, so a failed .loft scene-tile is asked for again on the next showing. §1.14 states the retry-on-next-showing rule only for a native frame.; A mouse click on a partly visible tile first fires focusin, which clears following and the ruler point, and then click sets following again. The intermediate state is not visible but runs an extra flushSync render.
- claude-read: A mouse drag that starts outside the ruler with the primary button held and then enters the ruler sets the ruler point on pointermove (`buttons & 1`), with no pointerdown on the ruler. I13 says only that a press with another button does nothing.
- claude-read: On every new showing, failedTimes and the requested pictures are reset for a .loft as well as a native file, so a failed .loft scene-tile is asked for again on the next showing. §1.14 states the retry-on-next-showing rule only for a native frame.
- claude-read: A mouse click on a partly visible tile first fires focusin, which clears following and the ruler point, and then click sets following again. The intermediate state is not visible but runs an extra flushSync render.

## Findings

A: 1
B: 1
C: 0

### claude-read:R7-1 — bucket A, MEDIUM, open

Claim: In flow form a horizontal touch drag on the ruler ends with no ruler point. Each touchmove of the drag bubbles from the sticky ruler to the shared scroller's `touchmove` listener, whose takeOver calls onReaderTakeOver and so setBrowsePoint(null). The listener does not tell a ruler drag from a reader's scroll.
Impact: On the phone sheet, the main touch host, a horizontal drag along the ruler places the dragged row, then the ruler point vanishes once the drag ends. The white ruler line and tile outline are gone. The card and aria-valuenow show the top row's first frame, which is the row before the dragged one, not the dragged frame. Enter on the ruler then does nothing. Spec §1.6 counts only a vertical swipe starting on the pinned ruler as a reader's scroll, and §1.12 says the drag's touchmove does not clear the ruler point.
Evidence: useSceneList.ts:396-401 takeOver calls setFollowing(false) and onReaderTakeOver() without checking the event target. useSceneList.ts:434 registers `scroller.addEventListener("touchmove", takeOver)` on scrollerOf(list), which in flow form is the [data-inspector-scroller] ancestor that also holds the sticky ruler box (ScenesSectionPresenter.tsx rulerBoxRef). ScenesSectionContainer.tsx:424-427 onReaderTakeOver calls setBrowsePoint(null). ScenesSectionContainer.tsx:511-541: pointermove applies the point, and pointerup returns early when `start.dragged`, so it never re-applies the point after the last touchmove. Browsers dispatch a touch's pointermove before its compatibility touchmove, so the touchmove clears the point last. The jsdom test 'in flow form a touch the browser takes for vertical scrolling…' (ScenesSectionRulerMap.test.tsx) confirms that ruler touchmoves reach this listener in flow form.
Repro: not_reproduced. Traced by reading: in #scenes-flow, touchStart on the ruler at 10%, touchMove to 20/40/60/80% at constant y, then touchEnd. Every move runs pointermove (applyRulerPoint), then touchmove (takeOver, so browse is null). At touchEnd, pointerup sees dragged=true and returns, leaving browse null. The e2e case 'SPEC-ADDON-153 I9 — a touch drag on the ruler places its row…' (scenes-scroll-list.spec.ts) would still pass: it asserts only visibleRows[0] grew and rulerNow differs from the opening value, and with browse cleared and following off, rulerNow is the top row's first frame, which also differs. It then cancels, and the cancel restores the start state. The jsdom pointercancel case runs in bounded form, where the ruler is outside the scroller.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In the touchmove handler, ignore a touch whose ruler drag is active or has passed the 8 px threshold, for example with a ref the Container sets in handlePointerDown/handlePointerMove for touch on the ruler. Or skip takeOver for touchmoves whose target is inside the ruler until a pointercancel shows the browser took the vertical pan. Add a flow-form test that ends a horizontal drag with pointerup and asserts aria-valuenow equals the dragged frame.

</details>

### claude-read:R7-2 — bucket B, LOW, open

Claim: In bounded form, the H that chooses between the full and one-line card is not independent of which card is drawn. The placeholder box includes the action row's 2.25rem with no flex gap, while a real card is followed by an action row separated by the section's 0.875rem gap. So the list's client height, and with it H, differs by about the gap between the placeholder state and the card state.
Impact: For a host height in a band about 14 px wide, the placeholder can be drawn in one form and the arriving card in the other: a visible change of form when the Visual Index answers. The e2e case checks only that the placeholder is stable while pending, not that the card keeps the placeholder's form.
Evidence: ScenesSectionPresenter.tsx placeholder: height calc(7.75rem + 2.25rem) or calc(2.75rem + 2.25rem), inside cardBoxRef, with the action row absent while awaiting. With a card, cardBoxRef holds only the card, and the action row is a separate flex child after a gap-3.5. useSceneList.ts:160-168 computes H as list.clientHeight + cardBox height − 7.6rem.
Repro: not_reproduced. Choose a bounded host height where list.clientHeight + placeholderHeight − 7.6rem is just at least 2·step. After the card arrives, the extra 0.875rem gap before the action row comes out of the list, so H falls below 2·step and the card turns one-line.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Size the placeholder so its total matches card + gap + action row, or compute H against a fixed reservation that does not depend on the drawn part.

</details>

## Not verified

- claude-read: I did not run any jsdom or Playwright test; every result here comes from reading the code.
- claude-read: The pointer/touch event order (pointermove before touchmove) on iOS Safari and Chromium for a touch-action: pan-y element. R7-1 relies on it.
- claude-read: The exact pixel band in which R7-2's form change happens in a real layout.
- claude-read: Whether the submodule commit 432e4758 contains changes beyond the hunks shown in the supplied diff.
- claude-verify: Real-browser dispatch order of pointermove versus touchmove; I reasoned from the Pointer Events compatibility mapping and did not observe it.
- claude-verify: The exact rendered height of the action row (filled button padding may exceed min-h-9) and so the exact size of the R7-2 window.
- claude-verify: e2e-components specs and fixtures were not read.

TOTAL: 2 findings
