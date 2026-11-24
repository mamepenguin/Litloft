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

## Read coverage

Product files:
- frontend/e2e-components/fixtures/appHeader.tsx — full: Read the changed hunk with the whole enclosing install() function (lines 90-160).
- frontend/src/components/readingapp/LibraryFace.tsx — full: Read lines 100-400, covering the whole LibraryFace body and every changed hunk; the import hunk is from the diff.
- frontend/src/components/videoapp/LibraryFace.tsx — full: Read the whole file.
- frontend/src/messages-core/en.json — full: Read both changed hunks, the shelves objects of the videoApp and readingApp namespaces, from the diff.
- frontend/src/messages-core/ja.json — full: Read both changed hunks from the diff.

Test files:
- frontend/src/__tests__/appFolderPosition.test.tsx — partial: Read only the diff hunk around lines 291-299.
- frontend/src/__tests__/appSingleShelf.test.tsx — full: New file, read in full in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: Read only the diff hunks at lines 136-153 and 347-370.
- frontend/src/components/videoapp/__tests__/VideoApp.cardMenu.test.tsx — partial: Read only the diff hunk at lines 197-209.
- frontend/src/components/videoapp/__tests__/VideoApp.libraryFilters.test.tsx — partial: Read only the diff hunk at lines 107-115.
- frontend/src/components/videoapp/__tests__/VideoApp.nameFilter.test.tsx — partial: Read only the diff hunk at lines 111-119.
- frontend/src/components/videoapp/__tests__/VideoApp.navigation.test.tsx — partial: Read only the diff hunk at lines 93-102.
- frontend/src/components/videoapp/__tests__/VideoApp.targetView.test.tsx — partial: Read only the diff hunk at lines 102-137.
- frontend/src/components/videoapp/__tests__/VideoApp.viewResolution.test.tsx — partial: Read only the diff hunk at lines 99-117.

## Unspecified behavior, recorded

- claude-read: When the shelves answer reports one shelf, the viewer sees the shelf skeleton and then, after a second request, the grid's own loading view (video VideoPagedGrid loading; reading a book ShelfBlock skeleton) before the cards.
  - F3 × I1 = 3, claude-read: Opening a leaf folder under any non-None grouping shows two loading views in a row before the grid appears; the spec names the two requests but not the two skeletons.
  - F5 × I1 = 5, claude-verify: Opening a grouping that answers one shelf, such as Folder inside a leaf folder, shows the shelf skeleton and then the grid's own loading view before the cards. This is a brief two-step loading flicker and nothing more.
- claude-read: The decision to show the grid uses only `total_shelves` from the first shelves page; if the grid request for the same conditions then returns zero items, the None grid's empty state is shown under a grouping.
  - F0 × I1 = 0, claude-read: It needs the files to change between the shelves request and the grid request; the user would see the empty state instead of a shelf.
  - F0 × I2 = 0, claude-verify: It needs the files to disappear between the shelves request and the grid request. Even then the user sees only the None-style empty state under a grouping that is no longer populated, which is accurate.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff changes frontend/e2e-components/fixtures/appHeader.tsx, which is not in the declared touch-point list.
Impact: No user can hit this. It is a component-test fixture: every grouped shelves answer (by != all) now returns two shelves, Shelf and Other, instead of one. This keeps the app-header e2e component specs drawing shelves under the new single-shelf rule. Folder-grouping chips requests also get the two-shelf answer, so the header fixture now draws two chips where it drew one before. Any e2e screenshot or layout assertion that depends on the Library body may move.
Evidence: frontend/e2e-components/fixtures/appHeader.tsx:122-137: the `by === "all"` branch keeps one shelf, and every other `by` now answers `total_shelves: 2` with shelves `Shelf` and `Other`.
Repro: not_reproduced; I found this by comparing the diff with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff rewrites the shelves fixtures of seven existing unit-test suites from one shelf to two, and none of those files is in the touch-point list.
Impact: No user can hit this. The suites now never send a grouped answer with total_shelves = 1, so they keep exercising the shelf path. None of them checks the new grid switch any more. That coverage rests only on the new appSingleShelf.test.tsx.
Evidence: The touched files are appFolderPosition.test.tsx:291-299, ReadingApp.targetView.test.tsx:136-153, VideoApp.cardMenu.test.tsx:197-209, VideoApp.libraryFilters.test.tsx:107-115, VideoApp.nameFilter.test.tsx:111-119, VideoApp.navigation.test.tsx:93-102, VideoApp.targetView.test.tsx:102-137 and VideoApp.viewResolution.test.tsx:99-117. Each goes from `total_shelves: 1` to `total_shelves: 2`, except where `by` is `all` or `watch`. ReadingApp.targetView.test.tsx also changes one assertion from the drive-name heading to `This folder`, which follows SPEC-CORE-176.
Repro: not_reproduced; I found this by comparing the diff with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, INFO, open

Claim: The This folder title now depends on two shared appshell helpers outside the touch-point list: baseShelfKey in frontend/src/components/appshell/folders.ts, and the `status`/`base` contract of useFolderChips in frontend/src/components/appshell/useFolderChips.ts.
Impact: Both helpers are unchanged. The title's correctness (I5) now depends on their behaviour, which the touch points do not name. useFolderChips reports `ready` after the first page arrives, including a first page with zero child folders (a leaf folder, the spec's 中国語 example). It also reports `ready` while a retry reloads once chips are held. A later change to either helper would silently change the Library title.
Evidence: frontend/src/components/videoapp/LibraryFace.tsx:20 and :185-186, and frontend/src/components/readingapp/LibraryFace.tsx:30 and :187-188, import baseShelfKey and read chips.state.status/base. useFolderChips.ts:102-109 derives the status. folders.ts:9-12 builds `<normal>/`, or `""` at the root.
Repro: not_reproduced; I traced this by reading the code.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test, the type checker or the e2e component specs.
- claude-read: I did not read VideoPagedGrid.tsx or ReadingGrid.tsx to confirm they behave the same under a grouping as under None.
- claude-read: I did not check whether Playwright baselines depend on the appHeader fixture's Library body.
- claude-read: I reviewed the supplied diff, which covers the branch's commits, rather than isolating the docs-only commit 7c58cf4 itself.
- claude-verify: Running git diff against origin/develop to confirm exactly which lines this commit changed: I had no shell, so I checked the current file contents only.
- claude-verify: Running the test suites.
- claude-verify: I3 and I8 rendering paths in the Reading LibraryFace beyond lines 155-215.
- claude-verify: The i18n JSON keys beyond the presence of shelves.thisFolder in en.json.

TOTAL: 3 findings
