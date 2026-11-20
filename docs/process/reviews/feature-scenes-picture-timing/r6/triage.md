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
- open finding claude-read:F1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx — partial: Read lines 100-817, which cover every changed hunk and its enclosing function; did not read lines 1-99 or 818 onwards.
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx — partial: Read lines 290-380 and the one-line hunk at ~720 through the diff.
- addons/intelligence/frontend/ScenesSection/hooks/useSceneList.ts — full: Read the whole file.
- addons/intelligence/frontend/ScenesSection/hooks/useScenePictures.ts — full: Read the whole file.
- frontend/e2e-components/scenes-picture-timing.spec.ts — full: New file; read in full through the diff.
- frontend/e2e-components/scenes-section.cases.ts — partial: Read the changed hunks and the recordFrameRequests function through the diff; did not read the rest of the file.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read the one-line hunk in the AT_THE_PHONE_WIDTH list through the diff.

Test files:
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionPictureTiming.test.tsx — full: New file; read in full through the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionRequests.test.tsx — partial: Read the changed hunk only, through the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionScrollList.test.tsx — partial: Read the changed hunks only, through the diff.
- addons/intelligence/frontend/ScenesSection/__tests__/scrollListLayout.tsx — partial: Read the changed hunks only, through the diff.

## Needs a human

### unspecified_behavior

Note: Start placement is now deduplicated by resetKey, including the frame start times. Frames refetched with the same starts no longer place the list again; the spec's Terms treat this as not an arrival, but it also changes SPEC-ADDON-152 §1.3 placement behaviour.; The opening's at-once request waits for the Visual Index answer on native panels with the policy on (F4).
- claude-read: Start placement is now deduplicated by resetKey, including the frame start times. Frames refetched with the same starts no longer place the list again; the spec's Terms treat this as not an arrival, but it also changes SPEC-ADDON-152 §1.3 placement behaviour.
- claude-read: The opening's at-once request waits for the Visual Index answer on native panels with the policy on (F4).
- claude-verify: The start reading of a native video waits for the Visual Index answer (layoutSettled). This wait is not in the spec or the touch points.
- claude-verify: A .loft re-show skips the start placement (no following reset and no placement at the playing row).

### unspecified_behavior

Note: The start reading of a native video waits for the Visual Index answer (layoutSettled). This wait is not in the spec or the touch points.; A .loft re-show skips the start placement (no following reset and no placement at the playing row).
- claude-read: Start placement is now deduplicated by resetKey, including the frame start times. Frames refetched with the same starts no longer place the list again; the spec's Terms treat this as not an arrival, but it also changes SPEC-ADDON-152 §1.3 placement behaviour.
- claude-read: The opening's at-once request waits for the Visual Index answer on native panels with the policy on (F4).
- claude-verify: The start reading of a native video waits for the Visual Index answer (layoutSettled). This wait is not in the spec or the touch points.
- claude-verify: A .loft re-show skips the start placement (no following reset and no placement at the playing row).

## Findings

A: 1
B: 3
C: 0

### claude-read:F1 — bucket A, HIGH, open

