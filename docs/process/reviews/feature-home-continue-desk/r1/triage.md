# Triage: r1

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

Question: The touch points say page.test.tsx gains the `continue` view, but its ROUTES table was not extended, so no route-level test checks that ?view=continue reaches FolderBrowser with no folder path and view 'continue'.
Impact: Coverage gap only. If page.tsx later started branching on `continue`, or stopped passing it through, the route test would not notice the new view. The behaviour itself is not shown to be wrong.
Evidence: frontend/src/app/drive/[name]/__tests__/page.test.tsx:62-72 lists favorites, liked, recent, recent-added, all, trash, missing, home and inbox, with no continue; :95 is toHaveLength(9). page.test.tsx is not in r1/classification.json zones_touched, while layout.test.tsx:200 does add ["continue"].
Note: The touch points say page.test.tsx gains the `continue` view, but its ROUTES table was not extended, so no route-level test checks that ?view=continue reaches FolderBrowser with no folder path and view 'continue'.

## Findings

A: 0
B: 7
C: 1

### claude-deep:SCOPE-2 — bucket B, LOW, open

Claim: Sidebar and page-jump tests outside the touch-point list were changed, while the parity tests that the list names were not changed.
Impact: No user-facing effect. The touch points name app/drive/[name]/__tests__/page.test.tsx and components/sidebar/__tests__/pageJumpParity.test.tsx as gaining the view, but the diff instead edits fixedRows.ts, SidebarActiveRow.test.tsx (12 -> 13), SidebarAddonNav.test.tsx, SidebarDriveSwitcher.test.tsx and lib/__tests__/pageJump.test.ts. A reader who checks the list against the diff is misled about which tests guard sidebar/page-jump parity.
Evidence: frontend/src/components/sidebar/__tests__/fixedRows.ts:14 adds {label:'Continue', view:'continue'}; frontend/src/components/__tests__/SidebarActiveRow.test.tsx:132 changes toBe(12) to toBe(13); SidebarAddonNav.test.tsx:121,177 and SidebarDriveSwitcher.test.tsx:199 insert 'Continue'; frontend/src/lib/__tests__/pageJump.test.ts:68,93 add 'continue'. page.test.tsx and pageJumpParity.test.tsx do not appear in the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List these five files in the touch points, or replace page.test.tsx and pageJumpParity.test.tsx with them.

</details>

### claude-deep:SCOPE-1 — bucket B, INFO, open

Claim: The diff edits docs/user-guide/viewers-and-players.md, which is not among the Docs listed in the touch points.
Impact: None for a user: the edit only renames 'Continue watching' to 'Continue' in the Watch progress section, and the prose ('reaching the end ... drops out of Continue') matches the code, because a desk row needs position*10 < duration*9. The touch-point list is incomplete for docs.
Evidence: docs/user-guide/viewers-and-players.md:189 (diff hunk @@ -186,7 +186,7 @@). The touch points list docs/reference/api.md, overview.md, file-browsing.md, comments-history.md, playlists-favorites.md, profile-preferences.md, video.md, reading.md, media-import.md and ADDON-DEVELOPMENT.md, but not viewers-and-players.md.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add docs/user-guide/viewers-and-players.md to the spec's Docs touch points.

</details>

### claude-deep:SCOPE-3 — bucket B, INFO, open

Claim: frontend/src/components/__tests__/EmptyState.test.tsx is changed but is not in the touch-point list.
Impact: None. The variant count goes from 12 to 13 and an icon mapping is added for no-continue, which follows from the listed EmptyState.tsx change.
Evidence: frontend/src/components/__tests__/EmptyState.test.tsx:23 toHaveLength(12) -> 13; :69 adds 'no-continue': 'lucide-play'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the frontend tests in the touch points.

</details>

### claude-deep:SCOPE-4 — bucket B, INFO, open

Claim: Six new frontend test files are added that the touch points do not name, because the list covers only existing frontend tests whose assertions change.
Impact: None for a user. The scope list understates the frontend test surface. Backend new tests are covered by the directory entry backend/tests/.
Evidence: New files in the diff: frontend/src/__tests__/homeContinueDesk.test.tsx, frontend/src/components/__tests__/FolderBrowser.continueView.test.tsx, frontend/src/components/folder/__tests__/useFolderFiles.continue.test.tsx, frontend/src/components/sidebar/__tests__/continueRow.test.tsx, frontend/src/components/readingapp/__tests__/ReadingApp.continueDesk.test.tsx, frontend/src/components/videoapp/__tests__/VideoApp.continueDesk.test.tsx.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a line such as 'frontend acceptance tests for I9/I10 (new files)' to the touch points.

