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

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: Changed hunks in the provided diff only.
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: Changed hunks in the provided diff only.
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: Changed hunks in the provided diff only.
- addons/knowledge/frontend/clipsapp/requests.ts — partial: Changed hunks in the provided diff only.
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: Changed hunks in the provided diff only.
- addons/knowledge/frontend/clipsapp/useShelfData.ts — partial: Changed hunks in the provided diff only.
- addons/knowledge/frontend/messages/en.json — partial: Changed hunk in the diff.
- addons/knowledge/frontend/messages/ja.json — partial: Changed hunk in the diff.
- addons/knowledge/frontend/pages/clips.tsx — partial: Changed hunks in the provided diff only.
- backend/app/routers/drives.py — partial: Diff hunks: the TagCountsQuery class and the tag-counts routes with _tag_counts in full.
- backend/app/routers/shelves.py — partial: Changed hunks in the diff.
- backend/app/services/watch_state.py — full: New file, whole content in the diff.
- frontend/e2e-components/library-filters-desktop.spec.ts — full: New file, whole content in the diff.
- frontend/e2e-components/library-filters.spec.ts — full: New file, whole content in the diff.
- frontend/e2e-components/projects.ts — partial: Changed hunk in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Changed hunks in the diff.
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: Changed hunks in the diff.
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: Changed hunk in the diff.
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — partial: Changed hunk in the diff.
- frontend/src/components/ToolbarMenu.tsx — partial: Read lines 160-296 (the whole ToolbarMenu function) and the props hunk.
- frontend/src/components/appshell/FilterMenus.tsx — full: New file, whole content in the diff.
- frontend/src/components/appshell/ViewMenus.tsx — partial: The LibraryControlRow hunk in the diff.
- frontend/src/components/appshell/libraryFilters.ts — full: New file, whole content in the diff.
- frontend/src/components/readingapp/LibraryControls.tsx — partial: Removal hunk in the diff.
- frontend/src/components/readingapp/LibraryFace.tsx — partial: Changed hunks in the diff.
- frontend/src/components/readingapp/useReadingApp.ts — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/LibraryFace.tsx — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/VideoPagedGrid.tsx — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/VideoShelfPage.tsx — full: Read the whole file.
- frontend/src/components/videoapp/labels.ts — full: Read the whole file.
- frontend/src/components/videoapp/shelfLinks.ts — full: Whole file is in the diff.
- frontend/src/components/videoapp/useVideoApp.ts — partial: Changed hunks in the diff.
- frontend/src/lib/api.ts — partial: The getTagCounts hunk in the diff.
- frontend/src/lib/memberTarget.ts — partial: Changed hunks in the diff.
- frontend/src/messages-core/en.json — partial: Changed hunks in the diff.
- frontend/src/messages-core/ja.json — partial: Changed hunks in the diff.
- frontend/src/test/setup.ts — partial: Changed hunks in the diff.

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: Changed hunk in the diff.
- addons/knowledge/frontend/__tests__/clipsLibraryFilters.test.tsx — full: New file in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: Changed hunk in the diff.
- backend/tests/test_tag_counts.py — full: New file in the diff.
- backend/tests/test_tag_counts_order.py — full: New file in the diff.
- backend/tests/test_watched_ranges.py — partial: Changed hunk in the diff.
- frontend/src/__tests__/popup-dismissal.test.ts — partial: Changed hunk in the diff.
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: Changed hunks in the diff.
- frontend/src/components/__tests__/toolbarMenuHome.test.ts — partial: Changed hunk in the diff.
- frontend/src/components/__tests__/viewMenus.wording.test.tsx — partial: Changed hunk in the diff.
- frontend/src/components/appshell/__tests__/FilterMenus.loading.test.tsx — full: New file in the diff.
- frontend/src/components/appshell/__tests__/FilterMenus.test.tsx — full: New file in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: Changed hunks in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.libraryFilters.test.tsx — full: New file in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.libraryFilters.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTargetTagCounts.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.targetView.test.tsx — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.viewResolution.test.tsx — partial: Changed hunks in the diff.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.filters.test.tsx — full: New file in the diff.

## Needs a human

### unspecified_behavior

Note: The Video See all page for a tag shelf now has an empty title (R1).; ToolbarMenu's toggle reads `open` from the render closure instead of using a functional update (R2).
- claude-read: The Video See all page for a tag shelf now has an empty title (R1).
- claude-read: ToolbarMenu's toggle reads `open` from the render closure instead of using a functional update (R2).

## Findings

A: 0
B: 6
C: 0

### claude-read:R1 — bucket B, MEDIUM, open

