# Triage: r3

## Trajectory

This run:
- claude-read: One branch keeps coming back, so this part of the design is being patched. The original change added a branch to the quiet ToolbarMenu value (`truncateValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"`). The r1→r2 fix 510de1aba removed it. In this round, 6665d0c01 adds the same branch back under a new prop, `fullValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"` (ToolbarMenu.tsx:234), passed only by the two shelf-page sort menus. The r2 revision of I20 now asks for that behaviour. The round also inverted an e2e assertion (1a7329834) and then reverted it (7a816bbee), so the expected look of that value changed twice. In Clips, 1e83ebaba widens the predicate that clears `switchTo`: `switchedAway` becomes `switchSettled` and gains a disjunct, `view.view === "home"`. That adds one more condition to state that the original design introduced, not a new state. In Notes, 1e83ebaba only moves `setSwitchingFor(id)` inside the gated callback and adds no branch. Neither fix removed the transient `switchTo` / `switchingFor` flags.

Earlier runs:
- r2 / claude-read: Only one fix round, 510de1aba, since r1. It removed things and added nothing. In ToolbarMenu's quiet branch it dropped the `truncateValue ? "whitespace-nowrap" : ...` ternary, so the quiet value is always `min-w-[2.5em] truncate` again (ToolbarMenu.tsx:231). It also deleted docs/specs/app-library-filters.md and its three INDEX rows. No new branch, state or prediction was added, so this round does not look like patching the design. The two defects reported below (Notes `switchingFor`, Clips `switchTo`) come from the original per-Target state machinery, not from this round.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/frontend/NotesPage.tsx — partial: lines 36-75 in the repository plus all diff hunks, including the fix at 164-171
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: changed hunks in the supplied diff (most of the file)
- addons/knowledge/frontend/clipsapp/requests.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: rename diff hunks
- addons/knowledge/frontend/library/LibraryList.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/LibraryRail.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/libraryUrl.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/messages/en.json — partial: changed hunks
- addons/knowledge/frontend/messages/ja.json — partial: changed hunks
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunk
- addons/knowledge/frontend/pages/clips.tsx — partial: lines 125-264 in the repository plus all diff hunks, including the switchSettled fix
- frontend/e2e-components/app-header-desktop.spec.ts — partial: lines 80-114 plus diff hunks
- frontend/e2e-components/app-header.measure.ts — partial: changed hunks; grep APP_PAGES/SHELF_PAGES/valueSpanOf
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
- frontend/e2e-layout/fixtures/video-app.html — partial: changed hunks
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: changed hunk
- frontend/src/components/ToolbarMenu.tsx — partial: all diff hunks including the fullValue fix; grep of fullValue usage
- frontend/src/components/appshell/ViewMenus.tsx — full: new file, whole content in diff
- frontend/src/components/readingapp/LibraryControls.tsx — partial: changed hunks plus grep
- frontend/src/components/readingapp/LibraryFace.tsx — partial: changed hunks
- frontend/src/components/readingapp/ReadingApp.tsx — partial: changed hunks
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: changed hunks plus grep for ReadingSortMenu
- frontend/src/components/readingapp/labels.ts — partial: changed hunks
- frontend/src/components/readingapp/useReadingApp.ts — partial: changed hunks
- frontend/src/components/videoapp/LibraryControls.tsx — partial: changed hunks plus grep
- frontend/src/components/videoapp/LibraryFace.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoApp.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoPagedGrid.tsx — full: new file, whole content in diff
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: changed hunks plus grep for SortChoiceMenu
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
- addons/knowledge/frontend/__tests__/clipsTargetChangeOnHome.test.tsx — full: new file, whole content in diff
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/__tests__/notesApp.home.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesFrame.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/notesTargetChangeWhileEditing.test.tsx — full: new file, whole content in diff
- addons/knowledge/frontend/__tests__/notesViewPerTarget.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/__tests__/viewMenusJa.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/clipsapp/__tests__/clipsUrl.test.ts — partial: changed hunks
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: changed hunks
- addons/knowledge/frontend/library/__tests__/NotesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/library/__tests__/libraryUrl.test.ts — partial: changed hunks
- frontend/src/components/__tests__/ToolbarMenu.test.tsx — partial: changed hunks (two new quiet-value tests)
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

