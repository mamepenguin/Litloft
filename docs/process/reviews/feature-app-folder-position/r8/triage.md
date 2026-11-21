# Triage: r8

## Warnings

- R-5 ran at 1687286ec6bf0628b25e56a9f969775b624784ba, and these files changed since: docs/addons/knowledge.md, docs/user-guide/notes.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: r6→r7 (e51492d4e) changed only documents: it revised the I8 invariant text for the home crumb, and no code branch, state or prediction was added. r7→r8 (3dd27eb) adds one predicate, a comparison against the current view (`shown`, via opensAnotherView), to the same crumb-link condition in folderPosition.ts. The earlier round added no code branch, so no branch is being added again. Still, I8's crumb-link rule has now been the subject of two consecutive rounds, the first changing the invariant and the second the code, which is the start of patching one rule. Nothing was removed; the earlier top comparison is kept beside the new one.

Earlier runs:
- r7 / claude-read: The only fix since r6 is e51492d4e, and it changes only documents. It revises I8 in invariants.md so that the home crumb is a link whenever the URL holds a `folder`, which is what the code already did. That resolves r6's I8-TOP by changing the invariant rather than the code. The round adds no new branch, state or prediction to the product code and removes none, so it does not show the design being patched in code. The folder-crumb clause of the revised I8 still says 'differs from the current one', while the code compares with the target's top. That leftover mismatch is reported here as I8-FOLDER-SAME.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Read coverage

Product files:
- frontend/e2e-components/fixtures/app.tsx — partial: Grepped the two changed lines only: the import at 110 and the registry entry at 2854.
- frontend/e2e-components/fixtures/folderRows.tsx — partial: Read lines 1-40 (header and fetch stub). The arrangement body (45-89) was seen only in the provided diff.
- frontend/e2e-components/folder-rows.spec.ts — full: Whole file read.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Grepped the changed AT_THE_PHONE_WIDTH entry at line 42.
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: Grepped positionRows, chipRow and crumbRow (lines 422, 475, 496, 587-588). The rest was seen only in the provided diff.
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: Grepped the crumbRow and chipRow assertions (76-78, 167-203, 267-268). The rest was seen only in the provided diff.
- frontend/src/app/drive/[name]/apps/reading/page.tsx — full: Whole file read.
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx — full: Whole file read.
- frontend/src/app/drive/[name]/apps/video/page.tsx — full: Whole file read.
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: Whole file read.
- frontend/src/components/appshell/FolderPositionRows.tsx — full: Whole file read.
- frontend/src/components/appshell/folderPosition.ts — full: Whole file read; it holds the only product hunk of the reviewed commit.
- frontend/src/components/appshell/folders.ts — full: Whole file read.
- frontend/src/components/appshell/useFolderChips.ts — full: Whole file read.
- frontend/src/components/appshell/useFolderPositionUrl.ts — full: Whole file read.
- frontend/src/components/readingapp/LibraryFace.tsx — partial: Read lines 40-239 (useLibraryChips, the props, targetFolders and folders narrowing, blocked, query, fetches, conditions). The render tail with FolderPositionRows was seen only in the provided diff.
- frontend/src/components/readingapp/ReadingApp.tsx — partial: Grepped the position, onTargetChosen, onChooseFolder and libraryPath lines (33-53, 133-137).
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: Grepped the fromFolder, urlFolders, filtersDropped and libraryHref lines (67-114, 150-180, 289-307).
- frontend/src/components/readingapp/shelfLinks.ts — partial: Grepped the fromFolder lines (8, 33). The rest was seen in the provided diff.
- frontend/src/components/readingapp/useReadingApp.ts — partial: Grepped the onTargetChosen signature and its call (114, 351-353).
- frontend/src/components/videoapp/LibraryFace.tsx — partial: Read lines 100-259 (narrowing, blocked, query, fetches, conditions and the FolderPositionRows mount).
- frontend/src/components/videoapp/VideoApp.tsx — partial: Grepped the position, onTargetChosen, onChooseFolder and libraryPath lines (34-54, 138-141).
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: Grepped the fromFolder, urlFolders, filtersDropped and libraryHref lines (64-118, 164-175, 283-354).
- frontend/src/components/videoapp/shelfLinks.ts — partial: Grepped the fromFolder lines (11, 30). The rest was seen in the provided diff.
- frontend/src/components/videoapp/useVideoApp.ts — partial: Grepped the onTargetChosen signature and its call (116, 350-352).
- frontend/src/messages-core/en.json — partial: Grepped folderPosition and folderTop (16-17) and the remaining 'all' keys, which confirms readingApp.all is gone.
- frontend/src/messages-core/ja.json — partial: Grepped folderPosition and folderTop (16-17) and the remaining 'all' keys.

