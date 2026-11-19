# Triage: r2

## Trajectory

This run:
- claude-read: Only one fix round, 510de1aba, since r1. It removed things and added nothing. In ToolbarMenu's quiet branch it dropped the `truncateValue ? "whitespace-nowrap" : ...` ternary, so the quiet value is always `min-w-[2.5em] truncate` again (ToolbarMenu.tsx:231). It also deleted docs/specs/app-library-filters.md and its three INDEX rows. No new branch, state or prediction was added, so this round does not look like patching the design. The two defects reported below (Notes `switchingFor`, Clips `switchTo`) come from the original per-Target state machinery, not from this round.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER
- open finding claude-read:R2 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/frontend/NotesPage.tsx — full: read whole file in repository
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: changed hunks in the supplied diff (most of the file) plus grep of followsSort/isTaggedShelf
- addons/knowledge/frontend/clipsapp/requests.ts — partial: changed hunks in the supplied diff plus grep line 137
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: rename diff hunks
- addons/knowledge/frontend/library/LibraryList.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/LibraryRail.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/NotesLibrary.tsx — full: read whole file in repository
- addons/knowledge/frontend/library/libraryUrl.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/messages/en.json — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/messages/ja.json — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunk
- addons/knowledge/frontend/pages/clips.tsx — full: read whole file in repository
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
- frontend/e2e-layout/fixtures/video-app.html — partial: changed hunks
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: changed hunk
- frontend/src/components/ToolbarMenu.tsx — partial: read lines 140-269 covering all changed hunks, including the fix at line 231
- frontend/src/components/appshell/ViewMenus.tsx — full: new file, whole content in diff
- frontend/src/components/readingapp/LibraryControls.tsx — partial: read lines 20-169 plus diff hunks
- frontend/src/components/readingapp/LibraryFace.tsx — partial: changed hunks in the supplied diff
- frontend/src/components/readingapp/ReadingApp.tsx — partial: changed hunks
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: changed hunks plus lines 84-175 via grep context
- frontend/src/components/readingapp/labels.ts — partial: changed hunks
- frontend/src/components/readingapp/useReadingApp.ts — partial: changed hunks plus lines 207-265 via grep context
- frontend/src/components/videoapp/LibraryControls.tsx — partial: changed hunks
- frontend/src/components/videoapp/LibraryFace.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoApp.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoPagedGrid.tsx — full: new file, whole content in diff
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: changed hunks
- frontend/src/components/videoapp/labels.ts — partial: changed hunks
- frontend/src/components/videoapp/useVideoApp.ts — partial: changed hunks plus lines 210-265 via grep context
- frontend/src/lib/appPrefs.ts — partial: changed hunks (all new store functions)
- frontend/src/lib/formatMonth.ts — full: new file, whole content in diff
- frontend/src/messages-core/en.json — partial: changed hunks
- frontend/src/messages-core/ja.json — partial: changed hunks

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/clipsFrame.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsPage.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: new file in diff, read for Target-change cases
- addons/knowledge/frontend/__tests__/notesApp.home.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesFrame.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/notesViewPerTarget.test.tsx — partial: new file in diff, read for gate and Target-change cases
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

## Findings

A: 2
B: 1
C: 0

### claude-read:R1 — bucket A, MEDIUM, open

Claim: In Notes, a Target change made while a note is being edited loses its `sort` replacement: the URL keeps the previous Target's sort under the new Target.
Impact: While editing a note in the Library pane (1280px+ or 1024–1279px), the user picks another Target in the Target menu. The editor saves, and the Target switches. The list and the 並び順 menu then show the previous Target's sort (taken from the URL), not the new Target's stored sort. Switching back and forth no longer shows each Target's own sort (I4).
Evidence: NotesPage.tsx:165-169: `setSwitchingFor(id)` runs at once, but `runGated(() => notesTarget.choose(id))` is deferred. NotesLibrary always registers a gate (NotesLibrary.tsx:167-171). While editing, NotePaneContainer.tsx:154-176 runs `proceed` only after `await flush()`. In the commit that follows the click, targetId is still the old id. The effect at NotesPage.tsx:50-74 therefore reaches line 67 (`switchingFor !== null && switchingFor !== targetId`) and clears `switchingFor` before the Target changes. When `choose(id)` finally runs, the effect takes the line 68 branch (`previous !== targetId && inLibrary && current.has("note")`, and `note` is present because a note is being edited). It replaces the URL with `isLibrarySort(raw) ? raw : sortOf(targetId)`, which keeps the old Target's readable `sort`. `ignoreUrlSort` is false because `switchingFor` is null, so NotesLibrary.tsx:77-78 shows the URL's old sort.
Repro: not_reproduced. Traced: store {"sf-trip":{"sort":"title"}}. Open `?view=all&folder=Journal&note=n1&sort=created` under default, press Edit, then choose Target Trip with the save resolving "saved". Expected `sort=title`; by the trace the URL keeps `sort=created`. notesViewPerTarget.test.tsx's I4 Target-change test runs without an editor open, so it does not cover this path.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Set `switchingFor` inside the gated callback, right before `notesTarget.choose(id)`, or do not clear a pending `switchingFor` while the gate is still holding the change.

