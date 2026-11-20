# The file menu on app cards

SPEC-ID: SPEC-CORE-157
SPEC-ID: SPEC-ADDON-164

Approval:

## Summary

The drive's home and the file list already open the core file menu (`FileContextMenu`) on
right-click or a long press. The apps do not: a Video card opens a menu only on
Recommended, and that menu holds only 「新しいタブで開く」 plus the addon's actions; a
Reading, Notes or Clips card opens the browser's own menu. This change gives every file
card and row in the four apps the same file menu, so the viewer can download, add to a
collection, copy, cut, copy the ID, rename, move or trash a file where they found it.

- **SPEC-CORE-157** (core): the Video and Reading apps (Discover shelves, Library grouped
  shelves and ungrouped grid, the See all / shelf pages), and the per-action callbacks on
  `FileContextMenu` the lists need. The Continue shelf adds 「続きから外す」 and
  「履歴から削除」 as Home's Continue row does. A Recommended card keeps its addon actions as
  the first rows, above a divider; this replaces design decision D2 of SPEC-CORE-150
  (`docs/process/reviews/feature-pickup-not-interested/design/`).
- **SPEC-ADDON-164** (knowledge addon): the Notes app (Home's three sections and the
  Library list) and the Clips app (Home shelves, the unverified rows, Library shelves and
  grid, shelf pages). Notes' Continue writing and Clips' Recently opened are history
  lists, not the Continue desk, so they add only 「履歴から削除」.

After a menu action the page changes in place: a trashed file leaves every list on the
page; a set-aside or history-removed card leaves the history list it was in; a renamed or
moved file is redrawn wherever it is shown. Nothing else on the page moves or reloads.

No new screen and no new component is drawn: the menu, its dialogs and the cards are
the existing ones, so there is no design canvas.

## Required items

### 1. Normal flow

**Opening the menu (both SPEC-IDs).** On a file card or row:

1. A pointer right-click opens the file menu at the pointer; the browser's own menu does
   not open. Opening the menu sends no request.
2. On touch, a press held 500 ms without moving opens it at the press point; moving the
   finger before then cancels it (so a sideways shelf still scrolls). The click that ends
   a press that opened the menu does not open the file.
3. A plain click or a short tap opens the file as today (Notes Library: shows it in the
   pane, as today).
