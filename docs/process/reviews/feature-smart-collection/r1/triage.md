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

## Needs a human

### unspecified_behavior

Note: ConfirmDialog now renders through a portal for all callers, not only the Smart Collection delete confirmation.; lib/api.ts createCollection now omits description from the request body when it is undefined; the touch point covers the 409 typing, not the body shape.
- claude-read: ConfirmDialog now renders through a portal for all callers, not only the Smart Collection delete confirmation.
- claude-read: lib/api.ts createCollection now omits description from the request body when it is undefined; the touch point covers the 409 typing, not the body shape.

## Findings

A: 0
B: 6
C: 0

### claude-read:TP-1 — bucket B, MEDIUM, open

Claim: The commit changes the shared ConfirmDialog component to render through a portal, which is not in the touch-point list and reaches every ConfirmDialog caller in the app.
Impact: Every screen that opens ConfirmDialog now renders it under document.body rather than in its parent, so any caller that relied on its containing element for stacking, event handling or styling changes behaviour without spec coverage. Only the Smart Collection and FileContextMenu tests exercise it.
Evidence: frontend/src/components/ConfirmDialog.tsx:43-84 (createPortal(..., document.body) added). The touch-point list names no ConfirmDialog.tsx. frontend/src/components/__tests__/FileContextMenu.test.tsx:296-306 was edited to mock the dialog with a portal, showing the change ripples into an unrelated test.
Repro: not_reproduced. Mutation check not run; the claim rests on the diff and the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Move the portal into a spec-listed change or revert it for ConfirmDialog and handle the Smart Collection dialogs' containment locally.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: A new file, frontend/src/components/sidebar/useMergedCollectionOrder.ts, holds the merged-order storage and persistence logic that the touch-point list assigns to useSidebarItemOrder.ts and orderMerge.ts.
Impact: The I5 drag-order persistence and the localStorage key sidebar:order:collections-all live in a file the declared list does not name, so a reviewer following the list would not look there for I5 defects.
Evidence: frontend/src/components/sidebar/useMergedCollectionOrder.ts:1-86 (new). The touch-point list names useSidebarItemOrder.ts and orderMerge.ts, which the diff does not change.
Repro: not_reproduced. Based on comparing the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, LOW, open

Claim: A new file, frontend/src/components/sidebar/useSmartCollectionActions.ts, holds the Smart Collection rename and delete state that the spec's touch list does not mention.
Impact: The rename and delete dialog state for Smart Collection rows (I3 and SPEC-CORE-108 step 5.7) lives in an unlisted file, so the declared touch list does not cover where this behaviour is implemented.
Evidence: frontend/src/components/sidebar/useSmartCollectionActions.ts:1-86 (new). Not in the touch-point list.
Repro: not_reproduced. Based on the diff's file list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-4 — bucket B, LOW, open

Claim: A new shared hook, frontend/src/hooks/useNameSubmission.ts, is used by every name-taking path, which the touch-point list does not name.
Impact: The in-flight and in-use state machine that enforces I9 and I10 for all paths is in an unlisted hooks file; a reviewer checking only the listed components would miss it.
Evidence: frontend/src/hooks/useNameSubmission.ts:1-54 (new). Consumed by CollectionDetail.tsx, CollectionPicker.tsx, SmartFolderSaveDialog.tsx, useCollectionManagement.ts. The touch-point list has no hooks/ entry.
Repro: not_reproduced. Based on the diff's file list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-5 — bucket B, LOW, open

Claim: A new helper, frontend/src/lib/nameInUse.ts, defines the 409 test and focusEnd, which the touch-point list does not name.
Impact: The 409 classification used by the name-in-use paths is in an unlisted lib file, so the 409 contract the spec describes has an implementation outside the declared list.
Evidence: frontend/src/lib/nameInUse.ts:1-13 (new). Imported by CollectionDetail.tsx, CollectionPicker.tsx, SmartFolderSaveButton.tsx, SmartFolderSaveDialog.tsx and the sidebar files.
Repro: not_reproduced. Based on the diff's file list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-6 — bucket B, INFO, open

Claim: A new file, frontend/src/lib/apiError.ts, moves the ApiStatusError class out of lib/api.ts, which the touch-point list does not name for that move.
Impact: Consumers of ApiStatusError now depend on a new module, and the class is re-exported from lib/api.ts, so any future code that imports it from the old place still works but the move is undocumented in the list.
Evidence: frontend/src/lib/apiError.ts:1-17 (new). frontend/src/lib/api.ts:4-5 re-exports it, and the class definition was removed from api.ts (diff hunk at line 284).
Repro: not_reproduced. Based on the diff.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not use Glob or Grep to confirm that the new files exist in the worktree or to list every ConfirmDialog caller; the claims rest on the diff text.
- claude-read: I did not run the test suite or check the portal change's effect on other callers in the browser.
- claude-read: I did not check whether any other file imports ApiStatusError by a path that the re-export would miss.
- claude-verify: I did not run git, so I could not check that the worktree matches commit 641156b8f or see the diff. The claim that ConfirmDialog.tsx was changed in this commit rests on classification.json, not on the diff.
- claude-verify: I did not verify whether any caller of ConfirmDialog changes visually or in focus behaviour under the portal.
- claude-verify: I did not check the spec's scope rule that decides whether files outside the touch-point list are a defect, and I did not check invariants I1 to I10 against the code.
- claude-verify: I did not run unit or e2e tests.

TOTAL: 6 findings
