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
- unspecified_behavior

## Read coverage

Product files:
- addons/knowledge/frontend/NotesPage.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: changed hunks in the supplied diff (most of the file)
- addons/knowledge/frontend/clipsapp/requests.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: rename diff hunks
- addons/knowledge/frontend/library/LibraryList.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/LibraryRail.tsx — partial: changed hunks in the supplied diff; grep line 131
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/libraryUrl.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/messages/en.json — partial: changed hunks; grep lines 410-411
- addons/knowledge/frontend/messages/ja.json — partial: changed hunks; grep lines 410-411
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunk
- addons/knowledge/frontend/pages/clips.tsx — partial: changed hunks in the supplied diff
- frontend/e2e-components/app-header-desktop.spec.ts — partial: changed hunk
- frontend/e2e-components/app-header.measure.ts — partial: changed hunks
- frontend/e2e-components/app-header.spec.ts — partial: changed hunks
- frontend/e2e-components/clips-primary-action-desktop.spec.ts — partial: changed hunk
- frontend/e2e-components/clips-primary-action.spec.ts — partial: changed hunk
- frontend/e2e-components/clips-view-menus-desktop.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/clips-view-menus.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/fixtures/appHeader.tsx — partial: changed hunks
- frontend/e2e-components/fixtures/clipsPage.tsx — partial: changed hunks
- frontend/e2e-components/fixtures/notesLibrary.tsx — partial: changed hunks
- frontend/e2e-components/fixtures/videoCardSpacing.tsx — partial: changed hunk
- frontend/e2e-components/notes-view-menus-desktop.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/notes-view-menus.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/projects.ts — partial: changed hunks
- frontend/e2e-components/spec-viewport.spec.ts — partial: changed hunks
- frontend/e2e-components/view-menus-desktop.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/view-menus.spec.ts — full: new file, whole content in diff
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: changed hunks
- frontend/e2e-layout/fixtures/toolbar-menu.html — partial: changed hunk
- frontend/e2e-layout/fixtures/video-app.html — partial: changed hunks; grep lines 29-35, 98
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: changed hunk
- frontend/src/components/ToolbarMenu.tsx — partial: read lines 130-269 covering all changed hunks
- frontend/src/components/appshell/ViewMenus.tsx — full: new file, whole content in diff
- frontend/src/components/readingapp/LibraryControls.tsx — partial: changed hunks; grep quiet/truncateValue
- frontend/src/components/readingapp/LibraryFace.tsx — partial: changed hunks
- frontend/src/components/readingapp/ReadingApp.tsx — partial: changed hunks
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: changed hunks
- frontend/src/components/readingapp/labels.ts — partial: changed hunks
- frontend/src/components/readingapp/useReadingApp.ts — partial: changed hunks
- frontend/src/components/videoapp/LibraryControls.tsx — partial: changed hunks; grep lines 13-29
- frontend/src/components/videoapp/LibraryFace.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoApp.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoPagedGrid.tsx — full: new file, whole content in diff
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: read lines 95-211 plus diff hunks
- frontend/src/components/videoapp/labels.ts — partial: changed hunks
- frontend/src/components/videoapp/useVideoApp.ts — partial: changed hunks
- frontend/src/lib/appPrefs.ts — partial: changed hunks
- frontend/src/lib/formatMonth.ts — full: new file, whole content in diff
- frontend/src/messages-core/en.json — partial: changed hunks
- frontend/src/messages-core/ja.json — partial: changed hunks

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/clipsFrame.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsPage.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/__tests__/notesApp.home.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesFrame.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/notesViewPerTarget.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/__tests__/viewMenusJa.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/clipsapp/__tests__/clipsUrl.test.ts — partial: changed hunks
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: changed hunks
- addons/knowledge/frontend/library/__tests__/NotesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/library/__tests__/libraryUrl.test.ts — partial: changed hunks
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: changed hunks
- frontend/src/components/__tests__/toolbarMenuHome.test.ts — partial: changed hunk
- frontend/src/components/__tests__/viewMenus.wording.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: changed hunks
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/readingapp/__tests__/ReadingShelfPage.continueOrder.test.tsx — partial: changed hunks
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: changed hunks
- frontend/src/components/videoapp/__tests__/VideoApp.targetView.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: changed hunks
- frontend/src/components/videoapp/__tests__/VideoApp.viewResolution.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/videoapp/__tests__/VideoShelfPage.continueOrder.test.tsx — partial: changed hunks
- frontend/src/lib/__tests__/appPrefs.targetView.test.ts — partial: new file in diff, skimmed
- frontend/src/lib/__tests__/appPrefs.test.ts — partial: changed hunks

