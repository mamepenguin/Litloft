# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 4
C: 0

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff edits frontend/e2e-components/fixtures/inspectorResponsive.tsx, which the touch-point list does not name; the real-host arrangements (Workbench panels, InspectorShell tab, MobileInspectorSheet) were built there behind a `scenes=1` query, not in fixtures/scenesSection.tsx or the `scenes-…` entries of fixtures/app.tsx as listed.
Impact: No user-facing impact. A reader of the touch points looking for the arrangements in scenesSection.tsx/app.tsx will not find them. That fixture also gains global patches, applied only when `scenes=1`: an `HTMLImageElement.prototype.src` setter override, an `Element.prototype.setAttribute` override, extra fetch routes and an intelligence message merge.
Evidence: frontend/e2e-components/fixtures/inspectorResponsive.tsx:25-26 (imports intelligence messages and scenesSectionData), :76-80 (SCENES query flags), :125-134 (adds a `scenes` player-side entry), :180-183 and :230-260 (scenesResponse), :262-303 (installScenePictures prototype patches), :414-440 (message merge). The listed fixtures/app.tsx and fixtures/scenesSection.tsx are not modified by this commit.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add fixtures/inspectorResponsive.tsx to the touch-point list, or drop the listed fixtures/app.tsx `scenes-…` entries and the scenesSection.tsx real-host arrangements from it.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff edits the shared e2e stub frontend/e2e-components/stubs/addons.ts, which the touch-point list does not name, so that every fixture's `intelligence` slot module now resolves `scenes` to the real addon ScenesSection.
Impact: No user-facing impact. Every fixture bundle now imports the real Scenes section, and any fixture whose addon status lists a `scenes` entry would mount the real section. Today only inspectorResponsive.tsx under `scenes=1` does that.
Evidence: frontend/e2e-components/stubs/addons.ts:3 imports `../../src/addons/intelligence/ScenesSection`; :19-23 adds `scenes: ScenesSection` to slotComponents. A grep for a `scenes` addon entry in e2e-components finds only fixtures/inspectorResponsive.tsx:128. Fixtures already import addon code (fixtures/scenesSection.tsx:8, fixtures/app.tsx:93), so this does not newly break the no-core-to-addon rule for production code.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List frontend/e2e-components/stubs/addons.ts in the touch points.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff edits the spec registration lists frontend/e2e-components/projects.ts and frontend/e2e-components/spec-viewport.spec.ts, which the touch-point list does not name.
Impact: None for users. These edits are mechanical: spec-viewport.spec.ts fails when a spec file is matched by neither project, so the new specs must be registered there.
Evidence: frontend/e2e-components/projects.ts:26-27 add the two `scenes-section-rows*-desktop.spec.ts` files to DESKTOP_ONLY. frontend/e2e-components/spec-viewport.spec.ts:68 adds `scenes-section-rows.spec.ts` to AT_THE_PHONE_WIDTH, and :95-96 add the two desktop specs to AT_THE_DESKTOP_WIDTH. spec-viewport.spec.ts:37-40 states why the lists must name every spec.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add projects.ts and spec-viewport.spec.ts to the touch points as the registration that any new e2e spec needs.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The new helper module is frontend/e2e-components/scenes-section-rows.cases.ts. The touch-point list names only `scenes-section*.spec.ts` and `scenes-section.cases.ts`, so this file falls outside it.
Impact: None for users. A reader following the list would look in the existing scenes-section.cases.ts for the row measurements (readRows, settledRows, the frame recorder), but they are in a different file.
Evidence: frontend/e2e-components/scenes-section-rows.cases.ts (new, 445 lines). The existing frontend/e2e-components/scenes-section.cases.ts is not modified by this commit.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Widen the touch point to `scenes-section*.cases.ts`.

</details>

## Not verified

- claude-read: I did not run any test, e2e spec or build, so I did not check whether the new specs pass.
- claude-read: I did not check whether the vite alias for stubs/addons.ts applies to every fixture bundle.
- claude-read: I did not check the correctness of the useSceneRows measurement against I1–I7; this review answered only the touch-point question.
- claude-read: I did not read docs/process/reviews/feature-scene-rows-fill-height/design-check.md or decisions.md for an amended touch-point list.
- claude-verify: I could not run git diff. I used r6/classification.json as the record of which files changed and did not check it against git independently.
- claude-verify: I did not run the e2e specs or check whether they pass.
- claude-verify: I did not review the addon submodule changes or the invariant coverage.

TOTAL: 4 findings
