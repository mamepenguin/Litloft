# Triage: r8

## Trajectory

This run:
- claude-read: Round 1 (2d23b44, submodule 605aaadd) added a rulerDrag ref passed into useSceneList, an onTouchMove branch that gates on it, a new scroller pointercancel listener, a primary-button branch in handlePointerDown, a pointerType check on mouse pointermove, and an actionRowRef with a predicted action-row-plus-gap term in H. Round 2 (0ef326bd, submodule 2faa21f0) added a window pointerup listener that ends a mouse drag, which is one more place that manages dragStart's lifetime. Round 3 (38f9de2f, submodule ebfa52b4) removed actionRowRef and the predicted actionPart, and replaced them with one measurement of every part below the list (partsBelowList). So the I5 side moved from a prediction to a measurement, and that round removed state. The ruler-drag side is still being patched. r6's fix round added the primary-button condition, and this cycle added a touchmove gate, a pointercancel listener and a window pointerup listener, all around the same dragStart ref. Each round adds another branch about who owns a gesture, and R8-1 is another lifetime gap of that ref.

Earlier runs:
- r7 / claude-read: The fix round after r6 (277b53fb4, with the submodule moved to 432e4758) mostly removed things. It deleted the section's private 250 ms poller, the isJump/onJump jump detection and the noop callback, and went back to the shared media clock. It also dropped `mediaController != null` from the Container's reset effect and narrowed the button checks to the primary button. It added two things: a hasPlaybackRef, so the show effect reads the controller without re-running on it, and a `cardDrawn` branch that hides the flow card box. e57b7174c changed only a test wait, from a guessed 400 ms to MEDIA_CLOCK_IDLE_MS + 300, matching the accepted clock timing. 0f20db72f is documentation only. The ref and the cardDrawn branch are new state and a new condition placed to dodge an effect's dependencies and an empty box, where the r6 round had added the private poller to dodge the clock. So the pattern of patching around effects continues in a smaller form. On balance this round removed more state than it added, and the remaining defect (R7-1) comes from the reader-scroll listener, not from these patches.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R8-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx — full: Opened lines 480-569 in the worktree; every other changed hunk read in the supplied full diff and fix diffs.
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx — full: Every changed hunk read in the supplied diff and fix diffs.
- addons/intelligence/frontend/ScenesSection/browseLifetime.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/usePlaybackClock.ts — full: Whole resulting file read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneList.ts — full: New file; whole content read in the diff; line numbers of the listeners confirmed with Grep.
- addons/intelligence/frontend/ScenesSection/hooks/useScenePictures.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneRows.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useWindowPictures.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/sceneList.ts — full: New file; whole content, including partsBelowList, read in the diff.
- addons/intelligence/frontend/ScenesSection/scenesModel.ts — full: The only hunk (removals) read in the diff.
- addons/intelligence/frontend/messages/en.json — full: The single added key read in the diff.
- addons/intelligence/frontend/messages/ja.json — full: The single added key read in the diff.
- frontend/e2e-components/fixtures/app.tsx — full: All changed hunks read in the diff.
- frontend/e2e-components/fixtures/scenesSection.tsx — full: All changed hunks, including the held and stale arrangement, read in the diff.
- frontend/e2e-components/fixtures/scenesSectionData.ts — full: The changed hunk read in the diff.
- frontend/e2e-components/projects.ts — full: The changed hunk read in the diff.
- frontend/e2e-components/scenes-scroll-list-card-form-desktop.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list-desktop.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list-flow.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list-ruler-touch.spec.ts — full: New file; whole content read in the diff.
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
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRequests.test.tsx — partial: Changed hunks only (including the new .loft retry case), read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRows.test.ts — full: Deleted file; content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRulerButtons.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRulerMap.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionScrollList.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionSeek.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionTimeline.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionVisualIndex.test.tsx — partial: Changed hunk only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionWidth.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/scrollListLayout.tsx — full: New file; whole content read in the diff.

## Findings

A: 1
B: 0
C: 0

### claude-read:R8-1 — bucket A, LOW, open

Claim: In flow form, a pointercancel after a touch drag on the ruler has passed 8 px restores the scroll position, following and ruler point, but it also sets dragStart to null. Any later touchmove of the same gesture then reaches the shared scroller's onTouchMove with no drag recorded, and takeOver clears following and the ruler point that were just restored.
Impact: If the browser or the OS cancels a horizontal ruler drag and still delivers touchmoves for that gesture (for example when the sheet's own gesture or a system gesture takes the touch over), the restored state is lost. The chip appears, and the card and aria-valuenow jump to the top row's frame instead of the point the drag started from. Spec §1.12 says the touchmove of that gesture does not clear them.
Evidence: ScenesSectionContainer.tsx:559-568: handlePointerCancel sets dragStart.current = null before it restores. useSceneList.ts:412-420: onTouchMove skips takeOver only while rulerDrag.current is a non-mouse drag, so once it is null every touchmove calls takeOver (useSceneList.ts:405), which calls onReaderTakeOver, which calls setBrowsePoint(null). Nothing remembers that the current touch gesture belonged to a cancelled ruler drag. Both the jsdom cancel case (ScenesSectionRulerMap.test.tsx, bounded form) and the e2e cancel case (scenes-scroll-list.spec.ts) stop dispatching touchmoves after touchCancel, so neither would see this.
Repro: not_reproduced. Traced by reading: in #scenes-flow, touchStart on the ruler at 10%, then touchMove to 40% (dragged=true, point set). pointercancel restores the starting state and nulls dragStart. One more touchMove bubbling to [data-inspector-scroller] calls onTouchMove, which calls takeOver, so following is cleared and the browse point is set to null. Whether real browsers send touchmoves after a pointercancel on a touch-action: pan-y element that started a horizontal pan was not observed.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep a marker for the cancelled gesture until touchend or touchcancel, for example a ref set in handlePointerCancel and cleared on the next touchstart, and have onTouchMove skip takeOver while the marker is set.

</details>

## Not verified

- claude-read: I did not run any jsdom or Playwright test; every result here comes from reading the code.
- claude-read: Whether Chromium or iOS Safari deliver touchmoves after a pointercancel on a touch-action: pan-y ruler whose gesture started horizontally (R8-1 depends on it).
- claude-read: That the React root sits outside [data-inspector-scroller] in the real phone sheet, which the native-before-delegated order relies on; I checked only the fixtures' structure.
- claude-read: The exact pixel band where the I5 threshold falls in the 372-460 px sweep.
- claude-verify: I ran no browser or jsdom test. The confirmation rests on reading the code and on how browsers dispatch touchmove after pointercancel, which I did not observe.
- claude-verify: I did not read the existing test files to confirm they dispatch no touchmove after touchCancel.
- claude-verify: Whether real browsers (iOS Safari, Android Chrome) fire pointercancel after an 8 px horizontal drag on the ruler at all depends on the ruler's touch-action, which I did not determine.

TOTAL: 1 findings
