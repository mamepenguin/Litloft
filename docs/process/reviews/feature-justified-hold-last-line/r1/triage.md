# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The archive entry grid's hover background transition is cancelled by the new unlayered `transition-property: none` rule (F1).; useJustifiedFlip now plays a fade for released cells on a commit whose width differs from the stored snapshot (the `before.width !== width` path). Before this change, that path never animated.
- claude-read: The archive entry grid's hover background transition is cancelled by the new unlayered `transition-property: none` rule (F1).
- claude-read: useJustifiedFlip now plays a fade for released cells on a commit whose width differs from the stored snapshot (the `before.width !== width` path). Before this change, that path never animated.
- claude-verify: The archive grid's clickable cells lose their `transition-colors` hover transition because of the unlayered `transition-property: none` rule (globals.css:1276).

### unspecified_behavior

Note: The archive grid's clickable cells lose their `transition-colors` hover transition because of the unlayered `transition-property: none` rule (globals.css:1276).
- claude-read: The archive entry grid's hover background transition is cancelled by the new unlayered `transition-property: none` rule (F1).
- claude-read: useJustifiedFlip now plays a fade for released cells on a commit whose width differs from the stored snapshot (the `before.width !== width` path). Before this change, that path never animated.
- claude-verify: The archive grid's clickable cells lose their `transition-colors` hover transition because of the unlayered `transition-property: none` rule (globals.css:1276).

## Findings

A: 0
B: 3
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The new unlayered rule `.justified-grid > .justified-grid-cell { transition-property: none; }` in globals.css also matches the archive grid's cells (`ArchiveEntryGrid` / `ArchiveEntryCard`). That grid is not in the touch-point list, and the rule cancels that cell's Tailwind `transition-colors` hover transition.
Impact: In the archive entry grid, the clickable cell's hover background (`hover:bg-bg-elevated`) now switches at once instead of fading over Tailwind's default transition. This visual change outside the planned scope is not covered by any invariant or test. The spec's 'Checked, no action' entry on `ArchiveEntryGrid` covers only the hold, not this CSS.
Evidence: frontend/src/app/globals.css:1276-1278 adds the rule outside any @layer. globals.css:509-510 notes that unlayered rules beat Tailwind's `@layer utilities` whatever their specificity. frontend/src/components/archive/ArchiveEntryGrid.tsx:42-58 renders `ArchiveEntryCard` cells as direct children of `.justified-grid`. frontend/src/components/archive/ArchiveEntryCard.tsx:116 gives the clickable cell `justified-grid-cell ... transition-colors hover:bg-bg-elevated`.
Repro: not_reproduced. Reasoned from the cascade: open an archive whose entries render in the justified grid and hover a clickable cell. With the rule removed the background eases in; with it present, `transition-property` computes to `none` and the change is instant.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Scope the rule to the grid that holds, for example `.justified-grid > .justified-grid-cell[data-held]` together with the cells the flip marks, or `.justified-grid-cell:not(.transition-colors)`. Alternatively, add ArchiveEntryGrid to the touch points and accept the change explicitly.

</details>

### claude-read:F3 — bucket B, LOW, open

Claim: Two new jsdom suites are not in the touch-point list: `FolderBrowser.hasMore.test.tsx` and `FolderContent.moreMayFollow.test.tsx`. The planned 'new jsdom test for the hold hook's branching' does not exist.
Impact: `useJustifiedHold`'s branching is tested only in the Chromium e2e suite: the empty grid, the ResizeObserver path, and the focus fallback when no earlier cell has a `[data-file-thumb]`. That suite does not run in the regular vitest run, so a regression in those branches would pass the jsdom test run.
Evidence: Glob `frontend/src/hooks/__tests__/useJustified*` finds only useJustifiedFlip.test.tsx; no useJustifiedHold test exists. The diff adds frontend/src/components/__tests__/FolderBrowser.hasMore.test.tsx and frontend/src/components/folder/__tests__/FolderContent.moreMayFollow.test.tsx, neither of which is listed.
Repro: Mutation in thought: in useJustifiedHold.ts applyHold, drop the `cells[0].offsetTop !== lastTop` guard. jsdom gives every offsetTop as 0, so a jsdom test asserting the one-line branch would catch it. With no such test, only the e2e I7 case would.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, INFO, open

Claim: The diff edits four fixture/registry files outside the touch-point list: `frontend/e2e-components/fixtures/app.tsx`, `frontend/e2e-components/projects.ts`, `frontend/e2e-components/spec-viewport.spec.ts` and `frontend/src/components/__tests__/componentFixtureParity.test.tsx`. The list names only 'a browser test under frontend/e2e-components/'.
Impact: None for a user. These files register the new `justified-hold` arrangement and the desktop-only spec in shared harness lists that other suites also read.
Evidence: fixtures/app.tsx:70,1905 import and register `JustifiedHoldArrangement`. projects.ts:15 and spec-viewport.spec.ts:74 add `justified-hold-desktop.spec.ts`. componentFixtureParity.test.tsx:284 adds `justified-hold` to the expected arrangement list.
Repro: not_reproduced; read from the diff.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or e2e suite.
- claude-read: I did not check in a browser that ArchiveEntryCard's hover transition is actually cancelled; the conclusion comes from reading the cascade and Tailwind's layering.
- claude-read: I did not inspect other suites that mock useScrollContainer or IntersectionObserver (for example FolderBrowser.snapshotScroll.test.tsx) to see whether they still pass.
- claude-read: I reviewed the diff as given, the branch against its base. I did not separately isolate commit c048af50's own content.
- claude-verify: I did not inspect the actual git diff against origin/develop, so I could not confirm that globals.css:1276-1278 and the registry edits are new in this commit rather than pre-existing.
- claude-verify: I did not run the e2e or jsdom suites.
- claude-verify: I did not check computed styles in a browser to confirm that the Tailwind v4 `transition-colors` output is overridden in practice.

TOTAL: 3 findings
