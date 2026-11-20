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
- open finding claude-read:F-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx — full: Opened lines 100-439; the remainder read through every changed hunk in the supplied diff.
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx — full: Opened lines 280-449; every other changed hunk (props, tiles, Ruler, SceneCard, SceneTile, LoadingSkeleton) read in the supplied diff.
- addons/intelligence/frontend/ScenesSection/browseLifetime.ts — full: Deleted file; its whole content read in the diff. Grep confirms no remaining reference.
- addons/intelligence/frontend/ScenesSection/hooks/usePlaybackClock.ts — full: Opened the whole file.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneList.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useScenePictures.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneRows.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useWindowPictures.ts — full: Deleted file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/sceneList.ts — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/scenesModel.ts — full: The only hunk (removal of sceneRows, scaledTileHeight, windowStartFor, MIN_ROWS) read in the diff.
- addons/intelligence/frontend/messages/en.json — full: The single added key read in the diff.
- addons/intelligence/frontend/messages/ja.json — full: The single added key read in the diff.
- frontend/e2e-components/fixtures/app.tsx — full: Changed hunks (imports, scenes routes) read in the diff.
- frontend/e2e-components/fixtures/scenesSection.tsx — full: All changed hunks and the new arrangements read in the diff.
- frontend/e2e-components/fixtures/scenesSectionData.ts — full: The changed hunk read in the diff.
- frontend/e2e-components/projects.ts — full: The changed hunk read in the diff.
- frontend/e2e-components/scenes-scroll-list-desktop.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list-scrollbar-desktop.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list.cases.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-scroll-list.spec.ts — full: New file; whole content read in the diff.
- frontend/e2e-components/scenes-section-desktop.spec.ts — full: Whole new content read in the diff.
- frontend/e2e-components/scenes-section-rows-desktop.spec.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section-rows-scrollbar-desktop.spec.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section-rows.cases.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section-rows.spec.ts — full: Deleted file; content read in the diff.
- frontend/e2e-components/scenes-section.cases.ts — full: Every changed hunk, including the new placement cases, read in the diff.
- frontend/e2e-components/scenes-section.spec.ts — full: Whole new content read in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: The changed hunks read in the diff.

Test files:
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionKeyboard.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionOneList.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionReload.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRequests.test.tsx — partial: Changed hunk only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRows.test.ts — full: Deleted file; content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRulerMap.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionScrollList.test.tsx — full: New file; whole content read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionSeek.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionTimeline.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionVisualIndex.test.tsx — partial: Changed hunk only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionWidth.test.tsx — partial: Changed hunks only, read in the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/scrollListLayout.tsx — full: New file; whole content read in the diff.

## Needs a human

### unspecified_behavior

Note: The Container's reset layout effect depends on `mediaController != null`, and useSceneList's show effect depends on `hasPlayback`. A controller appearing while the section is shown therefore removes the ruler point and sets following again, even after a reader's scroll. The spec lists the controller appearing only as a placement event, not as an event that sets following or removes the ruler point.; A mouse press with the right button (button 2) on the ruler sets the ruler point. Only the middle button is excluded.; usePlaybackClock still computes isJump and calls an onJump the Container now passes as a noop: dead logic.
- claude-read: The Container's reset layout effect depends on `mediaController != null`, and useSceneList's show effect depends on `hasPlayback`. A controller appearing while the section is shown therefore removes the ruler point and sets following again, even after a reader's scroll. The spec lists the controller appearing only as a placement event, not as an event that sets following or removes the ruler point.
- claude-read: A mouse press with the right button (button 2) on the ruler sets the ruler point. Only the middle button is excluded.
- claude-read: usePlaybackClock still computes isJump and calls an onJump the Container now passes as a noop: dead logic.

## Findings

A: 1
B: 2
C: 0

### claude-read:F-1 — bucket A, MEDIUM, open

