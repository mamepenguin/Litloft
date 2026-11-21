# Triage: r2

## Trajectory

This run:
- claude-read: The rounds since r1 both added and removed. 373e5ba, f298bf4, 9ff5468, 42f4051 and 498a426 are docs, approval, the guard list and the submodule pointer; they add no product state. 34c3f1a adds a second prediction on top of fetchAlignedPage's offset prediction: the total becomes `server total + removedBefore`. It patches a symptom (the list ending early) of a design that predicts server page boundaries from a removed count, which signals the design is being patched. That design now has three separate variants (core fetchAlignedPage, addon usePagedClips reread, addon useNotesList reread), each relying on dedupe to mask overlap (R2-4). 36ff278 goes the other way: it removes the addon's parallel menu state machine (five dialog states, its own rename/move/trash handlers, a re-entrancy guard and the file-id reset effect) and draws the shared FileContextMenu.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R2-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/frontend/ContinueCard.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/NoteRow.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/NotesPage.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/cardMenu/PageFileMenu.tsx — full: new file, whole content in diff at the pinned commit
- addons/knowledge/frontend/clipsapp/ClipCard.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/clipsapp/ClipRow.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/clipsapp/CoverShelf.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/clipsapp/Home.tsx — partial: changed hunks in supplied diff (CardShelf, UnverifiedShelf, UnverifiedRows)
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: changed hunks in supplied diff (GroupShelves, Ungrouped)
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/clipsapp/usePagedClips.ts — full: read whole file
- addons/knowledge/frontend/clipsapp/useShelfData.ts — partial: changed hunks in supplied diff
- addons/knowledge/frontend/library/LibraryList.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: changed hunks in supplied diff plus grep of layout/gate lines
- addons/knowledge/frontend/library/pane/NotePaneContainer.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/library/pane/useNoteData.ts — full: changed function shown whole in diff
- addons/knowledge/frontend/library/useNotesList.ts — partial: changed hunks in supplied diff (loadMore, first load)
- addons/knowledge/frontend/notesapp/ContinueWritingSection.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/notesapp/NotesWithSourcesSection.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunks in supplied diff
- addons/knowledge/frontend/pages/clips.tsx — partial: changed hunks in supplied diff plus grep of refresh wiring (lines 85-145)
- frontend/e2e-components/app-card-menu.spec.ts — full: new file in diff
- frontend/e2e-components/fixtures/app.tsx — partial: changed hunks in supplied diff
- frontend/e2e-components/fixtures/appCardMenu.tsx — full: new file in diff
- frontend/e2e-components/spec-viewport.spec.ts — partial: changed hunk plus lines 1-40
- frontend/src/components/FileContextMenu.tsx — full: read whole file
- frontend/src/components/appshell/CardFileMenu.tsx — full: new file, whole content in diff
- frontend/src/components/appshell/usePaged.ts — full: diff plus lines 55-135 read
- frontend/src/components/readingapp/DiscoverFace.tsx — full: read whole file
- frontend/src/components/readingapp/LibraryFace.tsx — partial: changed hunks in supplied diff
- frontend/src/components/readingapp/ReadingApp.tsx — partial: changed hunks in supplied diff
- frontend/src/components/readingapp/ReadingCard.tsx — partial: changed hunks in supplied diff
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: changed hunks in supplied diff
- frontend/src/components/readingapp/useReadingApp.ts — partial: changed hunks plus grep of params
- frontend/src/components/videoapp/DiscoverFace.tsx — partial: changed hunks in supplied diff
- frontend/src/components/videoapp/LibraryFace.tsx — partial: changed hunks in supplied diff
- frontend/src/components/videoapp/VideoApp.tsx — partial: changed hunks in supplied diff
- frontend/src/components/videoapp/VideoCard.tsx — partial: changed hunks in supplied diff
- frontend/src/components/videoapp/VideoPagedGrid.tsx — partial: changed hunks in supplied diff
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: changed hunks in supplied diff
- frontend/src/components/videoapp/useDiscover.ts — partial: diff hunk plus lines 180-630 read

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
- frontend/src/components/appshell/__tests__/usePaged.test.tsx — full: new file in diff
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

Note: Re-read overrides and per-list hides outlive list refetches for the whole scope (drive, Target, profile).; fetchAlignedPage overfetches on every later page after a removal (masked by dedupe).; The select-none and callout classes are applied unconditionally on LibraryList rows, ClipRow and NotesWithSources rows, whether or not a menu context is attached.
- claude-read: Re-read overrides and per-list hides outlive list refetches for the whole scope (drive, Target, profile).
- claude-read: fetchAlignedPage overfetches on every later page after a removal (masked by dedupe).
- claude-read: The select-none and callout classes are applied unconditionally on LibraryList rows, ClipRow and NotesWithSources rows, whether or not a menu context is attached.
- claude-verify: Whether a grouped Library emptied entirely through the menu must show its empty state is not stated explicitly; I3 names grids and Discover only.
- claude-verify: Whether a menu-trashed card that a Clips refresh retains in the held items (pages === 1) should be dropped from the hook's items is not stated.

