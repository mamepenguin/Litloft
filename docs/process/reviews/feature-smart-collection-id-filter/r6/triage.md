# Triage: r6

## Warnings

- R-5 ran at 0ec11b3c4e6dcb472b767bc965e2fb2c4f294b96, and these files changed since: docs/user-guide/reading.md; run R-5 again if any of them changes what a user sees

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
B: 7
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The commit adds a new production hook frontend/src/components/appshell/useMemberTarget.ts that is not in the touch-point list; the list names only TargetMenu.tsx and ManageTargetsDialog.tsx under appshell.
Impact: Nothing user-visible by itself. The hook owns the evaluation lifecycle (mount, target change, retry) for both apps, so a later edit to it would bypass the review scope the touch-point list defines.
Evidence: Diff: new file frontend/src/components/appshell/useMemberTarget.ts (+43). Touch-point list, appshell bullet: only TargetMenu.tsx and ManageTargetsDialog.tsx.
Repro: not_reproduced: a diff-to-list comparison only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/appshell/useMemberTarget.ts to the spec's touch-point list.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The commit adds a new production component frontend/src/components/search/InNameNotice.tsx that is not in the touch-point list, although SearchResultsList, PassageList and FolderContent (which render it) are listed.
Impact: Nothing user-visible by itself. The component renders the failed and too-large messages and the 再試行 control for the search page and window, so its text and role=alert behaviour sit outside the listed scope.
Evidence: Diff: new file frontend/src/components/search/InNameNotice.tsx (+31); imported by FolderContent.tsx, PassageList.tsx, SearchResultsList.tsx. Touch-point list does not name it.
Repro: not_reproduced: a diff-to-list comparison only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/search/InNameNotice.tsx to the touch-point list.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: The commit modifies frontend/src/components/smartFolderActions.ts (adds the checking field to SmartFolderActions), which is not in the touch-point list.
Impact: Nothing user-visible by itself. The interface is the contract between SmartFolderController and the save button and menu items, so a change to it affects the save refusal path (I7).
Evidence: Diff: frontend/src/components/smartFolderActions.ts, hunk adding 'checking: boolean' after 'saving: boolean'. Touch-point list names SmartFolderSaveButton.tsx but not smartFolderActions.ts.
Repro: not_reproduced: a diff-to-list comparison only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/smartFolderActions.ts to the touch-point list.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The commit adds frontend/src/lib/memberTarget.ts as a second new lib module, while the touch-point list names only one new resolution module (inNameResolution.ts, under the bullet 'frontend/src/lib/ (the new resolution module)').
Impact: Nothing user-visible. memberTarget.ts holds the app request shapes (appRequests), the member target resolver and the evaluation, which the spec does not describe by name.
Evidence: Diff: new file frontend/src/lib/memberTarget.ts (+105). Touch-point list, lib bullet: 'the new resolution module' (singular).
Repro: not_reproduced: a diff-to-list comparison only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name frontend/src/lib/memberTarget.ts in the lib bullet of the touch-point list.

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: The commit modifies frontend/e2e-components/fixtures/videoCardSpacing.tsx to pass the new required requests prop, and this e2e fixture is not in the touch-point list.
Impact: Nothing user-visible. A missing or wrong requests prop would break the visual-spacing e2e fixture rather than the app.
Evidence: Diff: frontend/e2e-components/fixtures/videoCardSpacing.tsx, two hunks adding requests={appRequests(null, null)} to VideoLibraryFace and ReadingLibraryFace.
Repro: not_reproduced: a diff-to-list comparison only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/e2e-components/fixtures/videoCardSpacing.tsx to the touch-point list.

</details>

### claude-read:TP-6 — bucket B, INFO, open

Claim: The commit adds and modifies frontend test files that the touch-point list does not name: the new helper frontend/src/__tests__/helpers/wireFetch.ts, new tests under frontend/src/components/__tests__/, folder/__tests__/, search/__tests__/, readingapp/__tests__/ and videoapp/__tests__/, and edits to existing scope and library tests (useFolderFiles.scope.test.tsx, useFileSearch.scope.test.tsx, ReadingApp.library.test.tsx).
Impact: Nothing user-visible. The listed tests cover backend/tests/ and addons/intelligence/tests/ only, so the frontend test surface of the change is not described in the spec.
Evidence: Diff: new files under frontend/src/__tests__/helpers/ and frontend/src/components/**/__tests__/ (GlobalSearch.inSmartCollection, SearchPage.inSmartCollection, SmartFolderSaveButton.smartCollectionRefusal, ReadingApp.memberTarget, ShelfPage.memberTarget, VideoApp.memberTarget); modified existing tests as listed.
Repro: not_reproduced: a diff-to-list comparison only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the frontend test directories and the helper in the touch-point list.

</details>

### claude-read:TP-7 — bucket B, INFO, open

Claim: The commit edits frontend/src/__tests__/core-search-vocabulary.test.ts (the expected key count 115 changed to 117, and a CALLERS entry for components/search/InNameNotice.tsx added), which the touch-point list does not name.
Impact: Nothing user-visible. The guard's count and caller map now depend on a new component and new keys, so a future key change edits a file outside the listed scope.
Evidence: Diff: frontend/src/__tests__/core-search-vocabulary.test.ts, hunks at the CALLERS map (+1 line) and expect(used.length).toBe(115 -> 117).
Repro: not_reproduced: a diff-to-list comparison only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/__tests__/core-search-vocabulary.test.ts to the touch-point list.

</details>

## Not verified

- claude-read: Did not run the backend, intelligence, or frontend test suites, nor the TypeScript build or the e2e fixture.
- claude-read: Did not open the worktree copies of the unlisted files; the findings rest on the diff's file list and hunk headers.
- claude-read: Did not verify the body of scope_member_ids in addons/intelligence/app/file_matching.py or the FastAPI Query-model behaviour for FileListingQuery and ShelfQuery.
- claude-read: Did not check whether any other tool or glob in the review pipeline already covers the frontend test directories.
- claude-verify: The git diff at f112fd527 was not available, since only Read, Glob and Grep are allowed, so the 'added' and 'modified' claims were checked only against the working tree.
- claude-verify: The previous count of 115 in core-search-vocabulary.test.ts was not verified.
- claude-verify: The pre-existing scope and library test edits (useFolderFiles.scope.test.tsx, useFileSearch.scope.test.tsx) were not located and checked.
- claude-verify: No test was run, and no behavioral correctness of any changed file was assessed against invariants I1 to I10.

TOTAL: 7 findings