Claim: In flow form the card box (cardBoxRef) is always rendered while expanded, with padding and an opaque background. viewportOf therefore ends the visible area at the card box's top whenever the box has any height, including when neither the card nor the placeholder is drawn.
Impact: On the phone sheet with no Visual Index (policy off, 404, not eligible, or no labelled scene), an empty opaque strip of about 0.875rem + 0.5rem + the safe-area inset stays pinned at the bottom of the scroller and covers tiles. The visible area, and with it following, wholly-visible checks, the band, the top row and picture requests, ends above the scroller's bottom. The flow-form tests all use a Visual Index with a card, so no test would fail.
Evidence: ScenesSectionPresenter.tsx:371-381 renders the cardBoxRef div whenever view === "expanded", with `sticky ... pt-3.5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] bg-bg-card` in flow form, whatever the children are. sceneList.ts viewportOf: `bottom = card && card.height > 0 ? card.top : scroller bottom`. The padding keeps card.height above 0 when the box is empty. The flow e2e fixture (ScenesFlowArrangement) always serves SCENES_LONG_VISUAL_INDEX with a scene, and scenes-scroll-list.spec.ts uses the default vi.
Repro: not_reproduced. Mentally: open #scenes-flow with policy off or the visual-index stub returning 404. The cardBox renders empty with padding, so getBoundingClientRect().height > 0 and viewportOf.bottom = cardBox.top, which is above the scroller's client bottom.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Render the sticky card box in flow form only when the placeholder or a scene card is drawn, or have viewportOf ignore the box when it has no card or placeholder child.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: usePlaybackClock.ts no longer reads the core shared clock (`@/lib/mediaClock`, `subscribeMediaClock`/`getMediaClockSnapshot`). It now runs its own 250 ms setInterval on the controller. When a controller getter throws, its catch returns IDLE_PLAYBACK, which is time 0 and duration 0, instead of keeping the last good reading as the shared clock does.
Impact: Each shown Scenes section adds a second poller per controller, running at 250 ms even while paused, where the shared clock idles at 1000 ms. If a controller getter throws in a sample, the time reads as 0 for that sample: the playing outline moves to tile 0, and while following the list scrolls to row 0 and then back on the next sample. The old path could not produce time 0 this way, because getMediaClockSnapshot never throws and holds the last good snapshot. No test covers a controller that throws. The touch-point list says only 'hooks; a follow hook added' and does not mention the clock source changing.
Evidence: addons/intelligence/frontend/ScenesSection/hooks/usePlaybackClock.ts:40-50 (readSnapshot calls controller getters directly, and catch returns IDLE_PLAYBACK) and :96-101 (setInterval 250). frontend/src/lib/mediaClock.ts:1-8 says to poll 'exactly once per controller, here, instead of once per consumer'. mediaClock.ts:115-125 holds the last good reading on a throw ('The YouTube player throws while it swaps media'). The revised SPEC-ADDON-089 I2 says the marker and outline 'follow the shared media clock'.
Repro: not_reproduced. I could not confirm that a controller getter throws in normal use: YouTubeEmbed.tsx shows no explicit throw. The only evidence is the comment in mediaClock.ts.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep subscribing to the shared clock, and add a separate check for paused seeks if needed, or hold the last good reading on a throw instead of returning IDLE_PLAYBACK.

</details>

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff adds four end-to-end test files, frontend/e2e-components/scenes-scroll-list.cases.ts, scenes-scroll-list.spec.ts, scenes-scroll-list-desktop.spec.ts and scenes-scroll-list-scrollbar-desktop.spec.ts. None of them matches the declared touch point `scenes-section*.ts` or any other entry in the touch-point list.
Impact: A reviewer or a CI rule scoped to the declared touch points would not expect or check these files. They carry most of the real-browser measurement for SPEC-ADDON-152/153 (I1, I2, I3, I5, I8, I9, I10), so the touch-point list understates where the invariants are tested. The product itself is not affected.
Evidence: In the diff, new files frontend/e2e-components/scenes-scroll-list*.ts are registered in projects.ts:29-30 and spec-viewport.spec.ts (AT_THE_PHONE_WIDTH and AT_THE_DESKTOP_WIDTH). The touch-point list names `frontend/e2e-components/: scenes-section*.ts, projects.ts, spec-viewport.spec.ts, fixtures/...` only.
Repro: Compare the diff's file list with the Touch points section of docs/specs/scenes-scroll-list.md: the scenes-scroll-list* paths match no entry.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/e2e-components/scenes-scroll-list*.ts` to the spec's touch-point list.

</details>

## Not verified

- claude-read: I did not run any test, unit or e2e; the review is reading only.
- claude-read: Whether a MediaController getter (for example YouTube during a media swap) throws in normal use.
- claude-read: The iOS sheet behaviour (sticky card above the home indicator, touch scrolling).
- claude-read: The exact rendered height of the empty flow-form card box in a real browser.
- claude-read: The full text of fixtures/inspectorResponsive.tsx query handling beyond what the e2e cases use.
- claude-verify: I did not run git diff against origin/develop to prove that usePlaybackClock dropped mediaClock in this branch and not earlier; the conclusion rests on product-files.txt and an earlier review's description.
- claude-verify: I did not run any test or e2e spec.
- claude-verify: I did not check the visual effect of the empty sticky box, or whether view === 'expanded' happens with the policy off.

TOTAL: 3 findings