</details>

### claude-read:R2 — bucket A, LOW, open

Claim: In Clips, choosing a Target on Home leaves `switchTo` set indefinitely. While it is set, `group`/`sort` in any Library or shelf URL are ignored, and the URL is replaced with the new Target's view, including on history navigation.
Impact: The user is on the Library under Target X (e.g. `group=folder&sort=title`), goes to Home, chooses Target Y, then presses Back. The Library entry made under X shows Y's resolved view instead of its own URL values, and the history entry is rewritten by replace. Any link carrying an explicit `group`/`sort` followed before the next Library visit is also overridden.
Evidence: clips.tsx:205-219: `switchHref` is null when `view.view === "home"`, and `switchedAway` is false once `targetId === switchTo`. Neither clears `switchTo` on Home. While `switchTo !== null`, clips.tsx:151-158 deletes `group` and `sort` from `effectiveParams`, so `readClipsView` uses the resolved view. When a non-home URL arrives, `switchHref` becomes non-null and `router.replace(clipsHref(pathname, view))` rewrites it with that resolved view. The fill-in at :254-257 is also suppressed while `switchTo` is set.
Repro: not_reproduced. Traced: `?view=all&group=folder&sort=title` under default, then the Home tab (push), then choose Work (stored {"sf-work":{"group":"none"}}), then Back. By the trace the Library draws `none`/`newest` and the URL is replaced with `group=none&sort=newest`. No test in clipsViewPerTarget.test.tsx chooses a Target on Home and then navigates.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Clear `switchTo` once the new Target is ready, whatever the view, and only rewrite when the view at that moment is the Library or a shelf page.

</details>

### claude-read:R3 — bucket B, LOW, open

Claim: No test or fixture pins the quiet ToolbarMenu value class, so undoing this round's fix (the quiet value going back to `whitespace-nowrap`) would fail nothing.
Impact: I20's clause "the quiet menus keep their truncating value" can regress silently, and the Video/Reading shelf-page sort menus would stop ellipsizing again.
Evidence: A grep for `min-w-\[2.5em\]` under frontend/ matches only frontend/src/components/ToolbarMenu.tsx. readingVideoLayoutFixtureParity.test.tsx renders only the showLabel/filled/fullWidth variants. In video-app.html, `quietMenuValue` is `min-w-0 truncate`, which models TargetMenu and not the shared class. The r1 verifier confirmed no parity test covers the quiet+truncateValue branch.
Repro: Mutation by reading: change ToolbarMenu.tsx:231 to `truncateValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"`. No test, fixture or parity check references that class, so it would survive.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a unit or parity check that a quiet ToolbarMenu with truncateValue renders its value with `truncate`, or a narrow-width app-header e2e assertion that the shelf-page sort value ellipsizes.

</details>

## Not verified

- claude-read: I ran no tests or e2e suites. R1 and R2 are traced by reading, not reproduced.
- claude-read: I did not check whether useNotesTarget's `choose` moves a non-member smart folder straight to `ready` or through `lookingUp`. Either path still reaches the line 68 branch in R1.
- claude-read: I read most changed product files through the supplied diff hunks, not in full in the repository.
- claude-read: I did not check the backend shelves route's handling of the root key for `by=folder`/`by=month`.
- claude-verify: No tests or e2e suites were run; all three findings were traced by reading only.
- claude-verify: I did not confirm whether useNotesTarget.choose moves through `lookingUp` or becomes ready synchronously; R1 holds either way, because line 68 fires on the first ready commit with the new id.
- claude-verify: I did not check the Reading shelf page sort menu's exact props (ReadingShelfPage.tsx:228) beyond the r1 note.
- claude-verify: I did not check whether the Tailwind build for e2e-components emits min-w-[2.5em].

TOTAL: 3 findings
