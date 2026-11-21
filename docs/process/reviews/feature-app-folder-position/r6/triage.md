# Triage: r6

## Warnings

- R-5 ran at 1687286ec6bf0628b25e56a9f969775b624784ba, and these files changed since: docs/addons/knowledge.md, docs/user-guide/notes.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:I8-TOP is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/fixtures/app.tsx — partial: Read lines 104-111 and 2846-2857, the only two changed lines (import and registry entry); the rest of the large registry was not read.
- frontend/e2e-components/fixtures/folderRows.tsx — full: Whole file read.
- frontend/e2e-components/folder-rows.spec.ts — full: Whole file read.
- frontend/e2e-components/spec-viewport.spec.ts — full: Whole file read.
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: Read lines 160-597, which hold every changed hunk (shapes table, positionRows, the library builders and measureApp); lines 1-159 were not read.
- frontend/e2e-layout/reading-video-faces.spec.ts — full: Whole file read.
- frontend/src/app/drive/[name]/apps/reading/page.tsx — full: Whole file read.
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx — full: Whole file read.
- frontend/src/app/drive/[name]/apps/video/page.tsx — full: Whole file read.
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: Whole file read.
- frontend/src/components/appshell/FolderPositionRows.tsx — full: Whole file read.
- frontend/src/components/appshell/folderPosition.ts — full: Whole file read.
- frontend/src/components/appshell/folders.ts — full: Whole file read.
- frontend/src/components/appshell/useFolderChips.ts — full: Whole file read.
- frontend/src/components/appshell/useFolderPositionUrl.ts — full: Whole file read.
- frontend/src/components/readingapp/LibraryFace.tsx — full: Whole file read.
- frontend/src/components/readingapp/ReadingApp.tsx — partial: Read lines 1-149, which hold the import, prop and LibraryFace hunks; the remainder after the Discover face was not read.
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: Read lines 60-185 (props, urlFilters, chooseTarget, query) and 280-320 (libraryHref and back link); other ranges not read.
- frontend/src/components/readingapp/shelfLinks.ts — full: Whole file read.
- frontend/src/components/readingapp/useReadingApp.ts — partial: Read lines 105-354 (the hook through chooseTarget, which holds the changed signature and the onTargetChosen hunk); the file head and the return object were not read.
- frontend/src/components/videoapp/LibraryFace.tsx — full: Whole file read.
- frontend/src/components/videoapp/VideoApp.tsx — full: Whole file read.
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: Read lines 55-194 (props, urlFilters, query, filtersActive) and 270-360 (libraryHref and back link); other ranges not read.
- frontend/src/components/videoapp/shelfLinks.ts — full: Whole file read.
- frontend/src/components/videoapp/useVideoApp.ts — partial: Read lines 110-359 (the hook through chooseTarget, which holds the changed signature and the onTargetChosen hunk); the file head and the return object were not read.
- frontend/src/messages-core/en.json — partial: Read lines 8-21 (the new common keys) and 1525-1544 (where readingApp.all was removed); also grepped for any remaining t("all") use.
- frontend/src/messages-core/ja.json — partial: Read lines 8-21 (the new common keys) and 1525-1544 (where readingApp.all was removed).

Test files:
- frontend/src/__tests__/appFolderPosition.test.tsx — full: New file, read in full in the diff.
- frontend/src/__tests__/appFolderPositionExtra.test.tsx — full: New file, read in full in the diff.
- frontend/src/__tests__/section-rows.test.tsx — partial: Read lines 55-104, which hold the changed allowlist.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Read only the one-line diff hunk (the folder-rows entry).
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: Read only the diff hunks (import, SHAPE_COUNT, SOURCES, the FolderPositionRows and ReadingLibraryFace renderers).
- frontend/src/components/appshell/__tests__/folders.test.ts — not_read: Pure rename with 100% similarity and no content hunk.
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: Read only the diff hunks (the removed chip describe block and helpers).
- frontend/src/components/readingapp/__tests__/ReadingApp.libraryFilters.test.tsx — partial: Read only the diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingApp.menuScopes.test.tsx — partial: Read only the diff hunk.
- frontend/src/components/readingapp/__tests__/ReadingApp.nameFilter.test.tsx — partial: Read only the diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: Read only the diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.menuScopes.test.tsx — partial: Read only the diff hunk.
- frontend/src/components/videoapp/__tests__/VideoApp.navigation.test.tsx — partial: Read only the diff hunk.
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: Read only the diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: Read only the diff hunks.

## Needs a human

### unspecified_behavior