### unspecified_behavior

Note: Whether a grouped Library emptied entirely through the menu must show its empty state is not stated explicitly; I3 names grids and Discover only.; Whether a menu-trashed card that a Clips refresh retains in the held items (pages === 1) should be dropped from the hook's items is not stated.
- claude-read: Re-read overrides and per-list hides outlive list refetches for the whole scope (drive, Target, profile).
- claude-read: fetchAlignedPage overfetches on every later page after a removal (masked by dedupe).
- claude-read: The select-none and callout classes are applied unconditionally on LibraryList rows, ClipRow and NotesWithSources rows, whether or not a menu context is attached.
- claude-verify: Whether a grouped Library emptied entirely through the menu must show its empty state is not stated explicitly; I3 names grids and Discover only.
- claude-verify: Whether a menu-trashed card that a Clips refresh retains in the held items (pages === 1) should be dropped from the hook's items is not stated.

## Findings

A: 1
B: 5
C: 0

### claude-read:R2-1 — bucket A, MEDIUM, open

Claim: After a Clips refresh, a drawn count is lowered a second time for a card already taken out through the menu. The server's count already excludes the card, and the hook keeps the card in its held items.
Impact: In normal use the user trashes a clip on Clips Home (or a one-page shelf page), then adds a clip on the same page, or a knowledge.clip.ready event arrives. The Unread count, or the shelf page's header count, then reads one less per trashed card than the cards drawn, for example 2 above three cards.
Evidence: addons/knowledge/frontend/clipsapp/usePagedClips.ts:89-123: when the shelf is capped or one page, `pages` is 1, so `unnamed` keeps every held item the fresh answer omits (`pages === 1 || saving`). That includes the menu-trashed id, because the menu never calls `remove`, so the id is not in goneIds. The same code sets `count: page.count`, the server count that already excludes the trashed file. clipsapp/Home.tsx CardShelf then draws `data.count - lists.removedCount(listKey, data.items)`, and removedCount still finds the trashed id in data.items, because PageFileMenu.tsx `trashed` lives for the whole scope. ShelfPage.tsx header count does the same: `data.count - lists.removedCount(listKey, data.items)`. pages/clips.tsx:88-109 bumps `refresh` on ClipSection onClipAdded and on the knowledge.clip.ready WebSocket event. The tests mock the socket and never add a clip after a trash.
Repro: not_reproduced. Steps from reading the code: Clips Home with Unread [c1,c2,v2], count 3. Trash c1 through the menu; the count reads 2. Add a clip n through the page's clip section, which calls refreshClips. Unread refetches page 1, server count 3 (n,c2,v2); held items become [n,c2,v2,c1]; filter draws n,c2,v2; the count shows 3 - removedCount = 2.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Subtract only for removed ids the server answer still counts, for example by recording the server count at the time of the removal. Alternatively, let a menu trash or history removal call the shelf's own `remove(id)`, so goneIds keeps the id out and the menu does not subtract it again.

</details>

### claude-read:R2-2 — bucket B, MEDIUM, open

Claim: The end-to-end check of the long-press callout can never fail. The assertion is skipped when the computed value is empty, and the component e2e config runs Chromium only, where `-webkit-touch-callout` always computes to empty.
Impact: A change that drops `[-webkit-touch-callout:none]` from VideoCard, ReadingCard or any knowledge card would pass CI. iOS users would then get the link preview on a long press instead of the menu. No real-browser check exists at all for the Notes and Clips cards.
Evidence: frontend/e2e-components/app-card-menu.spec.ts: `if (styles.callout !== "") expect(styles.callout).toBe("none");`. frontend/playwright-components.config.ts:31-45 defines only the projects `chromium` (Pixel 5) and `chromium-desktop`, with no WebKit project. Spec section 10 says the callout is measured in a WebKit browser in e2e. The fixture appCardMenu.tsx draws only VideoCard and ReadingCard.
Repro: Mutation reasoning: delete ` [-webkit-touch-callout:none]` from the fileMenu branch of VideoCard.tsx CardLink and ReadingCard.tsx. In Chromium getPropertyValue('-webkit-touch-callout') returns "", so the guarded expect is skipped and the test stays green. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a webkit project for app-card-menu.spec.ts and assert the callout unconditionally there. Also add Notes and Clips cards to the fixture.

</details>

### claude-read:R2-3 — bucket B, LOW, open

