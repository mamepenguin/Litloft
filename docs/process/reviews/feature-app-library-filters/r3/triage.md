# Triage: r3

## Trajectory

This run:
- claude-read: The design is being patched. Round 74841848 added a branch to fix r2-R1: an `onTargetChosen` callback that wraps `chooseTarget` in both See all pages, plus a URL-replace `dropFilters` in both routes. It called the callback unconditionally, which broke 're-choose keeps' and still let one request go out with the old filters. Round 966658bf then added a state (`droppedFor`/`filtersDropped`, which predicts that the URL replace will land later) and a branch (`if (id === targetId) return`, which repeats the guard already inside useVideoApp/useReadingApp.chooseTarget). Both patch the round before. Each round's addition is copied in the Video and Reading files. Neither round removed a branch or a state. Commit ee60db6f only records the review run and adds no code.

Earlier runs:
- r2 / claude-read: Fix round ae05085 patches rather than redesigns. The earlier round blanked the See all label and added a label-first branch for folder titles. This round adds a matching fallback branch for tags (`shelf.label || shelf.key`) instead of passing the key as the label again. In ToolbarMenu it removes the `changeOpen` callback path and restores the functional toggle, but it adds a ref (`reported`) and an effect that track the last reported open state, which is new state. Commit 10bcd9ce5 only records the review run and adds no code.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- incomplete_read: frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx (missing), frontend/src/components/readingapp/ReadingShelfPage.tsx (missing)

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: Diff hunks in the prompt only.
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: Diff hunks in the prompt only.
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: Diff hunks in the prompt only.
- addons/knowledge/frontend/clipsapp/requests.ts — partial: Diff hunks in the prompt only.
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: Diff hunks in the prompt only.
- addons/knowledge/frontend/clipsapp/useShelfData.ts — partial: Diff hunks in the prompt only.
- addons/knowledge/frontend/messages/en.json — partial: Diff hunk.
- addons/knowledge/frontend/messages/ja.json — partial: Diff hunk.
- addons/knowledge/frontend/pages/clips.tsx — partial: Diff hunks in the prompt only.
- backend/app/routers/drives.py — partial: Diff hunks: TagCountsQuery, the tag-counts routes and _tag_counts in full.
- backend/app/routers/shelves.py — partial: Diff hunks.
- backend/app/services/watch_state.py — full: New file, whole content in the diff.
- frontend/e2e-components/library-filters-desktop.spec.ts — full: New file in the diff.
- frontend/e2e-components/library-filters.spec.ts — full: New file in the diff.
- frontend/e2e-components/projects.ts — partial: Diff hunk.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Diff hunks.
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: Diff hunks.
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: Diff hunk.
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx — missing from coverage
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: The diff covers almost the whole file, including the new dropFilters.
- frontend/src/components/ToolbarMenu.tsx — partial: Diff hunks.
- frontend/src/components/appshell/FilterMenus.tsx — full: New file in the diff.
- frontend/src/components/appshell/ViewMenus.tsx — partial: LibraryControlRow hunk.
- frontend/src/components/appshell/libraryFilters.ts — full: New file in the diff.
- frontend/src/components/readingapp/LibraryControls.tsx — partial: Removal hunk.
- frontend/src/components/readingapp/LibraryFace.tsx — partial: Diff hunks.
- frontend/src/components/readingapp/ReadingShelfPage.tsx — missing from coverage
- frontend/src/components/readingapp/useReadingApp.ts — partial: Diff hunks.
- frontend/src/components/videoapp/LibraryFace.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/VideoPagedGrid.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/VideoShelfPage.tsx — full: Read the whole file.
- frontend/src/components/videoapp/labels.ts — partial: Diff hunks.
- frontend/src/components/videoapp/shelfLinks.ts — full: Whole file in the diff.
- frontend/src/components/videoapp/useVideoApp.ts — partial: Lines 120-304, including targetId resolution and chooseTarget.
- frontend/src/lib/api.ts — partial: getTagCounts hunk.
- frontend/src/lib/memberTarget.ts — partial: Diff hunks.
- frontend/src/messages-core/en.json — partial: Diff hunks.
- frontend/src/messages-core/ja.json — partial: Diff hunks.
- frontend/src/test/setup.ts — partial: Diff hunks.

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: Diff hunk.
- addons/knowledge/frontend/__tests__/clipsLibraryFilters.test.tsx — full: New file in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: Diff hunk.
- backend/tests/test_tag_counts.py — full: New file in the diff.
- backend/tests/test_tag_counts_order.py — full: New file in the diff.
- backend/tests/test_watched_ranges.py — partial: Diff hunk.
- frontend/src/__tests__/popup-dismissal.test.ts — partial: Diff hunk.
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: Diff hunks.
- frontend/src/components/__tests__/toolbarMenuHome.test.ts — partial: Diff hunk.
- frontend/src/components/__tests__/viewMenus.wording.test.tsx — partial: Diff hunk.
- frontend/src/components/appshell/__tests__/FilterMenus.loading.test.tsx — full: New file in the diff.
- frontend/src/components/appshell/__tests__/FilterMenus.test.tsx — full: New file in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: Diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingApp.libraryFilters.test.tsx — full: New file in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: Diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingShelfRoute.targetChoice.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.libraryFilters.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTargetTagCounts.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.targetView.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.viewResolution.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.filters.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.test.tsx — partial: Diff hunk adding the tag title test.

