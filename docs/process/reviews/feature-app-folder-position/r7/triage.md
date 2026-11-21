# Triage: r7

## Warnings

- R-5 ran at 1687286ec6bf0628b25e56a9f969775b624784ba, and these files changed since: docs/addons/knowledge.md, docs/user-guide/notes.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: The only fix since r6 is e51492d4e, and it changes only documents. It revises I8 in invariants.md so that the home crumb is a link whenever the URL holds a `folder`, which is what the code already did. That resolves r6's I8-TOP by changing the invariant rather than the code. The round adds no new branch, state or prediction to the product code and removes none, so it does not show the design being patched in code. The folder-crumb clause of the revised I8 still says 'differs from the current one', while the code compares with the target's top. That leftover mismatch is reported here as I8-FOLDER-SAME.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:I8-FOLDER-SAME is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/fixtures/app.tsx — partial: Grepped the two changed lines (110 import, 2854 registry entry); the rest of the large registry was not read.
- frontend/e2e-components/fixtures/folderRows.tsx — full: Whole file read.
- frontend/e2e-components/folder-rows.spec.ts — full: Whole file read.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read lines 30-59, which hold the changed AT_THE_PHONE_WIDTH entry.
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: Read lines 160-597, which hold every changed hunk (shapes, positionRows, library builders, measureApp); lines 1-159 were not read.
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
- frontend/src/components/readingapp/ReadingApp.tsx — full: Whole file read.
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: Read lines 60-329 (props, urlFilters, chooseTarget, query, filtersActive, libraryHref and back link), which hold every changed hunk; the imports and the tail were not read.
- frontend/src/components/readingapp/shelfLinks.ts — full: Whole file read.
- frontend/src/components/readingapp/useReadingApp.ts — partial: Grep context for the changed signature (110-115), the onTargetHandled effect (190-194) and the chooseTarget hunk (348-354).
- frontend/src/components/videoapp/LibraryFace.tsx — full: Whole file read.
- frontend/src/components/videoapp/VideoApp.tsx — full: Whole file read.
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: Read lines 55-364 (props, urlFilters, query, filtersActive, libraryHref and back link), which hold every changed hunk; the imports and the tail were not read.
- frontend/src/components/videoapp/shelfLinks.ts — full: Whole file read.
- frontend/src/components/videoapp/useVideoApp.ts — partial: Read lines 112-361 (the hook through chooseTarget, which holds the changed signature, the pending/target-handled effects and the onTargetChosen hunk).
- frontend/src/messages-core/en.json — partial: Grepped the new common.folderPosition and common.folderTop keys (16-17) and the remaining 'all' keys, to confirm readingApp.all is gone.
- frontend/src/messages-core/ja.json — partial: Grepped the new common.folderPosition and common.folderTop keys (16-17) and the remaining 'all' keys.

Test files:
- frontend/src/__tests__/appFolderPosition.test.tsx — full: New file, read in full in the provided diff.
- frontend/src/__tests__/appFolderPositionExtra.test.tsx — full: New file, read in full in the provided diff.
- frontend/src/__tests__/section-rows.test.tsx — partial: Read only the one-line diff hunk (the allowlist entry).
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Read only the one-line diff hunk.
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: Read only the diff hunks.
- frontend/src/components/appshell/__tests__/folders.test.ts — not_read: Pure rename with 100% similarity and no content hunk.
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: Read only the diff hunks.
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

Note: The revised I8 says the home crumb is a link 'whenever the URL holds a folder'. While an invalid `folder` is still in the URL (before the replace from I10 lands), or while droppedAt masks the folder, position is null. Under a folder-limited target the crumbs are then drawn from base with a plain home crumb. This lasts one render.; VideoShelfPage counts URL folders in filtersActive (VideoShelfPage.tsx:172-177). An empty See all page opened from a position therefore shows 'Nothing matches these filters' rather than the no-files state. This carries over from r6 and is still open for a person.
- claude-read: The revised I8 says the home crumb is a link 'whenever the URL holds a folder'. While an invalid `folder` is still in the URL (before the replace from I10 lands), or while droppedAt masks the folder, position is null. Under a folder-limited target the crumbs are then drawn from base with a plain home crumb. This lasts one render.
- claude-read: VideoShelfPage counts URL folders in filtersActive (VideoShelfPage.tsx:172-177). An empty See all page opened from a position therefore shows 'Nothing matches these filters' rather than the no-files state. This carries over from r6 and is still open for a person.