Claim: For the rest of the scope, a re-read snapshot in `overrides` replaces the item in every later server answer for that list, including a list refetched after a save.
Impact: The user renames or moves a note through the menu, then edits and saves it in the Notes Library pane. NotesLibrary's onSaved bumps `refresh` and the list refetches, but the row keeps drawing the re-read snapshot (for example the old updated time) until the Target, profile or drive changes. The same happens for Clips lists refreshed by a new clip.
Evidence: addons/knowledge/frontend/cardMenu/PageFileMenu.tsx `filter`: `const answer = livePage.overrides.get(item.id); out.push(answer === undefined ? item : mergeAnswer(item, answer))`. `overrides` is cleared only by freshPage(scope). NotesLibrary.tsx: `onSaved = useCallback(() => setRefresh((n) => n + 1), [])` feeds useNotesList, and the refetched rows go through `lists.filter("list", list.rows)`. The core CardFileMenu.tsx `filter` behaves the same way. The spec body says a list fetched from the server again shows what the server returns.
Repro: not_reproduced. Steps: Notes Library, menu-rename note A (re-read stored), then edit A in the pane and save. The list refetches, but row A still draws the snapshot's updated_at.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Apply an override only to the list data held when the re-read answered, for example by keying the override by the item object or by a list fetch generation, or drop it when a list delivers a newer item for that id.

</details>

### claude-read:R2-5 — bucket B, LOW, rejected

Claim: In this checkout, every I7 test and every Recommended file-menu ordering test is skipped, because the intelligence addon is not linked.
Impact: The provider-answer removal set, Recommended undo after a menu trash, and actions-then-divider ordering are not exercised unless the CI checkout links frontend/src/addons/intelligence. A regression there passes locally.
Evidence: Glob frontend/src/addons/intelligence/* returns no files. VideoApp.cardMenu.test.tsx, VideoApp.itemActions.test.tsx, VideoShelfPage.itemActions.test.tsx and VideoShelfPage.providerPaging.test.tsx guard these cases with `it.runIf(intelligenceLinked)`.
Repro: not_reproduced (tests not run); derived from the runIf guard and the empty directory.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Exercise I7 with a stub slotItemActions/slotProviders module that does not depend on the addon being linked, as the mocks already do.

</details>

### claude-read:R2-4 — bucket B, INFO, open

Claim: After a first realigned page, fetchAlignedPage keeps subtracting the already-aligned removed count for every later page. Each later request starts removedBefore items too early and can span two server pages; usePaged's dedupe hides the overlap.
Impact: There is no drawn defect, because withoutRepeats drops the overlap. A Library or See all list that lost cards sends an extra page request for later loads whenever the shifted start crosses a page boundary.
Evidence: frontend/src/components/appshell/CardFileMenu.tsx:66-78 computes `start = (page-1)*size - removedBefore` on every call, assuming the held list holds `(page-1)*size` items. After one aligned fetch, the held list holds `(page-1)*size + removedBefore` items (the aligned page returns size+removedBefore items), so the non-removed held count already equals (page-1)*size of the new server list. usePaged.ts:107-108 dedupes the repeats. LibraryFace (video and reading), VideoShelfPage and ReadingShelfPage use it.
Repro: Reasoning: size 60, trash 1 held item. Page 2 is aligned: start 59, pages 1-2, 61 items added, held 121. Page 3 then gets start 119 and asks pages 2 and 3, although page 3 alone (start 120) suffices. The repeat at 119 is dropped.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R2-6 — bucket B, INFO, open

Claim: When every grouped Library shelf (Video, Reading or Clips) has lost its cards through the menu, the Library body draws nothing at all. The empty-state check reads the unfiltered shelves.
Impact: After the last cards of a small grouped Library are trashed, the user sees a blank Library with no empty-state message until the next load.
Evidence: frontend/src/components/videoapp/LibraryFace.tsx: `shelves.phase === "ready" && shelves.items.length === 0` is checked on the unfiltered pages, while each VideoGroupShelf returns null when `lists.filter(...)` is empty. Reading LibraryFace (ReadingGroupShelf) and clipsapp/Library.tsx GroupShelves (`if (items.length === 0) return null`) have the same shape.
Repro: not_reproduced. Steps: grouped Video Library with one folder shelf of one video; trash it through the menu. The shelf disappears and no empty state is drawn.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any unit or e2e test; the mutation and repro reasoning comes from reading the code only.
- claude-read: Fix commit ed27392 is listed with no diff in the record, and I did not inspect it.
- claude-read: I did not confirm that the backend `by=all&ids=` re-read and the discover `restrict` exclude trashed files.
- claude-read: I did not confirm whether opening a note in the Notes Library pane writes watch history, which would make the persistent 'continue' hide visible.
- claude-read: I did not check whether CI links the intelligence addon.
- claude-read: For most modified product files I read only the supplied diff hunks, not the whole file.
- claude-verify: Did not run vitest, Playwright or any browser; all traces are by reading code.
- claude-verify: Did not observe Chromium's computed value of -webkit-touch-callout directly (R2-2 relies on Blink not supporting the property).
- claude-verify: Did not verify that the server's Clips shelf count and items exclude trashed files, though it is the expected behaviour.
- claude-verify: Did not confirm that the files in the worktree exactly match commit 498a426 (assumed HEAD is unmodified apart from the untracked review dir).
- claude-verify: Did not check Reading LibraryFace's grouped branch beyond lines 337-341 and 413-416.

TOTAL: 6 findings
