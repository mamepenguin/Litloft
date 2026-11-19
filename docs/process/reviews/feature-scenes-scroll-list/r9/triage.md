# Triage: r9

## Trajectory

This run:
- claude-read: The only change in this round is in the submodule (ebfa52b4..b5a835ca). It fixes R8-1 by adding a `cancelled` flag to the DragStart state, a guard on that flag in handlePointerMove, and two more window listeners (touchend, touchcancel) that end the flag. This repeats the pattern of the earlier rounds. The r7 fix round added the touchmove gate on rulerDrag and the scroller pointercancel listener. The second r7 round added a window pointerup listener for mouse drags. This round adds another state and two more lifetime listeners around the same dragStart ref. Every round has added a branch or a state about who owns a ruler gesture, and none has removed one, so the gesture-ownership design is being patched. The I5 side, by contrast, was simplified in the previous cycle, when partsBelowList replaced the predicted action-row term, and this round does not touch it.

Earlier runs:
- r7 / claude-read: The fix round after r6 (277b53fb4, with the submodule moved to 432e4758) mostly removed things. It deleted the section's private 250 ms poller, the isJump/onJump jump detection and the noop callback, and went back to the shared media clock. It also dropped `mediaController != null` from the Container's reset effect and narrowed the button checks to the primary button. It added two things: a hasPlaybackRef, so the show effect reads the controller without re-running on it, and a `cardDrawn` branch that hides the flow card box. e57b7174c changed only a test wait, from a guessed 400 ms to MEDIA_CLOCK_IDLE_MS + 300, matching the accepted clock timing. 0f20db72f is documentation only. The ref and the cardDrawn branch are new state and a new condition placed to dodge an effect's dependencies and an empty box, where the r6 round had added the private poller to dodge the clock. So the pattern of patching around effects continues in a smaller form. On balance this round removed more state than it added, and the remaining defect (R7-1) comes from the reader-scroll listener, not from these patches.
- r8 / claude-read: Round 1 (2d23b44, submodule 605aaadd) added a rulerDrag ref passed into useSceneList, an onTouchMove branch that gates on it, a new scroller pointercancel listener, a primary-button branch in handlePointerDown, a pointerType check on mouse pointermove, and an actionRowRef with a predicted action-row-plus-gap term in H. Round 2 (0ef326bd, submodule 2faa21f0) added a window pointerup listener that ends a mouse drag, which is one more place that manages dragStart's lifetime. Round 3 (38f9de2f, submodule ebfa52b4) removed actionRowRef and the predicted actionPart, and replaced them with one measurement of every part below the list (partsBelowList). So the I5 side moved from a prediction to a measurement, and that round removed state. The ruler-drag side is still being patched. r6's fix round added the primary-button condition, and this cycle added a touchmove gate, a pointercancel listener and a window pointerup listener, all around the same dragStart ref. Each round adds another branch about who owns a gesture, and R8-1 is another lifetime gap of that ref.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx — full: Opened lines 80-599 in the worktree; the remaining lines (key handler, view and Presenter props) read in the supplied diff.
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx — full: Every changed hunk read in the supplied diff; unchanged in this round.
- addons/intelligence/frontend/ScenesSection/browseLifetime.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/usePlaybackClock.ts — full: Whole resulting file read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneList.ts — full: New file; whole content read in the diff; the listener lines confirmed with Grep in the worktree.
- addons/intelligence/frontend/ScenesSection/hooks/useScenePictures.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneRows.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useWindowPictures.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/sceneList.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/scenesModel.ts — full: The only hunk (removals) read in the diff.
- addons/intelligence/frontend/messages/en.json — full: The single added key read in the diff.
- addons/intelligence/frontend/messages/ja.json — full: The single added key read in the diff.
- frontend/e2e-components/fixtures/app.tsx — full: All changed hunks read in the diff.
- frontend/e2e-components/fixtures/scenesSection.tsx — full: All changed hunks read in the diff.
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
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRequests.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRows.test.ts — full: Deleted file; content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRulerButtons.test.tsx — full: New file; whole content, including this round's cancelled-gesture case, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRulerMap.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionScrollList.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionSeek.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionTimeline.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionVisualIndex.test.tsx — partial: Changed hunk only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionWidth.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/scrollListLayout.tsx — full: New file; whole content read in the diff.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I did not run any jsdom or Playwright test; every result comes from reading the code.
- claude-read: Whether real browsers (iOS Safari, Android Chrome) deliver touchmoves after a pointercancel on the touch-pan-y ruler once a horizontal drag has started, and whether touchend then always reaches window.
- claude-read: Whether any host (the vaul sheet) stops propagation of touchend or touchcancel before window. The marker's clearing depends on it.
- claude-read: I did not re-read useSceneList.ts beyond the listener lines found with Grep. Its contents are taken from the supplied diff.
- claude-verify: Tests were not run (no command execution available).
- claude-verify: The e2e-components specs, the docs and the INDEX.md changes were not read.
- claude-verify: The I1/I5 bounded-form geometry (H computation, one-line card form) and the I6 picture request timing were not checked.
- claude-verify: Real browser behaviour of touch pointercancel followed by native scrolling was not checked.

TOTAL: 0 findings