Claim: The diff changes the start-placement trigger in useSceneList, which is outside the touch points. The placement now runs once per resetKey (placedKeyRef), no longer on every shown/fileId/rows change, and it is now gated on a new `layoutSettled` input fed from the Container's awaitingVisual. Because placedKeyRef is never cleared on hide, a .loft that is hidden and shown again with the same frames gets no start placement and no new opening.
Impact: Hiding and re-showing the Scenes panel of a YouTube .loft (the host turns `active` off and on, so the frames are kept) leaves opening ended once the reader has scrolled. The re-shown list's near tiles then wait D (200 ms) instead of loading at once. A failed tile is not asked for at once after that start event. The playing row is not placed again on re-show: the list comes back at its top, and if following was off it does not move to the playing row.
Evidence: useSceneList.ts:163-165: resetKey = `${fileId}|${shown?1:0}|${starts}`. useSceneList.ts:348 returns early while !shown, so placedKeyRef keeps the shown key 'f|1|…'. useSceneList.ts:351-354: on re-show the key equals placedKeyRef, so it only calls syncVisible; openingRef/setOpening(true) (355-357) and setFollowing(true)/placeRow (358-368) are skipped. For a .loft, the Container keeps rows on hide (ScenesSectionContainer.tsx:296 returns before any reset; rows are set to null only on collapse and file change for native). So resetKey is identical on re-show. Native panels are not affected, because loadNative (ScenesSectionContainer.tsx:249) sets rows to null and the intermediate key 'f|1|' differs. useScenePictures.ts:98-112 then resets `requested` and calls read() with opening=false, so every near tile starts a dwell. Before this change the placement effect depended on [shown, fileId, rows] and placed again on every show.
Repro: Not run (read-only reviewer). Mental trace of the I8 `.loft` row of ScenesSectionPictureTiming.test.tsx: open, wheelTo(6*ROW) ends opening, rerender active:false then active:true, now() twice with no time advanced. read() runs with opening=false, so t=5 only starts a dwell, and `expect(srcs()).toContain('/scene-tile/f1?t=5')` should fail. If that test passes, something I did not see resets placedKeyRef. Mutation check: clearing placedKeyRef.current when !shown at useSceneList.ts:348 would restore the per-show placement and opening.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Reset placedKeyRef and pendingSettleRef when shown turns false, e.g. in the placement effect's `!shown` branch, so that every showing is a new start event; or keep `shown` transitions out of the dedup key.

</details>

### claude-read:F4 — bucket B, LOW, open

Claim: The diff adds a new input to useSceneList, `layoutSettled` (from the Container's `awaitingVisual`), which holds the start reading until the Visual Index answer arrives. The touch points describe useSceneList's readings only as 'after the start placement, scroll, resize, c or row-step change' and do not mention a wait on the Visual Index.
Impact: With the policy on and a slow Visual Index answer, `ready` stays false during opening for a native panel. No picture is asked for until that answer lands, which delays the 'at once' opening pictures by the server's Visual Index latency.
Evidence: ScenesSectionContainer.tsx:450-458 passes layoutSettled: !awaitingVisual. useSceneList.ts:374-375 defers placedKey while !layoutSettled. useSceneList.ts:399 keeps deferring while !layoutSettled && opening. useScenePictures.ts:63 returns while !ready.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, INFO, open

Claim: The diff adds a new unit-test file, `__tests__/ScenesSectionPictureTiming.test.tsx`, that is not in the touch-point list. The list names only ScrollList, Requests, OneList and LoftVisualIndex as addon tests, and OneList and LoftVisualIndex are not changed by this diff.
Impact: None for a user. The planned list is incomplete: the I1–I9 tests live in an unlisted file, and the listed OneList/LoftVisualIndex `.loft` settle cases were not changed.
Evidence: The diff adds addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionPictureTiming.test.tsx (693 lines). The touch points list `__tests__/ScenesSectionScrollList.test.tsx`, `__tests__/ScenesSectionRequests.test.tsx`, `__tests__/ScenesSectionOneList.test.tsx` and `__tests__/ScenesSectionLoftVisualIndex.test.tsx`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, open

Claim: The diff changes the shared test layout stub `__tests__/scrollListLayout.tsx`, which is not in the touch-point list. ROW becomes a mutable `export let`, and the diff adds `setRowStep`, which resetLayout resets.
Impact: No user impact. Every suite that imports ROW from this helper now shares mutable module state. A suite that calls setRowStep without resetLayout in beforeEach would leak the row step into later tests in the same file.
Evidence: scrollListLayout.tsx: `export let ROW = 88;`, `export function setRowStep(px)`, and `ROW = 88` inside resetLayout.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run the vitest or Playwright suites, so whether the I8 .loft case actually fails is inferred from reading the code, not observed.
- claude-read: I did not read the Presenter beyond lines 290-380 and the diff hunk.
- claude-read: I did not check whether the host (inspector panel) unmounts ScenesSection on hide in production, which would mask F1.
- claude-verify: The base (origin/develop) version of useSceneList's placement effect and its dependency list: I had no git access.
- claude-verify: I did not run any tests. All four findings were checked by reading the code only.
- claude-verify: Whether view === 'expanded' maps exactly to shown for every host mode of a .loft.

TOTAL: 4 findings