## Needs a human

### unspecified_behavior

Note: On the Reading See all page, a Target choice drops tag and watch but keeps the URL's folder chip conditions (R2). The spec does not say what happens to the chip on a See all Target choice.
- claude-read: On the Reading See all page, a Target choice drops tag and watch but keeps the URL's folder chip conditions (R2). The spec does not say what happens to the chip on a See all Target choice.

### incomplete_read

Note: frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx (missing), frontend/src/components/readingapp/ReadingShelfPage.tsx (missing)
Paths:
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx
- frontend/src/components/readingapp/ReadingShelfPage.tsx

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: Reading's See all fix for a Target choice is untested at the component level: no test checks that ReadingShelfPage stops sending the URL's tag/watch after another Target is chosen, or that it keeps them when the Target in force is re-chosen.
Impact: If someone removes `filtersDropped`, or the `id === targetId` guard, from ReadingShelfPage, the suite still passes. A Reading See all page could then send one request for the new Target that still carries the old tag/watch, or drop the URL filters when the user re-chooses the same Target. The Video counterpart of each case is tested.
Evidence: ReadingShelfRoute.targetChoice.test.tsx mocks ReadingShelfPage completely (its `vi.mock("@/components/readingapp/ReadingShelfPage")` renders a single button), so it tests only the route's `dropFilters`. ReadingShelfPage.test.tsx:175-189 ('keeps the key when the target changes') passes no tags or watch. The logic it leaves untested is ReadingShelfPage.tsx:84-95 (droppedFor, guard), :108 (requestedWatch) and :126 (merged tags). The Video equivalents are tested by VideoShelfPage.filters.test.tsx ('re-choosing the Target in force…keeps' and 'after another Target is chosen…no request carries').
Repro: Mutation: in ReadingShelfPage.tsx:126, change `filtersDropped ? [] : (urlTags ?? [])` to `urlTags ?? []`, or delete line 89 (`if (id === targetId) return;`). By reading the tests, no Reading test fails.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Port the two Video cases ('re-choosing keeps', 'no request carries the URL filters after another Target') to a ReadingShelfPage test that renders the real component with tags and watch props.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: After a Target choice on Reading's See all page, the URL's `folder` chip conditions still apply to the new Target's shelf. The fix drops only `tag` and `watch`.
Impact: A user opens See all from a Reading Library with a folder chip chosen, then picks another Target in the header. The new Target's shelf is still narrowed to the old Target's chip folder, and nothing on the page shows it. This is the same 'invisible narrowing' that the fix commit 74841848 gives as its reason for dropping tag/watch.
Evidence: reading/shelf/page.tsx `dropFilters` deletes only `tag` and `watch`, and still passes `folders={search.getAll("folder")…}`. ReadingShelfPage.tsx:125 applies `urlFolders` with no `filtersDropped` check. SPEC-CORE-063 I16b (as revised) says the chip 'resets to All … on a target change'.
Repro: not_reproduced. Code reasoning: open /drive/main/apps/reading/shelf?by=tag&key=Trip&folder=Books/Comics&from=library, choose another Target, and the next shelves request still carries folder=[Books/Comics].
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide whether a Target choice on the Reading See all page should also drop `folder`. If it should, add it to dropFilters and to the filtersDropped gate.

</details>

## Not verified

- claude-read: I ran no tests or e2e specs. All conclusions come from reading the code.
- claude-read: I did not re-read the backend tag-counts code or the Clips files beyond the diff hunks shown.
- claude-read: I did not check whether the Target menu can be opened while smart folders are still loading, when `targetId` is temporarily 'default'.
- claude-read: I did not read ReadingAppHeader or VideoAppHeader to confirm that they use `state.chooseTarget` from the wrapped object and no other path.
- claude-verify: Did not run any tests; all conclusions come from reading the code.
- claude-verify: Did not check git history to confirm the exact commit where the folder pass-through on the shelf page was introduced.
- claude-verify: Did not review the Video equivalents (VideoShelfPage.filters.test.tsx) beyond what the finding cites.

TOTAL: 2 findings