Note: VideoShelfPage now counts URL folders in filtersActive (VideoShelfPage.tsx:172-177). An empty See all page opened from a position therefore shows the filtered-empty message ('Nothing matches these filters') rather than the no-files state. Reading already did this; the spec does not say which state Video should show.; A Reading chip's label fallback changed from folderLabel(key, drive) (the drive name for the root) to the key's last segment (FolderPositionRows.tsx:116). The root shelf is never a chip, so this is likely invisible.; The Top crumb is a link even when the top shows the same view as the current position under a narrower target (see I8-TOP).
- claude-read: VideoShelfPage now counts URL folders in filtersActive (VideoShelfPage.tsx:172-177). An empty See all page opened from a position therefore shows the filtered-empty message ('Nothing matches these filters') rather than the no-files state. Reading already did this; the spec does not say which state Video should show.
- claude-read: A Reading chip's label fallback changed from folderLabel(key, drive) (the drive name for the root) to the key's last segment (FolderPositionRows.tsx:116). The root shelf is never a chip, so this is likely invisible.
- claude-read: The Top crumb is a link even when the top shows the same view as the current position under a narrower target (see I8-TOP).

## Findings

A: 1
B: 5
C: 0

### claude-read:I8-TOP — bucket A, LOW, open

Claim: The Top (home) crumb is a link whenever a position exists, even when the view at the top is the same as the current one. Example: a target narrower than the position, sf-math (path:Videos/Study/Math) at position Videos/Study, where both views send folder=[Videos/Study/Math].
Impact: Choosing Top adds a history entry and scrolls to the top while showing the same shelves. This is small, but it conflicts with the wording of I8 ('every crumb link goes to a strict ancestor of the position whose view differs from the current one').
Evidence: frontend/src/components/appshell/FolderPositionRows.tsx:61-75 renders the home crumb as an <a> whenever position !== null, with no sameFolders check of the kind folderPosition.ts:70 applies to folder crumbs. appFolderPosition.test.tsx 'under a target narrower than the position, no segment is a link but Top' asserts this. Spec §1.5 says the home crumb 'is plain when there is no folder already', so the spec text sanctions it.
Repro: not_reproduced. By reading: target sf-math, URL folder=Videos/Study. folders = narrowFolders([Videos/Study/Math], Videos/Study) = [Videos/Study/Math], and at the top folders = targetFolders = [Videos/Study/Math], which is identical.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Draw the home crumb plain when narrowFolders(targetFolders, position) equals targetFolders, or state in I8 that the home crumb is excluded.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: Four existing Video test files are edited to tolerate the new chip row and its extra by=folder request: VideoApp.test.tsx, VideoApp.states.test.tsx, VideoApp.navigation.test.tsx and VideoApp.menuScopes.test.tsx. The touch points name only the Reading tests built on the old chip row as changing.
Impact: No user impact. Some assertions are narrowed so that they skip the chip row: shelf text is now matched by heading role, the folder-shelf request is picked out by per_shelf: 5, the target-menu request filters per_shelf !== 1, and the retry test clicks the last of several Retry buttons. A reader of the touch points would not expect Video's existing tests to move.
Evidence: VideoApp.states.test.tsx (diff hunk ~317) changes findByRole(retry) to findAllByRole(retry).at(-1). VideoApp.test.tsx (hunk ~371) changes shelfCalls({by:"folder"}) to shelfCalls({by:"folder", per_shelf: 5}), and (hunk ~486) filters params.per_shelf !== 1. VideoApp.navigation.test.tsx:161 and VideoApp.menuScopes.test.tsx:554 use findByRole("heading"). The edits keep their meaning: if Video's shelves Retry were removed, the last Retry would be the chip Retry, and the heading 'Shelf 0' would never appear.
Repro: not_reproduced (read only)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the Video test files under the touch points, next to the Reading tests.