</details>

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff edits docs/user-guide/viewers-and-players.md, which is not in the touch-point list's Docs entry.
Impact: None for a user. The edited sentence (Reaching the end ... drops out of **Continue**) is accurate under the desk predicate, because a finished row fails `position*10 < duration*9`. The only effect is that the planned scope was incomplete.
Evidence: diff hunk docs/user-guide/viewers-and-players.md:189 renames 'Continue watching' to 'Continue'. The Touch points 'Docs:' entry lists overview, file-browsing, comments-history, playlists-favorites, profile-preferences, video, reading, media-import and ADDON-DEVELOPMENT, but not viewers-and-players.md.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add docs/user-guide/viewers-and-players.md to the spec's Docs touch point, or accept it as planned scope.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff edits six existing frontend test files that the touch-point list does not name: components/__tests__/EmptyState.test.tsx, components/__tests__/SidebarActiveRow.test.tsx, components/__tests__/SidebarAddonNav.test.tsx, components/sidebar/__tests__/SidebarDriveSwitcher.test.tsx, components/sidebar/__tests__/fixedRows.ts and lib/__tests__/pageJump.test.ts.
Impact: No user impact. Each edit adds the new view or variant to an enumeration (EMPTY_VARIANTS length 12 to 13, FIXED_SIDEBAR_ROWS 12 to 13, sidebar label lists gain 'Continue' before 'Recently Viewed', pageJump keys and hrefs gain 'continue'). None loosens an assertion. The touch list named page.test.tsx and pageJumpParity.test.tsx instead. The diff does not touch those two: pageJumpParity derives its expectation from FIXED_JUMPS, so it covers the new entry without an edit. So the list named the wrong enumeration tests.
Evidence: diff: EmptyState.test.tsx:23 toHaveLength(13) and :69 'no-continue': 'lucide-play'; SidebarActiveRow.test.tsx:132 toBe(13); SidebarAddonNav.test.tsx:121,177 'Continue'; SidebarDriveSwitcher.test.tsx:199 'Continue'; fixedRows.ts:14 {label:'Continue',view:'continue'}; pageJump.test.ts:68,93 continue entries. pageJumpParity.test.tsx:36 compares sidebar hrefs to FIXED_JUMPS, which is derived, so it needs no change.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List these enumeration tests in the touch points in place of, or beside, page.test.tsx and pageJumpParity.test.tsx.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff adds six new frontend acceptance test files that are not in the touch-point list: __tests__/homeContinueDesk.test.tsx, components/__tests__/FolderBrowser.continueView.test.tsx, components/folder/__tests__/useFolderFiles.continue.test.tsx, readingapp/__tests__/ReadingApp.continueDesk.test.tsx, videoapp/__tests__/VideoApp.continueDesk.test.tsx and sidebar/__tests__/continueRow.test.tsx.
Impact: No user impact. The touch list covers backend tests generically ('backend/tests/: watch-history, shelves, progress and migration tests'). For the frontend it names only existing tests whose assertions change, so new frontend test files are outside the declared scope.
Evidence: diff 'new file mode' for the six paths above. Touch points name frontend tests only under 'Tests that enumerate views...' and 'Frontend tests whose assertions change'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a 'frontend/src/**/__tests__: new acceptance tests for I9/I10 and SPEC-CORE-071' line to the touch points.

</details>

### claude-verify:V-1 — bucket C, LOW, open

Claim: The touch points say page.test.tsx gains the `continue` view, but its ROUTES table was not extended, so no route-level test checks that ?view=continue reaches FolderBrowser with no folder path and view 'continue'.
Impact: Coverage gap only. If page.tsx later started branching on `continue`, or stopped passing it through, the route test would not notice the new view. The behaviour itself is not shown to be wrong.
Evidence: frontend/src/app/drive/[name]/__tests__/page.test.tsx:62-72 lists favorites, liked, recent, recent-added, all, trash, missing, home and inbox, with no continue; :95 is toHaveLength(9). page.test.tsx is not in r1/classification.json zones_touched, while layout.test.tsx:200 does add ["continue"].
Repro: Read page.test.tsx:62-96: no ROUTES entry has view 'continue'.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

## Not verified

- claude-deep: Did not run any backend or frontend test.
- claude-deep: Did not read the current content of app/drive/[name]/__tests__/page.test.tsx or components/sidebar/__tests__/pageJumpParity.test.tsx to see whether they enumerate views dynamically and so need no edit.
- claude-deep: Did not inspect the actual contents of commit c84d58635 alone. The review used the full branch diff supplied.
- claude-deep: Did not check the iOS app or any non-SQLite database.
- claude-read: I did not run any test. I could not confirm that the edited enumeration tests pass, or that page.test.tsx passes without an edit.
- claude-read: I did not check whether the reviewed commit c84d58635 alone (a docs-only R-5 record) differs from the branch diff shown. I reviewed the diff as given.
- claude-read: I did not inspect docs/process/reviews/feature-home-continue-desk/invariants.md for revisions beyond the text quoted in the prompt.
- claude-verify: I could not run git diff. Changed-file membership comes from r1/classification.json and the current file contents, not from the raw diff hunks.
- claude-verify: I did not verify the backend behaviour invariants I1–I8.
- claude-verify: I did not run any tests.

TOTAL: 8 findings
