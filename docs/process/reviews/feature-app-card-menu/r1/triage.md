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
- addons/knowledge/frontend/ContinueCard.tsx — partial: changed hunks in supplied diff only
- addons/knowledge/frontend/NoteRow.tsx — partial: changed hunks in supplied diff only
- addons/knowledge/frontend/NotesPage.tsx — partial: lines 1-60 and diff hunks
- addons/knowledge/frontend/cardMenu/PageFileMenu.tsx — full: new file, whole content in diff
- addons/knowledge/frontend/clipsapp/ClipCard.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/clipsapp/ClipRow.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/clipsapp/CoverShelf.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/clipsapp/Home.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/clipsapp/usePagedClips.ts — partial: changed hunks in diff
- addons/knowledge/frontend/clipsapp/useShelfData.ts — partial: changed hunks in diff
- addons/knowledge/frontend/library/LibraryList.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/library/pane/NotePaneContainer.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/library/pane/useNoteData.ts — full: read whole file
- addons/knowledge/frontend/library/useNotesList.ts — partial: changed hunks in diff
- addons/knowledge/frontend/notesapp/ContinueWritingSection.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/notesapp/NotesWithSourcesSection.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunks in diff
- addons/knowledge/frontend/pages/clips.tsx — partial: changed hunks in diff
- frontend/e2e-components/app-card-menu.spec.ts — full: new file in diff
- frontend/e2e-components/fixtures/app.tsx — partial: changed hunks in diff
- frontend/e2e-components/fixtures/appCardMenu.tsx — full: new file in diff
- frontend/e2e-components/spec-viewport.spec.ts — partial: changed hunk in diff
- frontend/src/components/FileContextMenu.tsx — partial: changed hunks in diff
- frontend/src/components/appshell/CardFileMenu.tsx — full: new file in diff plus lines 1-60 read
- frontend/src/components/appshell/usePaged.ts — partial: changed hunks in diff
- frontend/src/components/readingapp/DiscoverFace.tsx — partial: changed hunks in diff
- frontend/src/components/readingapp/LibraryFace.tsx — partial: changed hunks in diff
- frontend/src/components/readingapp/ReadingApp.tsx — partial: changed hunks in diff
- frontend/src/components/readingapp/ReadingCard.tsx — partial: changed hunks in diff
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: changed hunks in diff
- frontend/src/components/readingapp/useReadingApp.ts — partial: changed hunks in diff
- frontend/src/components/videoapp/DiscoverFace.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/LibraryFace.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/VideoApp.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/VideoCard.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/VideoPagedGrid.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/useDiscover.ts — partial: changed hunk in diff

Test files:
- addons/knowledge/frontend/__tests__/cardMenuHarness.tsx — full: new file in diff
- addons/knowledge/frontend/__tests__/clipsCardMenu.test.tsx — full: new file in diff
- addons/knowledge/frontend/__tests__/clipsCardMenuStates.test.tsx — full: new file in diff
- addons/knowledge/frontend/__tests__/notesCardMenuStates.test.tsx — full: new file in diff
- addons/knowledge/frontend/__tests__/notesHomeCardMenu.test.tsx — full: new file in diff
- addons/knowledge/frontend/__tests__/notesLibraryCardMenu.test.tsx — full: new file in diff
- addons/knowledge/frontend/__tests__/popup-dismissal.test.ts — partial: changed hunk in diff
- addons/knowledge/frontend/__tests__/reachability.test.ts — partial: changed hunk in diff
- frontend/src/__tests__/watchHistoryCallSites.test.ts — partial: changed hunk in diff
- frontend/src/components/__tests__/FileContextMenu.callbacks.test.tsx — full: new file in diff
- frontend/src/components/appshell/__tests__/CardFileMenu.shelf.test.tsx — full: new file in diff
- frontend/src/components/readingapp/__tests__/ReadingApp.cardMenu.test.tsx — full: new file in diff
- frontend/src/components/readingapp/__tests__/ReadingApp.menuScopes.test.tsx — full: new file in diff
- frontend/src/components/videoapp/__tests__/VideoApp.cardMenu.test.tsx — full: new file in diff
- frontend/src/components/videoapp/__tests__/VideoApp.itemActions.test.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/__tests__/VideoApp.menuScopes.test.tsx — full: new file in diff
- frontend/src/components/videoapp/__tests__/VideoCard.compat.test.tsx — full: new file in diff
- frontend/src/components/videoapp/__tests__/VideoShelfPage.cardMenu.test.tsx — full: new file in diff
- frontend/src/components/videoapp/__tests__/VideoShelfPage.itemActions.test.tsx — partial: changed hunks in diff
- frontend/src/components/videoapp/__tests__/VideoShelfPage.providerPaging.test.tsx — full: new file in diff