## Needs a human

### unspecified_behavior

Note: Quiet sort menus on the Video/Reading shelf pages no longer truncate their value (ToolbarMenu.tsx:231).; Clips Home's See all text changes in ja (すべて見る).; Every outlined ToolbarMenu app-wide now keeps its icon from shrinking and lets a labelled value shrink to 0.
- claude-read: Quiet sort menus on the Video/Reading shelf pages no longer truncate their value (ToolbarMenu.tsx:231).
- claude-read: Clips Home's See all text changes in ja (すべて見る).
- claude-read: Every outlined ToolbarMenu app-wide now keeps its icon from shrinking and lets a labelled value shrink to 0.
- claude-verify: The shared ToolbarMenu now draws the value of a quiet menu with truncateValue without truncation (`whitespace-nowrap`). This affects the Video and Reading shelf-page sort menus, which no touch point or invariant names directly.
- claude-verify: Clips Home shelves now read すべて見る in ja because they share the string with the Library.

### unspecified_behavior

Note: The shared ToolbarMenu now draws the value of a quiet menu with truncateValue without truncation (`whitespace-nowrap`). This affects the Video and Reading shelf-page sort menus, which no touch point or invariant names directly.; Clips Home shelves now read すべて見る in ja because they share the string with the Library.
- claude-read: Quiet sort menus on the Video/Reading shelf pages no longer truncate their value (ToolbarMenu.tsx:231).
- claude-read: Clips Home's See all text changes in ja (すべて見る).
- claude-read: Every outlined ToolbarMenu app-wide now keeps its icon from shrinking and lets a labelled value shrink to 0.
- claude-verify: The shared ToolbarMenu now draws the value of a quiet menu with truncateValue without truncation (`whitespace-nowrap`). This affects the Video and Reading shelf-page sort menus, which no touch point or invariant names directly.
- claude-verify: Clips Home shelves now read すべて見る in ja because they share the string with the Library.

## Findings

A: 0
B: 4
C: 0

### claude-read:R1 — bucket B, MEDIUM, open