Test files:
- frontend/src/__tests__/appFolderPosition.test.tsx — partial: Not opened in this round; read in full in the provided diff.
- frontend/src/__tests__/appFolderPositionExtra.test.tsx — partial: Opened lines 380-451, which include the new two-path test; the rest was seen in the provided diff.
- frontend/src/__tests__/section-rows.test.tsx — partial: Only the one-line diff hunk.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Only the one-line diff hunk.
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: Only the diff hunks.
- frontend/src/components/appshell/__tests__/folders.test.ts — not_read: A pure rename with 100% similarity and no content hunk.
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: Only the diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingApp.libraryFilters.test.tsx — partial: Only the diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingApp.menuScopes.test.tsx — partial: Only the diff hunk.
- frontend/src/components/readingapp/__tests__/ReadingApp.nameFilter.test.tsx — partial: Only the diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: Only the diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.menuScopes.test.tsx — partial: Only the diff hunk.
- frontend/src/components/videoapp/__tests__/VideoApp.navigation.test.tsx — partial: Only the diff hunk.
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: Only the diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: Only the diff hunks.

## Needs a human

### unspecified_behavior

Note: The new current-view comparison also changes blocked positions. Example: target path:Videos with URL ?folder=Music/Live. shown = [] and narrowFolders([Videos], 'Music') = [], so the Music crumb, which was a link before the fix, is now plain. Choosing Music would show the same empty state, but the crumb trail would differ ('Music' rather than 'Music > Live'). I8 only restricts which crumbs may be links, so this is permitted. It is still a visible behaviour change that no test names.; Under a multi-folder target, several ancestor crumbs can each link to the same view. Example: sf-two (path:Videos/Study/Math path:Music) at Videos/Study/Math/X, where Videos and Videos/Study both narrow to [Videos/Study/Math]. I8 permits this.; A crumb whose narrowed folders equal the target's top stays plain even though choosing it would show a different view from the current one (for example sf-videos at Videos/Study/Math, crumb Videos). The home crumb reaches the same view. This matches spec §1.5 and is carried over unchanged.; Carried over from r7: while an invalid `folder` is still in the URL, or while droppedAt masks it, position is null for one render, so the home crumb is plain even though the URL holds a `folder`.
- claude-read: The new current-view comparison also changes blocked positions. Example: target path:Videos with URL ?folder=Music/Live. shown = [] and narrowFolders([Videos], 'Music') = [], so the Music crumb, which was a link before the fix, is now plain. Choosing Music would show the same empty state, but the crumb trail would differ ('Music' rather than 'Music > Live'). I8 only restricts which crumbs may be links, so this is permitted. It is still a visible behaviour change that no test names.
- claude-read: Under a multi-folder target, several ancestor crumbs can each link to the same view. Example: sf-two (path:Videos/Study/Math path:Music) at Videos/Study/Math/X, where Videos and Videos/Study both narrow to [Videos/Study/Math]. I8 permits this.
- claude-read: A crumb whose narrowed folders equal the target's top stays plain even though choosing it would show a different view from the current one (for example sf-videos at Videos/Study/Math, crumb Videos). The home crumb reaches the same view. This matches spec §1.5 and is carried over unchanged.
- claude-read: Carried over from r7: while an invalid `folder` is still in the URL, or while droppedAt masks it, position is null for one render, so the home crumb is plain even though the URL holds a `folder`.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I did not run vitest, Playwright or the app. Every conclusion comes from reading code and tracing by hand, including that the new test passes on HEAD and fails on the pre-fix code.
- claude-read: I did not confirm that the smart folder 'path:Videos/Study/Math path:Music' resolves as a parameter target rather than a member target that would need evaluateSmartCollection (which the Extra file mocks). I inferred it from appTarget.ts:112 and videoAppTarget.ts:43 without reading resolveAppTarget in full.
- claude-read: I did not read DESIGN.md or the design artboards, and I read only the first 60 lines of .claude/rules/frontend-conventions.md.
- claude-read: For the existing Reading and Video test files I read only the diff hunks, not their unchanged bodies.
- claude-read: I did not confirm from the backend that several `folder` values are ORed.
- claude-verify: Invariants I1-I7 and I9-I15 (requests, history, URL replace, See all pages) were not checked
- claude-verify: narrowFolders and normalizeFolder semantics in appshell/folders.ts were not read
- claude-verify: The e2e layout spec and fixture parity were not checked
- claude-verify: The chip half of I8 (chips one level below the last crumb) was not verified

TOTAL: 0 findings