## Findings

A: 1
B: 1
C: 0

### claude-read:R1 — bucket A, LOW, open

Claim: In Clips, `switchTo` is still set while a newly chosen member Target is being evaluated on Home. A Library or shelf URL reached in that window, by Back or a link, has its readable `group`/`sort` dropped and replaced with the new Target's resolved view.
Impact: The user chooses a member Smart Collection on Clips Home and presses Back to a Library entry (`?view=all&group=folder&sort=title`) before the evaluation answers. The entry then shows the new Target's stored view, and the history entry is rewritten by replace. This is a narrower remainder of r2's R2: the fix clears `switchTo` on Home only once the Target is `ready`.
Evidence: clips.tsx:209-210: `switchSettled` requires `target.status === "ready"`, so while the member is looked up neither it nor `switchHref` (205-208) fires, and `switchTo` stays set. While it is set, clips.tsx:151-158 deletes `group`/`sort` from `effectiveParams`, and `readClipsView` (159) uses the resolved view. When the Target becomes ready and the view is no longer Home, `switchHref` is non-null, and clips.tsx:216-217 `router.replace`s the URL with that view. The new clipsTargetChangeOnHome.test.tsx uses a non-member smart folder (`tag:work`, evaluated synchronously by the filter path) and navigates only after `settle()`, so it does not cover the window.
Repro: not_reproduced. Traced: store {"sf-beach":{"group":"none"}} with sf-beach a member Target whose evaluation is held on a deferred promise. Start on `?view=all&group=folder&sort=title`, open the Home tab, choose Beach, then `nav.set(?view=all&group=folder&sort=title)` before resolving the evaluation. Then resolve it. By the trace the URL becomes `group=none&sort=newest`.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Clear `switchTo` whenever the view is Home, whatever the Target's status, or record the URL at the time of the choice and rewrite only that URL.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: Only the e2e-components desktop header check at 640px (en) pins that the Video and Reading shelf-page sort menus pass `fullValue`. No jsdom test renders a shelf page and checks the value class.
Impact: If `fullValue={quiet}` is dropped from SortChoiceMenu or ReadingSortMenu, only the real-browser suite catches the regression of I20's whole-value clause. The vitest suite stays green.
Evidence: videoapp/LibraryControls.tsx:30 and readingapp/LibraryControls.tsx:155 pass `fullValue={quiet}`. ToolbarMenu.test.tsx tests only the prop itself. app-header-desktop.spec.ts:101-105 asserts `scrollWidth <= clientWidth` of the sort value for the shelf pages at 640px in en, which a truncated value would fail.
Repro: Mutation by reading: delete `fullValue={quiet}` in readingapp/LibraryControls.tsx:155. ToolbarMenu.test.tsx and the shelf-page continueOrder tests still pass, because they check names and requests, not classes. app-header-desktop.spec.ts:104 would fail in a browser run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I ran no tests or e2e suites. R1 is traced by reading only.
- claude-read: I did not open useNotesTarget.ts to check whether `selectedId` changes synchronously on `choose`, or what `target.status` is during a member evaluation. R1 assumes a `lookingUp` phase before `ready` for member Targets.
- claude-read: I did not measure whether the whole-value shelf-page sort menu fits at 375/390px in ja and en.
- claude-read: I read most product files only through the supplied diff hunks.
- claude-verify: Did not run any test or browser suite; both findings were verified by reading the code only.
- claude-verify: Did not confirm that resolveMemberTarget returns null for the 'tag:work' smart folder used in the test (accepted the reader's statement that it is a non-member).
- claude-verify: Did not check how long member evaluation takes in useMemberTarget, i.e. how wide the R1 window is in practice.

TOTAL: 2 findings
