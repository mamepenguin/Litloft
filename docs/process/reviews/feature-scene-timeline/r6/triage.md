# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-verify:V-1

## Needs a human

### open_c (claude-verify:V-1)

Question: ScenesSectionPresenter.tsx is not a props-only Presenter. Its `Ruler` sub-component holds state and runs effects, which `.claude/rules/frontend-conventions.md:54` forbids: "Presenter: ... No `useState`, no `useEffect`, no API calls." That rule is one of the rules passed through.
Impact: This breaks the declared Container/Presenter convention. It does not change behaviour: the ruler-width measurement and the native keydown listener (added to keep keys from reaching ShortcutsProvider, per I4) live in the Presenter rather than in the Container or in hooks/.
Evidence: addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx:3 imports useEffect, useLayoutEffect, useRef and useState. Inside the Presenter file, Ruler has `useState(0)` for rulerWidth at :402, a `useLayoutEffect` with a ResizeObserver at :417-426, and a `useEffect` that calls `el.addEventListener("keydown", ...)` at :428-437.
Note: ScenesSectionPresenter.tsx is not a props-only Presenter. Its `Ruler` sub-component holds state and runs effects, which `.claude/rules/frontend-conventions.md:54` forbids: "Presenter: ... No `useState`, no `useEffect`, no API calls." That rule is one of the rules passed through.

## Findings

A: 0
B: 3
C: 1

### claude-read:TP-1 — bucket B, LOW, open

Claim: The new addon module `frontend/ScenesSection/scenesModel.ts` is not on the touch-point list, and the Container/Presenter layout that the list points to does not provide for it.
Impact: None at runtime. The ruler length L, frameIndexAt, the window start s, the time-label rule (I11) and rulerFraction are all in this unlisted file, so the logic behind I1 and I11 sits outside the declared surface. A reviewer who scopes the change by the touch points could skip it.
Evidence: addons/intelligence/frontend/ScenesSection/scenesModel.ts (new, 134 lines) is imported at ScenesSectionContainer.tsx:25-30 and ScenesSectionPresenter.tsx:13-19. The touch points name only `ScenesSectionContainer.tsx`, `ScenesSectionPresenter.tsx`, `index.ts` and its tests, per `.claude/rules/frontend-conventions.md`. That rule's layout (lines 46-51) has Container, Presenter, an optional `hooks/` and `index.ts`, with no model module.
Repro: Compare the diff's file list for addons/intelligence/frontend/ScenesSection/ with the touch-point list and frontend-conventions.md lines 46-51.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `ScenesSection/scenesModel.ts` (and `hooks/`) to the touch-point list in the spec revision.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The new section reads the core modules `frontend/src/lib/shortcuts.ts` (`normalizeKey`) and `frontend/src/lib/format.ts` (`formatDuration`). Neither is in the 'core, read only' list.
Impact: The ruler's key handling (I4) depends on how `normalizeKey` maps keys, for example `arrowleft`, `home` and `enter`. A later change to `normalizeKey` could silently stop the ruler keys from matching. The keys would then reach neither the ruler nor be stopped, and with nothing declared, that core file would not be flagged as a dependency of this addon.
Evidence: ScenesSectionContainer.tsx:11 `import { normalizeKey } from "@/lib/shortcuts";`, used at the handleRulerKeyDown key comparison. ScenesSectionPresenter.tsx:12 and scenesModel.ts:1 import `formatDuration` from `@/lib/format`. The read-only list names only mediaClock.ts, usePolicy, useWebSocket and ShortcutsProvider.tsx. (`formatDuration` is named in the spec body §1 step 9 and §9, but not in the touch points.)
Repro: Grep the new addon files for '@/lib/' imports and compare them with the read-only touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List `frontend/src/lib/shortcuts.ts` and `frontend/src/lib/format.ts` under 'In the core, read only'.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The change edits three existing shared e2e-components harness files: the arrangement registry `fixtures/app.tsx`, the desktop project list `projects.ts`, and the width gate `spec-viewport.spec.ts`. The touch-point list declares only 'a new Scenes case, with the fixture and stub it needs'.
Impact: Small. These are shared harness gates that every component spec relies on. Edits to them, such as adding spec names to AT_THE_PHONE_WIDTH and AT_THE_DESKTOP_WIDTH or to DESKTOP_ONLY, change which project runs which file. Earlier reviews in this repository (feature-video-library-app r1, feature-search-results-layout r6) flagged the same kind of edit as unplanned.
Evidence: frontend/e2e-components/fixtures/app.tsx adds the import and 7 `scenes-*` arrangements. frontend/e2e-components/projects.ts adds `**/scenes-section-desktop.spec.ts` to DESKTOP_ONLY. frontend/e2e-components/spec-viewport.spec.ts adds both scenes specs to its width lists.
Repro: Compare the diff's frontend/e2e-components/ entries with the touch-point wording: three of them are existing files, not a new case, fixture or stub.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `fixtures/app.tsx`, `projects.ts` and `spec-viewport.spec.ts` explicitly in the touch points.

</details>

### claude-verify:V-1 — bucket C, LOW, open

Claim: ScenesSectionPresenter.tsx is not a props-only Presenter. Its `Ruler` sub-component holds state and runs effects, which `.claude/rules/frontend-conventions.md:54` forbids: "Presenter: ... No `useState`, no `useEffect`, no API calls." That rule is one of the rules passed through.
Impact: This breaks the declared Container/Presenter convention. It does not change behaviour: the ruler-width measurement and the native keydown listener (added to keep keys from reaching ShortcutsProvider, per I4) live in the Presenter rather than in the Container or in hooks/.
Evidence: addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx:3 imports useEffect, useLayoutEffect, useRef and useState. Inside the Presenter file, Ruler has `useState(0)` for rulerWidth at :402, a `useLayoutEffect` with a ResizeObserver at :417-426, and a `useEffect` that calls `el.addEventListener("keydown", ...)` at :428-437.
Repro: Static reading: grep `use(State|Effect|LayoutEffect)\(` in ScenesSectionPresenter.tsx finds lines 402, 417 and 428.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

## Not verified

- claude-read: I did not read docs/process/reviews/feature-scene-timeline/invariants.md in full to see whether an earlier revision widened the touch-point list.
- claude-read: I did not run any test or check that the submodule commit dc17868 matches the diff shown.
- claude-read: I did not check every transitive core import of the new e2e fixture (for example @/messages-core/en.json and @/lib/mediaController types).
- claude-verify: I did not confirm through git that the three harness files were changed by this branch rather than already present on origin/develop. The conclusion rests on scenes-specific content that only this feature would add.
- claude-verify: I did not check the behavioural invariants I1-I11.
- claude-verify: I did not check whether the design/ documents grant any of the touch-point deviations.

TOTAL: 4 findings