## Findings

A: 1
B: 0
C: 0

### claude-read:I8-FOLDER-SAME — bucket A, LOW, open

Claim: A folder crumb can be a link even when choosing it shows the same view as the current position. folderCrumbs tests whether the segment's view differs from the target's top (narrowFolders(targetFolders, segment) vs targetFolders), not whether it differs from the current view (narrowFolders(targetFolders, position)).
Impact: Under a Smart Collection with more than one path (for example path:A/b/c path:Q) at position A/b, the crumb A is a link. Choosing it pushes a history entry and scrolls to the top, but the requests (folder=[A/b/c]), the shelves, the chips and the crumb trail stay the same. You can reach this position in normal use by pressing Back across a target change (spec §1.6 keeps the old position), or by opening a URL you saved earlier. The effect is small.
Evidence: frontend/src/components/appshell/folderPosition.ts:70 sets `link: strictAncestor && !sameFolders(narrowFolders(targetFolders, folder), targetFolders)`. folders.ts:26-40 narrowFolders keeps a target folder inside the segment and drops any target folder outside it. So narrowFolders([A/b/c, Q], A) = [A/b/c] ≠ T (A becomes a link), and narrowFolders([A/b/c, Q], A/b) = [A/b/c], which is the current view. The chip loader (readingapp/LibraryFace.tsx:117-128, videoapp/LibraryFace.tsx:119-129) sends folder=[A/b/c] at both positions, so base and chips are the same. searchQuery.ts:674-677 accepts several path: terms, and videoAppTarget.ts:43 passes them as params.folder. The revised I8 (r6) still requires that every folder crumb link 'goes to a strict ancestor of the position whose view differs from the current one'.
Repro: not_reproduced (read only). Trace: target query 'path:A/b/c path:Q', URL ?folder=A/b. targetFolders=[A/b/c,Q], folders=[A/b/c], base=A/b/c, end=A/b/c, segments A (strict ancestor; narrow(T,A)=[A/b/c]≠T → link), A/b (position, plain), A/b/c (current). Choosing A gives position A with folders=[A/b/c], so every request is the same. No test uses a target with more than one folder. If line 70 compared with narrowFolders(targetFolders, position), the sf-videos case at appFolderPosition.test.tsx ('a segment above a folder-limited target's folder is plain') would still pass; that is why the tests cannot tell the two rules apart.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Make a folder crumb a link only when narrowFolders(targetFolders, segment) differs from both targetFolders and narrowFolders(targetFolders, position). Add a position test with a target of two path: folders.

</details>

## Not verified

- claude-read: I did not run vitest, Playwright or the app. Every observation comes from reading the files.
- claude-read: I did not confirm from the backend (shelves.py) that several `folder` values are ORed. I assumed this from the frontend narrowing code and the spec.
- claude-read: I did not read the raw diff of commit e51492d4e itself. Its content was inferred from the commit subject, r7/fixes.txt and invariants.md.
- claude-read: I read only the diff hunks of the existing Reading and Video test files, not their unchanged parts.
- claude-verify: Did not run any tests or the app; the reproduction is by code tracing only.
- claude-verify: Did not read FolderPositionRows.tsx in full to confirm the link flag is drawn as an anchor with no further guard.
- claude-verify: Did not check whether the page code normalises or redirects a typed `folder` such as A/b before it reaches folderCrumbs, beyond readFolderPosition.

TOTAL: 1 findings