Claim: The diff changes `shelfTitle` in frontend/src/components/videoapp/labels.ts, a file the touch-point list does not name. Together with VideoShelfPage now passing `label: ""`, this leaves the title of a Video `by=tag` See all page empty.
Impact: A user who opens See all on a tag shelf in the Video Library (group by Tag, then See all) sees a page with an empty heading where the tag name used to be. The spec says the See all page's title stays unchanged.
Evidence: frontend/src/components/videoapp/VideoShelfPage.tsx:201 now calls `shelfTitle({ by, shelf: { key: shelfKey, label: "" }, ... })`. Before, it passed `label: shelfKey`. In frontend/src/components/videoapp/labels.ts:41 the `by === "tag"` branch returns `shelf.label`, which is now "" for every key except `no_tag`. Folder titles still work because labels.ts:37-39 fall back to the key, and month titles still work because labels.ts:42 uses `shelf.label || shelf.key`. The tag branch has no such fallback. VideoShelfPage.test.tsx covers titles only for folder and all (lines 130, 138, 239-247), so nothing pins the tag title.
Repro: Mutation reasoning: render `<VideoShelfPage drive="main" by="tag" shelfKey="Trip" />`. `shelfTitle` returns "" from labels.ts:41, so the header heading is empty. Before this commit it was "Trip". No existing test would fail.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In VideoShelfPage, pass `label: shelfKey` again, or make the tag branch of `shelfTitle` fall back to `shelf.key`. Add a title test for `by="tag"`.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: The diff changes the shared frontend/src/components/ToolbarMenu.tsx, adding the `inlineLabel` and `onOpenChange` props and routing every open/close through `changeOpen`. ToolbarMenu.tsx is not in the touch-point list.
Impact: Every ToolbarMenu in the app now goes through the new `changeOpen` path. The toggle changed from `setOpen((s) => !s)` to `changeOpen(!open)`, which reads `open` from the render closure. I traced no defect from this, but the shared-component change was not planned and is outside the declared review surface.
Evidence: frontend/src/components/ToolbarMenu.tsx:174,181,188-196,220,256-262. FilterMenus.tsx is the only caller of `inlineLabel` and `onOpenChange` in the diff. toolbarMenuHome.test.ts adds FilterMenus.tsx as an importer, but no ToolbarMenu test covers the new props.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R6 — bucket B, LOW, open

Claim: The shared Clips test harness predicate `isNewShelf` in addons/knowledge/frontend/__tests__/clipsAppHarness.tsx was loosened so that a `by=all` shelves call with `trust` counts as Home's New shelf when `per_shelf=60`.
Impact: Every Clips test that uses `isNewShelf` now classifies a 60-item `by=all` call with `trust` as the New shelf. A regression where a Home-side call starts carrying `trust` at `per_shelf=60` would be matched instead of rejected.
Evidence: clipsAppHarness.tsx `isNewShelf`: `(!q(c).has("trust") || q(c).get("per_shelf") === "60")`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R3 — bucket B, INFO, open

Claim: frontend/src/components/videoapp/VideoPagedGrid.tsx gains a `filtered` prop and a separate filtered-empty branch, and the touch-point list does not name this file.
Impact: The None grid in Video and the Video See all page share this component. The empty-state branching changed for both: the See all page passes no `filtered`, so it keeps `no-files`. This matches I10, but the file was not planned.
Evidence: frontend/src/components/videoapp/VideoPagedGrid.tsx (diff hunk: `empty` and `ready && items.length === 0` are now separate branches). The only callers are videoapp/LibraryFace.tsx and VideoShelfPage.tsx:248.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R4 — bucket B, INFO, open

Claim: The Reading reset-on-Target-choice and drive-replace logic is in frontend/src/components/readingapp/useReadingApp.ts, which is not listed. The listed `readingapp/ReadingApp.tsx` is not changed by the diff.
Impact: Readers who follow the touch-point list to check I5 for Reading would look in ReadingApp.tsx and miss where the reset actually happens.
Evidence: frontend/src/components/readingapp/useReadingApp.ts: a new `useEffect` calls `readLibraryFilters("reading", drive)`, and `chooseTarget` calls `resetLibraryFilters`. ReadingApp.tsx does not appear in the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R5 — bucket B, INFO, open

Claim: Several pieces of test infrastructure outside the listed test scopes are changed: the global test setup frontend/src/test/setup.ts (it now resets the module-level filter store after every test), frontend/src/__tests__/popup-dismissal.test.ts, readingVideoLayoutFixtureParity.test.tsx, viewMenus.wording.test.tsx, and the e2e-components projects.ts and spec-viewport.spec.ts registries.
Impact: setup.ts now resets the `video` and `reading` filter entries after every test in the frontend suite. A test that relied on filters surviving across tests, or one written for another app id, would behave differently. The other files are registries or expectation updates.
Evidence: frontend/src/test/setup.ts afterEach: `resetLibraryFilters("video", "")` and `resetLibraryFilters("reading", "")`. popup-dismissal.test.ts moves its entry key to appshell/FilterMenus.tsx. projects.ts and spec-viewport.spec.ts register library-filters(-desktop).spec.ts.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or e2e spec.
- claude-read: I did not open the knowledge submodule files beyond the diff hunks.
- claude-read: I did not verify whether docs/addons/knowledge.md or docs/user-guide/notes.md changed inside the submodule commit.
- claude-read: I did not check Discover-origin See all links that use by=tag, if any exist.
- claude-verify: Did not run any test or browser; all reproductions are by reading code.
- claude-verify: Compared against the /Users/libre/Sources/video_share checkout as a proxy for origin/develop; its exact commit was not confirmed.
- claude-verify: Did not check the backend tag-counts invariants (I1, I2, I13) or the Clips URL invariants (I5, I11).

TOTAL: 6 findings
