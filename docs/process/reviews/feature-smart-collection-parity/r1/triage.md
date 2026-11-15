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

Note: Page.test.tsx (addon) rewrote an existing test to stop clicking the submit button and rely on the mount read for the seed. The assertion now only checks that the seed question is the first argument of the last call; it no longer covers the submit path that the test originally exercised.; CollectionPanel.tsx adds aria-labels to the move and remove buttons of the existing collection panel. These labels are new user-visible strings for collection mode, which the spec does not mention.
- claude-read: Page.test.tsx (addon) rewrote an existing test to stop clicking the submit button and rely on the mount read for the seed. The assertion now only checks that the seed question is the first argument of the last call; it no longer covers the submit path that the test originally exercised.
- claude-read: CollectionPanel.tsx adds aria-labels to the move and remove buttons of the existing collection panel. These labels are new user-visible strings for collection mode, which the spec does not mention.

## Findings

A: 0
B: 5
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff adds frontend/src/lib/smartQueue.ts, a new queue store module, which the touch-point list does not name.
Impact: Scope drift: the store holds the Play queue and the player's failure memory. A reader working from the touch-point list would not know this module exists or that it owns the sessionStorage key format.
Evidence: frontend/src/lib/smartQueue.ts (new file, 68 lines) is imported by FileDetailFullScreen.tsx and SmartFolderSaveButton.tsx. The spec's touch list names only smartCollectionEval.ts as new under frontend/src/lib/.
Repro: Compare the diff's new-file list with the spec's Touch points section; smartQueue.ts is absent from the list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/lib/smartQueue.ts to the spec touch-point list.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: The diff adds frontend/src/components/smartFolderActions.ts, which moves the SmartFolderActions interface and its React context out of SmartFolderSaveButton.tsx, and the touch-point list does not name it.
Impact: A refactor of a shared context is outside the list. Any consumer that imported the context from SmartFolderSaveButton would need a new import path, and a reader cannot find the context from the spec.
Evidence: frontend/src/components/smartFolderActions.ts (new); SmartFolderSaveButton.tsx removes the local createContext and the interface and imports them from ./smartFolderActions.
Repro: Grep the spec for smartFolderActions: no match. The e2e and unit tests pass only if no other file imports the context from the old place; this was not checked.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name smartFolderActions.ts in the touch-point list, or move the context back if no other consumer needs it.

</details>

### claude-read:TP-4 — bucket B, LOW, open

Claim: The diff edits frontend/src/components/__tests__/toolbarMenuHome.test.ts to add SmartFolderPlay.tsx to the list of files allowed to hold the shared toolbar menu, and that test file is not in the touch-point list.
Impact: A guard test that enforces one home for the shared toolbar menu is loosened to admit the new file. Future files that copy the menu pattern pass the guard.
Evidence: frontend/src/components/__tests__/toolbarMenuHome.test.ts diff, hunk at the allowlist around line 77: adds "frontend/src/components/SmartFolderPlay.tsx".
Repro: Not reproduced. Read the test's allowlist: the new entry is the only change in that file.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the test file in the touch list, and confirm the new allowlist entry is intended rather than a way around the guard.

</details>

### claude-read:TP-5 — bucket B, LOW, open

Claim: The spec's touch list names frontend/src/lib/fileDetailShell.ts, but the diff leaves it unchanged, and its doc comment now describes the collection route as reached only with ?collection= or ?folder_play=1.
Impact: A reader of fileDetailShell.ts is told the collection surface never covers ?smart_collection=, which is wrong after this change. The spec's step 7 asked for that file to change and it did not.
Evidence: frontend/src/lib/fileDetailShell.ts:27-28 ("`collection` is `/files/{id}`, reached only with `?collection=` / `?folder_play=1`"). The diff has no hunk for this file, and FileDetailFullScreen.tsx passes surface="collection" for every queue mode.
Repro: Grep fileDetailShell.ts for smart_collection: no match.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Update the comment at fileDetailShell.ts:27-28 to include ?smart_collection=, or delete the claim that the route is reached only with those parameters.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff adds frontend/src/components/SmartFolderPlay.tsx, a new component file, which the touch-point list does not name.
Impact: The Play button, its mobile menu row and the smart-collection-actions slot host are now in a file outside the list. The list only says SmartFolderSaveButton.tsx carries Play and the slot.
Evidence: frontend/src/components/SmartFolderPlay.tsx (new, 102 lines) exports SmartFolderPlayButton, SmartFolderPlayMenuItems and SmartCollectionActionsSlot; FolderToolbar.tsx imports them from there.
Repro: Grep the spec's touch-point section for SmartFolderPlay: no match.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name SmartFolderPlay.tsx in the spec touch-point list next to SmartFolderSaveButton.tsx.

</details>

## Not verified

- claude-read: I did not run the test suites or the e2e browser cases; this review read the diff and a single grep of fileDetailShell.ts.
- claude-read: I did not check every existing caller of the context moved to smartFolderActions.ts, or whether any file besides the listed ones imports the removed SmartFolderSaveButton exports.
- claude-read: I did not check the design-decisions rule on addon-to-core imports beyond observing that the addon already imports core modules.
- claude-verify: No command was run, so no build, unit test or e2e result was obtained. Only Read, Glob and Grep were used.
- claude-verify: The content of SmartFolderPlay.tsx, smartQueue.ts and smartFolderActions.ts was not read in full. Only their existence and import sites were confirmed.
- claude-verify: The diff itself was not inspected. The 'diff leaves it unchanged' part of TP-5 is inferred from the absence of a change in the worktree, not from git diff.
- claude-verify: Invariants I1-I12 and the revised spec items were not checked against behaviour.
- claude-verify: The browser-level layout claims (I11) were not checked.

TOTAL: 5 findings