## Needs a human

### unspecified_behavior

Note: FileContextMenu immediateRows prop is an unplanned API.; Notes pane note is re-read via useLoad.retry after a menu rename/move.; ReadingCard whitespace text node added for all callers.
- claude-read: FileContextMenu immediateRows prop is an unplanned API.
- claude-read: Notes pane note is re-read via useLoad.retry after a menu rename/move.
- claude-read: ReadingCard whitespace text node added for all callers.
- claude-verify: FileContextMenu immediateRows prop (marks every row immediate) is not described by I8 or the touch points.
- claude-verify: useNoteData revision input re-loads the pane note on change; not described in the spec.

### unspecified_behavior

Note: FileContextMenu immediateRows prop (marks every row immediate) is not described by I8 or the touch points.; useNoteData revision input re-loads the pane note on change; not described in the spec.
- claude-read: FileContextMenu immediateRows prop is an unplanned API.
- claude-read: Notes pane note is re-read via useLoad.retry after a menu rename/move.
- claude-read: ReadingCard whitespace text node added for all callers.
- claude-verify: FileContextMenu immediateRows prop (marks every row immediate) is not described by I8 or the touch points.
- claude-verify: useNoteData revision input re-loads the pane note on change; not described in the spec.

## Findings

A: 0
B: 8
C: 0

### claude-read:TP-1 — bucket B, MEDIUM, open

Claim: The new core module frontend/src/components/appshell/CardFileMenu.tsx, which holds the page menu, every list removal, the re-read and the Continue/history writes for both core apps, is not in the touch-point list.
Impact: The one place that decides which card leaves which list, sends dismissContinueItem/deleteWatchProgress and applies re-read overrides was never named for invariant planning, so a reader of the spec would look for that logic in VideoApp/ReadingApp/ShelfBlock/useRemovableItems and miss it.
Evidence: frontend/src/components/appshell/CardFileMenu.tsx (new, 510 lines): useCardFileMenu holds PageState trashed/removed/overrides, onRemoveFromContinue calls dismissContinueItem, onRemoveFromHistory calls deleteWatchProgress (lines ~18-22 import), handleReRead calls getShelves; touch points list only ShelfBlock.tsx and usePaged.ts under appshell.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add appshell/CardFileMenu.tsx to the SPEC-CORE-157 touch points, noting it as a new deleteWatchProgress/dismissContinueItem caller under the design-decisions watch-history rule.

</details>

### claude-read:TP-2 — bucket B, MEDIUM, open

Claim: The new addon module addons/knowledge/frontend/cardMenu/PageFileMenu.tsx, a second page-menu implementation that calls deleteWatchProgress and getShelves, is not in the touch-point list.
Impact: A new watch-history deletion call site in the addon is outside the planned reach; the spec states the addon 'keeps no menu of its own', yet the addon now owns a full menu host and list-state store parallel to the core one.
Evidence: addons/knowledge/frontend/cardMenu/PageFileMenu.tsx: usePageFileMenu, useCardMenuHandlers, PageFileMenuView with onRemoveFromHistory -> deleteWatchProgress(file.id); reRead -> getShelves(file.drive,{by:'all',ids:[id]}). frontend/src/__tests__/watchHistoryCallSites.test.ts now lists it as a caller.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add cardMenu/PageFileMenu.tsx to the SPEC-ADDON-164 touch points.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: addons/knowledge/frontend/NotesPage.tsx is changed to own the Notes page menu and its removal state, but it is not a touch point, while the planned owner notesapp/Home.tsx is left unchanged.
Impact: The spec says notesapp/Home.tsx holds the removals and re-reads; the code holds them in NotesPage across Home and Library, so a fix guided by the spec would land in the wrong file.
Evidence: addons/knowledge/frontend/NotesPage.tsx:50-54 usePageFileMenu({scope, hasProfile, historyListKeys:['continue']}) and the PageFileMenuProvider wrap; notesapp/Home.tsx absent from the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Replace notesapp/Home.tsx with NotesPage.tsx in the touch points.