Claim: The change edits the shared `frontend/src/components/ToolbarMenu.tsx`, which is not in the touch-point list, and the edit changes how every quiet menu with `truncateValue` draws its value, not only the new view menus.
Impact: The quiet sort menus in the Video and Reading See all / shelf page headers (`VideoShelfPage.tsx:196-201` and `ReadingShelfPage.tsx:228` via `SortChoiceMenu`/`ReadingSortMenu`, which pass `quiet` and `truncateValue`) now render their value with `whitespace-nowrap` and no `truncate`/`min-w-*`. A long sort label therefore never shortens with an ellipsis. The spec says those quiet menus 'keep their look and get only the new wording'. Every outlined ToolbarMenu in the app also picks up `[&>svg]:flex-shrink-0`, and every labelled value picks up `min-w-0`. That includes callers outside this feature (OverflowMenu, PdfPreview, ArchiveToolbar, FilterMenu, TargetMenu's siblings and others).
Evidence: `frontend/src/components/ToolbarMenu.tsx:231`: `<span className={truncateValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"}>` inside the `quiet` branch (previously always `min-w-[2.5em] truncate`). `ToolbarMenu.tsx:223` adds `[&>svg]:flex-shrink-0` and `w-full` under `fullWidth`. `ToolbarMenu.tsx:250` adds `min-w-0`. Callers that pass quiet+truncateValue: `frontend/src/components/videoapp/LibraryControls.tsx:28-29` and `frontend/src/components/readingapp/LibraryControls.tsx:152-154`. The e2e-layout fixture `frontend/e2e-layout/fixtures/video-app.html:35` still models the quiet value as `min-w-0 truncate`, so the layout suite measures a truncating value that the real component no longer draws.
Repro: not_reproduced. By reading: render VideoShelfPage at a narrow width with sort `Date Added (Newest First)`. The value span is `whitespace-nowrap` with no min-w-0, so it cannot shrink below its text width. The real-component check `app-header.spec.ts` (375px, en) only asserts page scrollWidth ≤ 375 and the sort's right edge.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add ToolbarMenu.tsx (and `e2e-layout/fixtures/toolbar-menu.html`) to the touch points, or confine the quiet-branch change to the callers that need it. Bring `video-app.html`'s `quietMenuValue` in line with what the component draws.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: The Japanese Clips `seeAll` / `seeAllIn` strings change from すべて表示 to すべて見る. This wording is not in the spec's wording table and also reaches Clips Home shelves.
Impact: Every Clips shelf's See all link, on Home (Unread, Recently opened, Unverified, New clips) as well as on the Library, now reads すべて見る, as does its accessible name 'すべて見る: {name}'. Nothing in the touch points or wording table plans a change to Home's wording.
Evidence: `addons/knowledge/frontend/messages/ja.json:410-411`. The strings are used by `addons/knowledge/frontend/clipsapp/ClipShelfBlock.tsx:75,78`, which Home and the Library share.
Repro: not_reproduced. Open Clips Home in ja: the Unread shelf's link text is すべて見る.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the See all wording in the spec's wording table, or revert it.

</details>

### claude-read:R3 — bucket B, INFO, open

Claim: Several test-infrastructure files that the diff reaches are not named in the touch-point list.
Impact: No user impact. The planned scope of the e2e-components harness is under-declared: new specs are registered in the project and viewport lists, and the shared app-header fixture gains a `face=library` mode that answers `/shelves` with items.
Evidence:
> Not listed but changed:
> - `frontend/e2e-components/projects.ts` (DESKTOP_ONLY additions) and `frontend/e2e-components/spec-viewport.spec.ts`;
> - `frontend/e2e-components/fixtures/appHeader.tsx` (new `library` install path) and `frontend/e2e-components/app-header.measure.ts` (sort regex);
> - the new `view-menus*.spec.ts`, `clips-view-menus*.spec.ts` and `notes-view-menus*.spec.ts`;
> - `frontend/e2e-layout/fixtures/toolbar-menu.html`;
> - `frontend/src/components/__tests__/viewMenus.wording.test.tsx`;
> - `addons/knowledge/frontend/__tests__/{notesApp.home,notesFrame,clipsAppHarness,clipsViewPerTarget,notesViewPerTarget,viewMenusJa}.test*`.
Repro: not_reproduced. Compare the diff's file list with the Touch points section.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R4 — bucket B, INFO, open

Claim: The change adds a second, separate spec, `docs/specs/app-library-filters.md` (SPEC-CORE-147/148, SPEC-ADDON-151), whose revisions already rewrite this change's I3, I11 and I15, although nothing in that spec is implemented here.
Impact: A reader who checks the code against the 'Revised by later specs' I15 or I3 would conclude that Video must not offer 視聴状態. The code under review still offers it (`videoapp/labels.ts` VIDEO_GROUPS includes `watch`; `LibraryFace.tsx` filters it only by profile) and keeps the 'watch without profile shows Folder' rule in `useVideoApp.ts` pickVideoGroup. That reading could lead to a wrong code change in this PR.
Evidence: `docs/specs/app-library-filters.md` (new, approved, revises SPEC-CORE-145 I15/I11/I3). `docs/specs/INDEX.md` adds SPEC-CORE-147/148/SPEC-ADDON-151 rows. Meanwhile `frontend/src/components/videoapp/labels.ts` VIDEO_GROUPS = folder, tag, month, duration, watch, all, and `viewMenus.wording.test.tsx` expects 視聴状態.
Repro: not_reproduced. Read the 'Revised by later specs' I15 and compare it with the Video Group By options the tests pin.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Land app-library-filters.md with the change that implements it, or note in this review that its revisions are not yet in force.

</details>

## Not verified

- claude-read: I could not run any test or e2e suite, so I did not check whether the quiet shelf-page sort actually overflows at any width.
- claude-read: I did not open every ToolbarMenu caller outside the four apps to judge the visual effect of `[&>svg]:flex-shrink-0` / `min-w-0`.
- claude-read: I did not verify the base-branch content of ToolbarMenu.tsx beyond what the diff shows.
- claude-read: I read most changed product files only through the supplied diff hunks, not in the repository.
- claude-verify: The exact base contents at origin/develop. I could not run git; for ToolbarMenu.tsx and video-app.html I used the sibling checkout at /Users/libre/Sources/video_share as a stand-in.
- claude-verify: Whether the shelf-page sort menu actually overflows at 390px in a real browser (no e2e run).
- claude-verify: The knowledge submodule's own commit history for the ja.json wording change.

TOTAL: 4 findings