4. A right-click on another file card while a menu is open moves the menu to that card
   (as on Home's shelves and in `docs/user-guide/overview.md`). At most one menu is open on
   the page.

**The rows.** Every menu is `FileContextMenu` with the card's file as its target and
`onOpenInNewTab` (opens the card's own link in a new tab). Its rows are therefore, in the
core's order: 新しいタブで開く, ダウンロード, コレクションに追加, コピー, 切り取り,
IDをコピー, 名前を変更 (the dialog; no card offers inline rename), 移動 (the dialog),
then the history rows below where they apply, then ゴミ箱に移動 (the confirm dialog).
「編集」 is never offered.

History rows, only with a profile:

| List | 続きから外す | 履歴から削除 |
|---|---|---|
| Video and Reading: Discover's Continue shelf, and the See all page for `by=watch&key=continue` | yes | yes |
| Notes: Continue writing | no | yes |
| Clips: Recently opened (Home shelf and its shelf page) | no | yes |
| every other list | no | no |

**Recommended (SPEC-CORE-157).** A Recommended card (Discover and its See all page) whose
entry has valid item actions, with a profile, shows those actions as the first rows, then
one divider, then the rows above. The actions behave exactly as today (pending state,
toast, 元に戻す, removal and restore of the card, the visit's removal set).

**`FileContextMenu` callbacks (SPEC-CORE-157).** `FileContextMenu` gains three optional
props, called once each after the matching request succeeds and before `onUpdate`:
`onTrashed(file)`, `onRenamed(file)`, `onMoved(file)`. A caller that passes none behaves as
today. The addon depends on them, so the core PR lands first.

**After an action.**

| Action succeeded | What the page does |
|---|---|
| ゴミ箱に移動 | Every card for that file id on the page leaves its list. |
| 続きから外す | The card leaves that Continue list; copies in other lists stay. |
| 履歴から削除 | The card leaves that history list (Continue shelf, Continue writing, Recently opened); copies in other lists stay. |
| 名前を変更, 移動 | Every card for that file id stays at its position; the file is read again by id and each draws what the server now returns. |
| every other row | Nothing on the page changes. |

"Leaves" means: removed from that list in place; every other card keeps its relative
order; no loading state or skeleton is drawn; a list that becomes empty is drawn as it is
drawn when empty today (a shelf disappears, a grid shows its empty state). A grouped
Library shelf's shown count drops by one for each card that leaves it, and the shelf
disappears when its last drawn card leaves.

The removal holds as long as the list data it was made on is held: switching
Discover → Library → Discover, or to a See all page and back, does not draw the card
again. A list that is fetched from the server again shows what the server returns. On
Video's Discover the id also joins the provider-answer removal set of every cache key on
the page (SPEC-CORE-150's store), so a provider answer stored later in the JS session does
not bring it back. A menu removal offers no 元に戻す.

**Paging after a change.** In a list paged by page number or offset (Video and Reading
Library grids and their See all pages, the Clips paged lists), pages loaded after a
removal neither skip nor repeat a file compared with a fresh load. In every paged list, a
later page never draws an id the list already holds.

**The re-read.** After rename or move, the caller asks
`getShelves(drive, { by: "all", ids: [id] })` with no Target filter and no `watch` or
`opened` (both apps and the addon use this one call; the addon already uses `getShelves`).
An item returned for the id replaces the drawn item for that id, keeping the drawn
`watch_progress` and `watched_ranges` when the answer has none. Overlapping re-reads for
one id: only the answer to the latest request is applied.

**Notes Library pane (SPEC-ADDON-164).** Renaming or moving the note shown in the pane
leaves it shown, with any unsaved edit kept. Trashing the note shown in the pane closes the
pane (the URL's `note` is removed with `replace`), without the unsaved-changes prompt: the
viewer has just confirmed discarding that note. No save request is sent for it afterwards.

### 2. Failure cases

- Rename, move or trash fails: the dialog stays open (today's `FileContextMenu`
  behavior); the page does not change.
- 続きから外す fails: the card stays and the `couldNotRemoveFromContinue` error toast is
  shown, as on Home.
- 履歴から削除 fails: the card stays; the menu closes; no toast (today's behavior).
- The re-read after rename or move fails, or returns no item for the id: the cards keep
  what they drew before; no toast. The next load of the list shows the truth.
- A Recommended action fails: as today (SPEC-CORE-150).
- The profile, drive or Target changes, or the Discover visit ends, while an action or a
  re-read is in flight: the action completes against the file; the page change is applied
  only to lists still shown for the same drive, Target and visit.

### 3. States

Per card: closed → menu open (right-click / long press) → closed (a row chosen, Escape, a
click outside, or the menu moved to another card). A chosen row may open a dialog (rename,
move, trash confirm, collection picker, copy ID), which closes on success or cancel. After
success the card is present (rename, move, other rows) or gone (trash, set aside, history
removal). A re-read may be pending for a present card; it changes nothing until it
answers.

Not allowed: a Recommended action row while that action is pending on the card (disabled,
as today); 続きから外す or 履歴から削除 on a card whose own dismiss or history removal is
still in flight (the card's menu shows those rows disabled until it answers).

### 4. Data read and written

No new table, column or endpoint. Through existing endpoints:

- Written: file name and folder (`renameFile`, `moveFile`), trash (`deleteFile`),
  collections (`CollectionPicker`), `watch_history.dismissed_at`
  (`POST /api/files/{id}/progress/dismiss`), the viewer's history row
  (`deleteWatchProgress`, `DELETE /api/files/{id}/progress`). The clipboard store and the
  browser clipboard.
- Read: the re-read, `GET /api/drives/{drive}/shelves?by=all&ids=<id>`.
- In memory: each list's held items and removals; Video Discover's provider-answer
  removal set (`discoverCache.ts`).

### 5. External services

None. Every call is to the core's own API.

### 6. Authorization

Unchanged. Each row calls the endpoint it calls from the file list; the backend checks
drive access there. A locked drive's cards are never drawn. 続きから外す and 履歴から削除
need a profile and are not offered without one.

### 7. Effect on existing features

- `FileContextMenu`: three new optional callbacks; callers that pass none (Home, the file
  list, Inbox, the folder tree, search, the channel view) render and behave as today.
  `useFileMenuItems`, `ContextMenu`, `useContextMenu` are used unchanged.
- `VideoCard`: gains an opt-in way to attach the file menu. Used without it, it renders
  and behaves as today, so SPEC-ADDON-163's channel view (which wraps `VideoCard` in the
  addon) is unaffected and never gets two menus.
- Recommended's menu grows from 「新しいタブで開く」 + actions to actions + divider + the
  file menu (revises SPEC-CORE-150 I7, replaces its design D2).
- Discover's drawn positions can now also decrease when the last card of Continue, New or
  an addon shelf leaves through the menu (revises SPEC-CORE-076 I1). The removal set also
  holds ids removed through the menu (revises SPEC-CORE-076 I7).
- Home's Continue row is no longer the only place offering 続きから外す (revises
  SPEC-CORE-069 I9 as last revised by `docs/specs/home-app-entries.md`).
- Home, the file list, trash, missing and the search results are untouched.

### 8. Error behavior

As in section 2. Toasts are the existing ones (`couldNotRemoveFromContinue`,
`common.saveFailed` for Recommended actions). Nothing new is logged.

### 9. User-visible behavior

- Right-click / long press on any file card or row in Video, Reading, Notes and Clips opens
  the file menu described above, in the UI locale, with the existing labels and icons.
- A long press shows neither the platform's link preview nor a text selection
  (`-webkit-touch-callout: none` and `user-select: none` on the card).
- The Clips unverified row: the menu opens from the cover and the title; the
  「確認済みにする」 button keeps its own click and does not open the menu.
- Nothing that is not a single file opens the file menu: shelf headers, See all links,
  folder chips, the Notes rail, tabs, filter menus, skeletons.
- `docs/user-guide/comments-history.md` says where 続きから外す and 履歴から削除 are offered;
  it gains the apps.

### 10. Non-functional

- No request when a menu opens. One extra request per successful rename or move.
- Cards in a sideways-scrolling shelf scroll as before: a moving finger never opens the
  menu.
- iOS on a device is `agent_cannot_verify`; the long press and callout are checked in a
  WebKit browser at R-5.

## Touch points

Core (SPEC-CORE-157):

- `frontend/src/components/FileContextMenu.tsx` (the three optional callbacks).
- `frontend/src/components/videoapp/VideoCard.tsx`, `DiscoverFace.tsx`, `LibraryFace.tsx`,
  `VideoPagedGrid.tsx`, `VideoShelfPage.tsx`, `useProviderShelfPage.ts`,
  `useRemovableItems.ts`, `discoverCache.ts`, `useDiscover.ts`, `useVideoApp.ts`.
- `frontend/src/components/readingapp/ReadingCard.tsx`, `DiscoverFace.tsx`,
  `LibraryFace.tsx`, `ReadingGrid.tsx`, `ReadingShelfPage.tsx`, `useDiscover.ts`,
  `useReadingApp.ts`.
- `frontend/src/components/appshell/ShelfBlock.tsx`, `usePaged.ts`.
- Used unchanged: `ContextMenu.tsx`, `hooks/useContextMenu.ts`, `hooks/useFileMenuItems.ts`,
  `lib/api.ts` (`getShelves`, `dismissContinueItem`, `deleteWatchProgress`).
- Docs: `docs/user-guide/keyboard-shortcuts.md` (the Recommended sentence and the
  right-click rows), `docs/user-guide/video.md`, `docs/user-guide/reading.md`,
  `docs/user-guide/comments-history.md`, `docs/ADDON-DEVELOPMENT.md` (the new optional
  `FileContextMenu` props, if it lists the component's props).
- Rules passed through: `.claude/rules/frontend-conventions.md` (`DESIGN.md`, i18n),
  `.claude/rules/design-decisions.md` (watch history: removal only on an explicit user
  action).

Knowledge addon (SPEC-ADDON-164), in `addons/knowledge/frontend/` at the commit the core
pins:

- Notes: `ContinueCard.tsx`, `notesapp/ContinueWritingSection.tsx`,
  `notesapp/NotesWithSourcesSection.tsx`, `notesapp/useNotesWithSources.ts`,
  `NoteRow.tsx`, `notesapp/RecentlyUpdatedSection.tsx`, `library/LibraryList.tsx`,
  `library/NotesLibrary.tsx`, `library/useNotesList.ts`.
- Clips: `clipsapp/ClipCard.tsx`, `clipsapp/CoverShelf.tsx`, `clipsapp/ClipShelfBlock.tsx`,
  `clipsapp/ClipRow.tsx`, `clipsapp/Home.tsx`, `clipsapp/Library.tsx`,
  `clipsapp/ShelfPage.tsx`, `clipsapp/useShelfData.ts`, `clipsapp/useGroupedShelves.ts`,
  `clipsapp/usePagedClips.ts`, `pages/clips.tsx`.
- Docs: `docs/user-guide/notes.md`, `docs/addons/knowledge.md` (core repo).

Landing order: core PR (SPEC-CORE-157) → knowledge PR (SPEC-ADDON-164) → core pointer bump.
Implementation starts after the app Library name filter (core `feature/app-library-name-filter`
and its knowledge change) has merged, on top of it: both edit the Video and Reading
`LibraryFace.tsx`, `VideoShelfPage.tsx`, `ReadingShelfPage.tsx` and the Clips Library. "A
fresh load" in I4 is a fresh load with the same name filter in force.

No protected path, table, endpoint, event or Internal API is touched.

## Invariants

I1. In Video, Reading, Notes and Clips, a right-click on a file card or row opens a menu whose rows, in order, are exactly: the Recommended actions and one divider (Recommended cards with a profile and valid actions only), 新しいタブで開く, ダウンロード, コレクションに追加, コピー, 切り取り, IDをコピー, 名前を変更, 移動, 続きから外す (Video and Reading Continue only, with a profile), 履歴から削除 (Video and Reading Continue, Notes Continue writing, Clips Recently opened, with a profile), ゴミ箱に移動; the browser's own menu does not open, opening it sends no request, at most one menu is open on the page, and no element that is not a single file (nor the Clips 「確認済みにする」 button) opens it.
I2. A 500 ms touch press without movement opens the same menu and the click that follows does not navigate (Notes Library: does not change the pane); a press with movement, a short tap and a plain click behave exactly as before this change; the card's computed `-webkit-touch-callout` is `none` and `user-select` is `none`.
I3. After a successful ゴミ箱に移動 every card for that id on the page leaves its list, and after a successful 続きから外す or 履歴から削除 only the card's own history list loses it; every other card keeps its relative order, no loading state or skeleton is drawn, a grouped shelf's count drops by one per card that leaves it, and the card is not drawn again while that list's data is held (including Discover → Library → Discover and back from a See all page).
I4. In a list paged by page number or offset, pages loaded after a removal neither skip nor repeat a file compared with a fresh load; in every paged list, a page never draws an id the list already holds.
I5. After a successful 名前を変更 or 移動 every card for that id stays at its position and, once the latest re-read (`by=all`, `ids=[id]`, no Target filter) answers with the item, draws it; an older re-read's answer, a failed or empty re-read change nothing and show no toast; no other row changes the page.
I6. A failed rename, move, trash, set-aside or history removal leaves the page unchanged; a failed 続きから外す shows `couldNotRemoveFromContinue`, a failed 履歴から削除 closes the menu with no toast.
I7. On Video's Discover an id that left through the menu is absent from every provider answer stored later under any of the page's cache keys in the JS session; a menu removal offers no 元に戻す, and a Recommended action keeps its pending state, undo and removal set exactly as SPEC-CORE-150 states.
I8. `VideoCard` and `FileContextMenu` used without the new opt-in or callbacks, and `useFileMenuItems`, `ContextMenu` and `useContextMenu`, render the same DOM and behave as before; the media_import channel view (SPEC-ADDON-163) opens exactly one menu per right-click.
I9. A page change after an action or re-read is applied only to lists still shown for the same drive, Target and (on Discover) visit; an answer arriving after a profile, drive or Target change changes nothing.
I10. In the Notes Library, trashing the note shown in the pane closes the pane by replacing the URL without `note`, shows no unsaved-changes prompt and sends no save for that note afterwards; renaming or moving it keeps it shown and keeps an unsaved edit. 続きから外す writes only through `POST /api/files/{id}/progress/dismiss` and 履歴から削除 only through `DELETE /api/files/{id}/progress`, each only on the viewer's choice in the menu.

## Revises

SPEC-CORE-150 I7. On a Recommended card whose entry has item actions, with a profile, right-click and a 500 ms long press open a menu whose first rows are the valid actions, then one divider, then the file menu of SPEC-CORE-157 (新しいタブで開く opening the card's own link, through ゴミ箱に移動), and do not navigate (also not on the click after the long press); a click or short tap navigates; an element without a string `id` and `label` or a function `run`, or with a repeated `id`, is dropped on its own, and a missing, throwing or non-array `slotItemActions` gives no actions; a card without valid actions or without a profile opens the file menu without action rows or divider.
SPEC-CORE-076 I1. Within a visit, the number of drawn positions never decreases, except that a position goes when its last card is removed through an item action (SPEC-CORE-150) or through the file menu (SPEC-CORE-157), and Recommended's comes back when an item action is undone in the same visit; Retry on Continue or New does not change it.
SPEC-CORE-076 I7. A provider's resolved items (ids, with the byline of each when a page provider gave one) are stored under the key it was asked with, also when they arrive after the deadline, after the visit inputs changed or after `VideoApp` unmounted, minus any id in that key's removal set (ids removed under that key in the JS session through an item action and not undone, SPEC-CORE-150, or through the file menu on the page that key was drawn on, SPEC-CORE-157); a lookup never returns an entry stored under a different drive, target, slot, local date, nickname or entry list (Recommended) or entry and UI locale (addon shelf); a rejection or an absent provider writes nothing and leaves an existing entry in place.
SPEC-CORE-069 I9. Home's Continue row is headed 続きから / Continue and requests `filter=continue`; among Home's rows only its card menu offers 続きから外す / Remove from Continue, directly above Remove from history, and outside Home the Video and Reading apps' Continue shelves offer it too (SPEC-CORE-157); what a dismiss does to Home's rows is I8 of `docs/specs/home-app-entries.md`; Remove from history still removes the card from both rows.

## Checked, no action

- **Moving a file out of the list's scope.** A file moved out of a folder-scoped Target, or
  into another folder group of a grouped Library, stays where it was drawn until the list is
  next loaded. Re-sorting or regrouping in place would move cards under the pointer.
- **Paging with an opaque cursor or by shelf.** Provider See all pages page through the
  addon's cursor, and grouped Libraries page whole shelves by offset. After a removal the
  core cannot correct either, so a later page may skip a file (cursor) or a shelf (when a
  whole shelf emptied). They still never repeat an id (I4).
- **Counts outside grouped shelves.** The Notes rail's folder and tag counts, a page
  header's total and the Target menu's counts keep their value until the next load.
- **Inline rename on cards.** Cards have no inline name editor; 名前を変更 opens the dialog,
  as on Home's shelves.
- **元に戻す for trash.** The file menu's trash has no undo anywhere; the trash page restores.
- **Notes Connections links, intelligence Ask / Find results.** Their items are not
  `FileItem`s (`RelatedFileSummary`, `NoteSource`, `FindResultEntry`), and they are search
  results or note details, not app lists.
- **media_import channel view.** Already has the file menu (SPEC-ADDON-163).
- **Photo Diary.** It is being reworked to match the other apps in parallel; its cards get
  the file menu in a spec of their own once that rework has landed.
- **Multiple selection in apps.** Out of scope; one card at a time.
- **Design canvas.** No new visual: the cards, `ContextMenu` and its dialogs are existing
  components. The one agreed design this contradicts, SPEC-CORE-150 D2 (Recommended's menu
  of 新しいタブで開く + actions only), is replaced by this spec at the human's choice.
- **Desktop text selection on card titles.** `user-select: none` on the card stops
  selecting a title with the mouse, as on the channel view; the menu's コピー and
  IDをコピー cover the use.
- **Closing the menu on scroll.** Today's menus do not close on scroll; unchanged.
- **Home, file list, trash, missing, search.** Already have their menus; unchanged.
- **Phone without a profile.** The file rows need no profile and are offered; only the
  history rows and Recommended actions need one.