</details>

### claude-read:TP-4 — bucket B, LOW, open

Claim: addons/knowledge/frontend/library/pane/useNoteData.ts gains a revision input that re-loads the pane's note, and it is not in the touch-point list.
Impact: The pane's note read now also runs after a rename or move from the menu; useLoad.retry may draw the pane's loading state, a behavior change of the pane not planned in the touch points.
Evidence: addons/knowledge/frontend/library/pane/useNoteData.ts:32-41 useNoteData(noteId, revision) calls retry() when revision changes; NotePaneContainer passes revision from NotesLibrary paneRevision.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add library/pane/useNoteData.ts to the touch points.

</details>

### claude-read:TP-5 — bucket B, LOW, open

Claim: The watch-history guard test frontend/src/__tests__/watchHistoryCallSites.test.ts has its allow-list widened from one caller to three, outside the touch points.
Impact: A rule guard for design-decisions 'removal only on an explicit user action' was relaxed without the spec naming it, so a later unintended caller in either new file passes the guard.
Evidence: frontend/src/__tests__/watchHistoryCallSites.test.ts:67-75 expected callers now include addons/knowledge/frontend/cardMenu/PageFileMenu.tsx and frontend/src/components/appshell/CardFileMenu.tsx.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-6 — bucket B, LOW, open

Claim: FileContextMenu gains a fifth optional prop, immediateRows, that is not among the planned 'three optional callbacks and the optional beforeChange gate'.
Impact: Rows run their handler in the click rather than on the next frame for every caller that opts in; this API surface is not covered by I8's description or the touch point.
Evidence: frontend/src/components/FileContextMenu.tsx: immediateRows?: boolean; rows = immediateRows ? items.map(i=>({...i, immediate:true})) : items; passed by CardFileMenu and PageFileMenuView.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:OBS-1 — bucket B, INFO, open

Claim: ReadingCard now emits a whitespace text node between the title and folder spans for every caller, with or without the fileMenu opt-in.
Impact: The card's text content changes for all ReadingCard uses; I8's no-opt-in DOM guarantee covers VideoCard only, so nothing pins this.
Evidence: frontend/src/components/readingapp/ReadingCard.tsx: '</span>{" "}' after the title span.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-7 — bucket B, INFO, open

Claim: Test and e2e infrastructure outside the touch points is changed: e2e-components/fixtures/app.tsx, fixtures/appCardMenu.tsx, app-card-menu.spec.ts, spec-viewport.spec.ts, and the knowledge module-count guards popup-dismissal.test.ts and reachability.test.ts (99 -> 100).
Impact: None for users; the module-count guards were bumped for PageFileMenu.tsx.
Evidence: diff of frontend/e2e-components/* and addons/knowledge/frontend/__tests__/{popup-dismissal,reachability}.test.ts
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Did not run any test or e2e spec.
- claude-read: Did not read unchanged enclosing code for most modified files beyond the supplied diff hunks.
- claude-read: Did not verify whether useLoad.retry shows a loading state in the Notes pane.
- claude-verify: I could not run git diff against origin/develop, so I did not directly confirm the claims that a file is new or changed (Home.tsx unchanged, 99->100, the ReadingCard line being new).
- claude-verify: I did not run any tests or the e2e suite.
- claude-verify: I did not check the behaviour of CardFileMenu and PageFileMenu against invariants I1-I10.

TOTAL: 8 findings
