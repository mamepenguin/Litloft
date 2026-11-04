# Triage: r1

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
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff edits frontend/src/components/FileDetail/FileDetailPresenter.tsx, which is not in the Core (PR 1) touch-point list.
Impact: No user-visible defect. The presenter is the only path from FileDetailContainer to ShellLayout and FileDetailCanvas, so the new hasInspector and onDocumentController props have to pass through it. Leaving it off the list means a scope check that trusts the list would not look at it.
Evidence: In the diff, FileDetailPresenter.tsx adds `hasInspector` and `onDocumentController` to FileDetailPresenterProps and passes them to ShellLayout (the ShellLayout render at FileDetailPresenter.tsx:114) and to FileDetailCanvas. The touch-point list names FileDetailContainer, FileDetailCanvas, MediaCanvas and MediaPlayerBlock, but not FileDetailPresenter.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/components/FileDetail/FileDetailPresenter.tsx` to the Core touch points.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff adds a new module, frontend/src/components/FileDetail/lowerInspector.tsx (a registry, a context provider and a register hook), which is not in the touch-point list.
Impact: No user-visible defect. lowerInspector is delivered through this new React context, which links FileDetailContainer to FileDetailShell. The list puts the lowerInspector work only in FileDetailShell.tsx and MobileInspectorSheet.tsx, so a reader of the list would miss the module that I9/I11-adjacent behaviour (the stable lowerInspector identity) depends on.
Evidence: The diff creates lowerInspector.tsx (useLowerInspectorRegistry, LowerInspectorProvider, useRegisterLowerInspector). FileDetailContainer wraps FileDetailPresenter in LowerInspectorProvider, and FileDetailShell calls useRegisterLowerInspector. MobileInspectorSheet.tsx, which is listed, is not touched.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/components/FileDetail/lowerInspector.tsx` to the Core touch points, in place of or beside MobileInspectorSheet.tsx.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff adds and edits test files that are not in the touch-point list, which names only i18n-keys.test.ts and the e2e-epub host fixture's message list.
Impact: No user-visible defect. The list understates where the I9, I10, I12 and lowerInspector coverage lives.
Evidence: New files: frontend/e2e-epub/goToSection.spec.ts, frontend/src/components/FileDetail/__tests__/DocumentController.test.tsx, InspectorTabsSlot.test.tsx and LowerInspector.test.tsx. Edited: frontend/src/components/FileDetail/__tests__/harness.tsx (adds slotPropsByNode and data-addon). None of these is listed.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the FileDetail __tests__ harness and the new test files, and frontend/e2e-epub/goToSection.spec.ts, in the Core touch points, or state that tests beside a listed module are implicit.

</details>

## Not verified

- claude-read: Did not run any test or e2e spec.
- claude-read: Did not read InspectorShell to check how tab ids containing ':' become DOM ids or selectors.
- claude-read: Did not inspect commit 571652803 on its own (only the base-to-head diff provided); its docs/process records were not read.
- claude-read: Did not check whether docs/process/reviews/.../invariants.md revises the touch-point list (the revisions section supplied was empty).
- claude-verify: I could not run git, so I could not view the exact diff against origin/develop. I inferred which files were changed from what exists in the worktree and from the symbols in them.
- claude-verify: I did not run any tests.
- claude-verify: I did not check invariants I1-I12 beyond the touch-point findings.

TOTAL: 3 findings