</details>

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff adds a new component-fixture harness for the folder rows (frontend/e2e-components/fixtures/folderRows.tsx, frontend/e2e-components/folder-rows.spec.ts), registers it in frontend/e2e-components/fixtures/app.tsx, frontend/e2e-components/spec-viewport.spec.ts and frontend/src/components/__tests__/componentFixtureParity.test.tsx. None of these places is in the touch-point list, which names only the e2e-layout spec and fixture for measuring D4.
Impact: None at runtime: these are test files. A reader of the touch points would not expect the e2e-components project's phone-width list (AT_THE_PHONE_WIDTH) or its arrangement registry to change. If either registration were dropped, spec-viewport's every-spec-assigned check or the parity list would go red.
Evidence: frontend/e2e-components/fixtures/app.tsx:110 imports FolderRowsArrangement and :2854 registers "folder-rows". frontend/e2e-components/spec-viewport.spec.ts:42 adds "folder-rows.spec.ts" to AT_THE_PHONE_WIDTH, which runs it on the coarse-pointer Pixel 5 context checked at :246. frontend/e2e-components/folder-rows.spec.ts:19-41 asserts that the Tag control starts below the last folder row and hit-tests the first link's bottom edge. frontend/e2e-components/fixtures/folderRows.tsx:45-89 mounts the real Video and Reading LibraryFace with a stub fetch.
Repro: not_reproduced (read only). The touch-point list in docs/specs/app-folder-position.md was compared against the diff's file list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the e2e-components harness (fixtures/folderRows.tsx, folder-rows.spec.ts, the registry in fixtures/app.tsx, the spec-viewport list and componentFixtureParity) to the spec's touch points.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: frontend/src/__tests__/section-rows.test.tsx is edited: its allowlist of files with `overflow-x-auto` swaps readingapp/LibraryFace.tsx for appshell/FolderPositionRows.tsx. This repository-wide scan is not among the touch points.
Impact: No user impact. The scan is a project rule (no shelf hides its own scrollbar) that the change passes through, but the 'rules passed through' list does not name it.
Evidence: frontend/src/__tests__/section-rows.test.tsx:80-93 lists frontend/src/components/appshell/FolderPositionRows.tsx. FolderPositionRows.tsx:59 and :106 carry pointer-coarse:overflow-x-auto.
Repro: not_reproduced (read only)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name section-rows.test.tsx (the overflow-x-auto allowlist) among the rules passed through.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: Reading `folder` from the URL, pushing positions, cleaning invalid values and replacing the URL on a target change all live in a new shared hook, appshell/useFolderPositionUrl.ts, with parsing and crumb logic in appshell/folderPosition.ts. The touch points place this in the route pages ('reading folder and from_folder from the URL, owning the router') and describe appshell/ only as the shared crumbs-and-chips row plus the moved folders.ts and useFolderChips.ts.
Impact: No user impact. The I4, I5 and I10 logic, and the droppedAt guard that keeps a dropped position out of the requests made for a newly chosen target, sit in a file the touch points don't describe. A reviewer looking for the URL logic in the pages finds only a call to the hook.
Evidence: frontend/src/components/appshell/useFolderPositionUrl.ts:9-66 holds useRouter, router.push, router.replace and the droppedAt state. frontend/src/app/drive/[name]/apps/video/page.tsx:12 and reading/page.tsx:12 only destructure the hook's results. frontend/src/components/appshell/folderPosition.ts:14-73 holds readFolderPosition and folderCrumbs.
Repro: not_reproduced (read only)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name appshell/useFolderPositionUrl.ts and appshell/folderPosition.ts in the touch points as the URL owner the pages call.

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: Two new test files, frontend/src/__tests__/appFolderPosition.test.tsx and appFolderPositionExtra.test.tsx, add the position tests under src/__tests__/. The touch points require position tests but name no place for them. The Extra file also renders LibraryFace directly with a position prop and no URL, for the member-target POST case.
Impact: No user impact. The member-target case (POST bodies carry the narrowed folder) is checked only on a component rendered without the URL wiring, which is the form the touch-point note on position tests sets aside.
Evidence: appFolderPositionExtra.test.tsx: describe.each(APPS) "a member target's requests" renders <Library ... position="Videos/Study"> with no route or router. appFolderPosition.test.tsx renders the route pages through a mocked next/navigation history.
Repro: not_reproduced (read only)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the new src/__tests__/appFolderPosition*.test.tsx files in the touch points.

</details>

## Not verified

- claude-read: No test, vitest or Playwright run was executed; all observations are from reading the files.
- claude-read: Did not verify that the reviewed commit c020d3e alone holds only the test-registration hunks; the review used the full diff as provided.
- claude-read: Did not read the unchanged parts of ReadingApp.library.test.tsx or the Video test files beyond their diff hunks.
- claude-read: Did not read docs/process/reviews/feature-app-folder-position/invariants.md or the design artboards.
- claude-read: Did not run video-card-spacing.spec.ts against the new Video chip row.
- claude-verify: I did not run any test, e2e spec or the app; I made no runtime reproduction.
- claude-verify: I did not read the raw diff of the four VideoApp test files; I checked the current contents at HEAD only.
- claude-verify: I did not verify that HEAD of the worktree equals c020d3e beyond the git status snapshot.
- claude-verify: I did not check the full contents of folderRows.tsx or folder-rows.spec.ts beyond grep hits.

TOTAL: 6 findings
