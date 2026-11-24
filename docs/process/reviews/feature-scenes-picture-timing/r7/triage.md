# Triage: r7

## Trajectory

This run:
- claude-read: The record has one fix round with a product change, 75bc701c6 (fadcb8892 and 61a949f2a only record docs). That round adds a branch to the placement effect's `!shown` path. The branch resets the placedKeyRef, pendingSettleRef and placedKey state, the dedup state that this change itself introduced, and the round adds the Reshow test file. It removes nothing. There is no earlier fix diff in the record, so I cannot say whether the same kind of branch is being added round after round. On its own, this round is a patch on top of the dedup-by-resetKey design rather than a simplification of it.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx — partial: Read lines 150-830, which include every changed hunk and its enclosing function. Lines 1-149 were not read, apart from grep hits at 110-127 (hostDriven, shown).
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx — partial: Read lines 160-199, 330-374 and 680-749 (the changed img hunk with its SceneTile function).
- addons/intelligence/frontend/ScenesSection/hooks/useSceneList.ts — full: Read the whole file.
- addons/intelligence/frontend/ScenesSection/hooks/useScenePictures.ts — full: Read the whole file.
- frontend/e2e-components/scenes-picture-timing.spec.ts — full: New file; read in full through the diff.
- frontend/e2e-components/scenes-section.cases.ts — partial: Read lines 330-514, which cover recordFrameRequests and both changed test hunks.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read lines 55-94, the AT_THE_PHONE_WIDTH list that contains the changed line, plus grep hits at 123-126.

Test files:
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionPictureTiming.test.tsx — full: New file; read in full through the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRequests.test.tsx — partial: Read lines 600-641, which contain the changed hunk.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionReshow.test.tsx — full: New file; read in full through the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionScrollList.test.tsx — partial: Read lines 425-589, the changed picture cases and the I7 re-show case.
- addons/intelligence/frontend/ScenesSection/__tests__/scrollListLayout.tsx — full: Read the whole file.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: No test catches the removal of the `setPlacedKey(null)` line that the fix added at useSceneList.ts:351, so a re-show that asks for the previous showing's near tiles at once would pass the suite.
Impact: If that line regresses, a panel hidden while still in opening and shown again with a different start placement asks for the pre-placement near tiles at once. A typical case is a .loft whose playback moved while it was hidden. Those requests are for rows the reader is not shown, which I1's last clause forbids. Today's code does not do this. The gap is only in the tests.
Evidence: useSceneList.ts:610 computes `ready = shown && placedKey === resetKey`. With the reset at :351 removed, the state placedKey keeps 'f|1|S' through a hide. resetKey is 'f|0|S' while hidden and 'f|1|S' again on re-show for a .loft, because the Container keeps the rows on hide (ScenesSectionContainer.tsx:296, :317). So `ready` is already true in the first re-show render. useScenePictures.ts:105-112 then runs read() in that commit's passive effect. It sees the render-1 `times`, which come from the pre-hide `visible`, and `opening`, which is still true if the reader never scrolled. React flushes those passive effects before the sync re-render that the placement's layout-effect setState schedules. Every re-show test ends opening before hiding: ScenesSectionReshow.test.tsx:156 and :192 (wheelTo), ScenesSectionPictureTiming.test.tsx dwellOnRowFive and the I8 wheel, and ScenesSectionScrollList.test.tsx:490 and :556 (wheel or ruler press). With opening already false, the stale read only starts dwells, and render 2 clears them. The mutant therefore survives.
Repro: not_reproduced (read-only). Mutation: delete `setPlacedKey(null);` at useSceneList.ts:351. Expected to survive the current suite. A test that would kill it: open a .loft with a controller at currentTime 100 (rows 5–7 placed), hide without scrolling, set currentTime 0, show again, and assert that rows 4–8 got no src.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a re-show case that hides while still in opening, with the new start placement in a different place from the old one, and asserts that no tile near only before the new placement gets a src.

</details>

## Not verified

- claude-read: I did not run vitest or Playwright. The surviving mutant in F1 and the React flush ordering are inferred from reading the code.
- claude-read: Real-browser scroll events after a row-step change or a scrollTop clamp, and whether they end opening in practice.
- claude-read: I did not read Container lines 1-149, most of the Presenter, or the rest of ScenesSectionRequests/ScrollList outside the listed ranges.
- claude-read: I did not read .claude/rules/process.md in full or the bucket definitions beyond the task text.
- claude-verify: I did not run the test suite or the mutant. The survival claim rests on reading the code and on React 18/19 flushing commit-1 passive effects before the sync re-render that its layout-effect setState schedules.
- claude-verify: I did not read ScenesSectionOneList.test.tsx or ScenesSectionLoftVisualIndex.test.tsx in full. A grep found no `active: false` re-show in them, but a re-show done another way could be missed.
- claude-verify: I did not check the e2e cases in frontend/e2e-components/scenes-section.cases.ts.

TOTAL: 1 findings
