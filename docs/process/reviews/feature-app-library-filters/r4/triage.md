# Triage: r4

## Trajectory

This run:
- claude-read: Round 915c68f7 extends what the earlier rounds added; it does not remove or redesign anything. It adds a third element (`urlFolders`) to the existing `urlFilters` key, which feeds the `droppedFor`/`filtersDropped` prediction added in 966658bf. It adds a `filtersDropped` gate on the folder line and adds `folder` to the route's `dropFilters` branch from 74841848. So it widens a prediction and a branch that the round before it also added: the design is still being patched. Unlike earlier rounds, the change is Reading-only, because Video has no chip. Commit 49b5b6843 only records the review run. No round removed a branch, a state or a prediction.

Earlier runs:
- r2 / claude-read: Fix round ae05085 patches rather than redesigns. The earlier round blanked the See all label and added a label-first branch for folder titles. This round adds a matching fallback branch for tags (`shelf.label || shelf.key`) instead of passing the key as the label again. In ToolbarMenu it removes the `changeOpen` callback path and restores the functional toggle, but it adds a ref (`reported`) and an effect that track the last reported open state, which is new state. Commit 10bcd9ce5 only records the review run and adds no code.
- r3 / claude-read: The design is being patched. Round 74841848 added a branch to fix r2-R1: an `onTargetChosen` callback that wraps `chooseTarget` in both See all pages, plus a URL-replace `dropFilters` in both routes. It called the callback unconditionally, which broke 're-choose keeps' and still let one request go out with the old filters. Round 966658bf then added a state (`droppedFor`/`filtersDropped`, which predicts that the URL replace will land later) and a branch (`if (id === targetId) return`, which repeats the guard already inside useVideoApp/useReadingApp.chooseTarget). Both patch the round before. Each round's addition is copied in the Video and Reading files. Neither round removed a branch or a state. Commit ee60db6f only records the review run and adds no code.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

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
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx — full: Read the whole file.
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: The diff covers the whole file.
- frontend/src/components/ToolbarMenu.tsx — partial: Diff hunks.
- frontend/src/components/appshell/FilterMenus.tsx — full: New file in the diff.
- frontend/src/components/appshell/ViewMenus.tsx — partial: LibraryControlRow hunk.
- frontend/src/components/appshell/libraryFilters.ts — full: New file in the diff.
- frontend/src/components/readingapp/LibraryControls.tsx — partial: Removal hunk.
- frontend/src/components/readingapp/LibraryFace.tsx — partial: Lines 80-219 of the file plus the diff hunks.
- frontend/src/components/readingapp/ReadingShelfPage.tsx — full: Read the whole file.
- frontend/src/components/readingapp/useReadingApp.ts — partial: Diff hunks.
- frontend/src/components/videoapp/LibraryFace.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/VideoPagedGrid.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: Diff hunks, including the whole chooseTarget wrapper and query/fetchPage.
- frontend/src/components/videoapp/labels.ts — partial: Diff hunks.
- frontend/src/components/videoapp/shelfLinks.ts — full: Whole file in the diff.
- frontend/src/components/videoapp/useVideoApp.ts — partial: Diff hunks.
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
- frontend/src/components/readingapp/__tests__/ReadingShelfPage.test.tsx — partial: The two added tests (diff hunk).
- frontend/src/components/readingapp/__tests__/ReadingShelfRoute.targetChoice.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.libraryFilters.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTargetTagCounts.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.targetView.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.viewResolution.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.filters.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.test.tsx — partial: Diff hunk adding the tag title test.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: After a Target choice on a See all page (Reading, and Video in the same way), the URL replace that drops the filters gives the page new `tags`/`folders` props. That rebuilds `query` and `fetchPage`, so usePaged throws away the page it already loaded for the new Target and asks for page 1 again with the same parameters.
Impact: A user who picks another Target on a filtered See all page sees the new Target's grid load, then flash back to the skeleton, then load again, and one shelves request is redundant. Any pages already loaded by scroll in that window are lost. No wrong data is shown.
Evidence: ReadingShelfPage.tsx:84-86: `filtersDropped` is true only while `urlFilters` still equals `droppedFor`. Once the route's router.replace (reading/shelf/page.tsx:13-19) lands, urlTags, urlWatch and urlFolders become new empty values. `query` (ReadingShelfPage.tsx:122-129) depends on [params, urlFolders, urlTags, filtersDropped], so it recomputes to an equal object under a new reference. fetchPage (:133-172) changes with it. usePaged.ts:32-60 refetches page 1 and treats `held` as stale because `held.fetchPage !== fetchPage`. VideoShelfPage.tsx follows the same pattern for tags and watch. Commit 915c68f7 adds `folder` to both the key and the drop.
Repro: not_reproduced. Code reasoning: render the Reading See all route at ?by=tag&key=Trip&tag=SF&folder=Comics and choose another Target. Request 1 goes out with filtersDropped=true. After the replace lands, request 2 goes out with identical params and the grid shows the skeleton in between. The existing tests render ReadingShelfPage with fixed props (ReadingShelfPage.test.tsx), or mock it out (ReadingShelfRoute.targetChoice.test.tsx), so neither one sees the second fetch.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Key `query` on the effective filter values, for example a JSON string of what is applied (empty once dropped), so that the transition from 'dropped' to 'URL now empty' does not change its identity.

</details>

## Not verified

- claude-read: I ran no tests, e2e specs or browser. All conclusions come from reading the code.
- claude-read: I did not re-read the backend tag-counts code or the Clips submodule files beyond the diff hunks.
- claude-read: I did not confirm Next.js App Router timing between router.replace and the re-render with new search params.
- claude-read: I did not check whether ReadingAppHeader uses only `state.chooseTarget` for Target choices.
- claude-verify: I could not run the app or tests. The render ordering of Next's router.replace (a transition that lands after the urgent setState) is inferred, not observed.
- claude-verify: I did not trace the member-Target (POST with ids) path's timing in detail.
- claude-verify: I did not review the rest of the commit beyond the R1 code path.

TOTAL: 1 findings
