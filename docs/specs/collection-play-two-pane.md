# Collection playback in the two-pane file page

SPEC-ID: SPEC-CORE-190
SPEC-ID: SPEC-CORE-191
SPEC-ID: SPEC-CORE-192
SPEC-ID: SPEC-CORE-193

Approval:

## Summary

Playing a collection, a Smart Collection or a folder opens a separate page today,
`/files/{id}` with `?collection=`, `?playlist=`, `?smart_collection=` or `?folder_play=1`
(`FileDetailFullScreen`, the "collection surface"). It has none of the file page's recent
work: no inspector, a vertical stack of player, panels, information and a queue card. Earlier
specs left it out on purpose. This change retires that page. A queue becomes the left pane of
the ordinary two-pane file page, and the file is drawn by the same `RightPaneFile` and
`FileDetailShell` as any other file:

- SPEC-CORE-190: on a collection's page, the item list in the left pane is the queue. A
  file opened from it advances to the next playable item when it ends. The pane carries the
  loop switch and the position. The previous and next controls walk the collection.
- SPEC-CORE-191: folder playback and Smart Collection playback show their queue in the
  left pane in place of the folder tree, until the queue is closed or a file outside it is
  opened.
- SPEC-CORE-192: the legacy `/files/{id}` queue URLs redirect to these pages, and the
  collection surface, its layout and every branch that exists only for it are removed.
- SPEC-CORE-193: on a phone, with a file open, the pane button opens the queue at full
  width over the file page, and choosing a row closes it.

It is for the owner, who plays collections and folders and gets two different file pages
depending on how a file was reached.

Agreed design: https://claude.ai/artifact/AGk6sEgbnzY5re6k7ASoVa, saved in
`docs/process/reviews/feature-collection-play-two-pane/design/`. Its visible decisions:

- D1 (`Main.dc.html`, 1440px). Regions, left to right: queue pane 280px wide, then the file
  page: page row, player column, inspector. The queue pane's top block holds the queue name
  (for a collection, a link to the collection's list), the position `n / N` under it, and the
  loop button at its right. Below are rows. Each row has its 1-based ordinal, a thumbnail, the
  title, and the duration under the title. On a collection each row also has move up, move
  down and remove buttons, always visible. The current row has the accent tint and a 1px
  accent ring, and its ordinal is in accent and bold.
- D2 (`Main.dc.html`). The page row's previous / next controls and their `n / N` count the
  queue, not the folder. On a collection the breadcrumb is drive / collection name / file
  title.
- D3 (`Narrow.dc.html`, 1024px). Where the inspector does not fit beside the pane, the
  queue pane yields as the folder tree does (SPEC-CORE-082), and the page row still has the
  queue's previous / next.
- D4 (`FolderPlay.dc.html`). Folder or Smart Collection playback: the same pane in place
  of the tree. Its top block has the folder's or the Smart Collection's name, `n / N`, the
  loop button and a close button (×). Rows have the ordinal, title and duration, and no
  reorder or remove buttons.
- D5 (`Phone.dc.html`, 390px). Playing: the header has the pane button and the previous /
  next controls. The file page is the usual phone layout.
- D6 (`PhoneQueue.dc.html`, 390px). The pane button opens the queue at full width with a
  close row on top. Rows are at least 44px tall, and so are the loop and per-row buttons.

## Required items

### 1. Normal flow

**Collection (SPEC-CORE-190).**

1. The viewer opens `/drive/{drive}/collections/{id}`. The left pane lists the items; the
   right pane shows the collection's grid or list (unchanged).
2. **Play** (shown when an item is a video or audio file) selects the first video or audio
   item with `?file=` on the same page, and that file starts playing without a further
   press. Choosing a row in the pane, or a card in the grid or list, selects that file the
   same way. Such a file starts playing only when the viewer's existing **Autoplay**
   preference (`video-share-autoplay`) is on.
3. The right pane draws the file with `RightPaneFile`, exactly as on a folder page:
   inspector, workbench, page row.
4. When a video or audio file reaches its end, the playback position is recorded as
   today. The page then selects the next item after it in the collection's order whose file
   is a video or audio file and is neither missing nor in the trash. That file starts
   playing. With loop on, the search continues from the first item after the last. With
   loop off and nothing after it, the page stays on the ended file.
5. The previous / next controls in the page row (`FileNavControls`) and the keyboard file
   navigation that already drives them move to the item before or after the current one in
   the collection's order, any file type. `n / N` is the item's position among the
   collection's items.
6. Reordering or removing an item in the pane takes effect in the queue at once. The
   next advance uses the new order. Removing the current item leaves its file open; the next
   advance then starts from the position the item had.

**Folder and Smart Collection (SPEC-CORE-191).**

1. A folder's **Play all** selects its first video or audio file on the folder's own page,
   `/drive/{drive}/{folder}?file={id}&queue=folder`, with the folder's sort and order when
   they are not random, as today. A Smart Collection's **Play** evaluates and stores the
   queue as today (`storeSmartQueue`), then selects its first file on the drive's root page,
   `/drive/{drive}?file={id}&queue=smart:{smartId}`.
2. While `queue=` is in the URL, the left pane holds the queue (D4) instead of the folder
   tree. The folder queue is the folder's video and audio files in the URL's sort and order,
   fetched as `CollectionPanel` fetches them today. The Smart Collection queue is the stored
   queue, or one evaluation when nothing is stored (`loadSmartQueue`).
3. The file starts playing. Ending, advancing, loop, previous and next behave as for a
   collection (steps 4 and 5 above), over the queue's files.
4. The close button removes `queue=` from the URL. The left pane returns to the tree and
   the open file stays open and keeps playing. Selecting a file that is not in the queue
   (from the tree, a listing, search, a link) also removes `queue=`.

**Legacy URLs (SPEC-CORE-192).**

1. `/files/{id}?collection={c}` and `?playlist={c}` redirect (307) to
   `/drive/{drive}/collections/{c}?file={id}`.
2. `/files/{id}?smart_collection={s}` redirects to
   `/drive/{drive}?file={id}&queue=smart:{s}`.
3. `/files/{id}?folder_play=1` redirects to
   `/drive/{drive}/{folder}?file={id}&queue=folder`, keeping `sort` and `order`.
4. Each redirect keeps `t`, `page`, `section` and `highlight`, and drops `nav`. `{drive}`
   and `{folder}` are the file's, read from `GET /api/files/{id}` as the route does today for
   its canonical redirect.

**Phone (SPEC-CORE-193).** Below `md` with a file open and a queue present, the header's
pane button opens the queue pane at full width (D6). Playback continues underneath.
Choosing a row selects that file and closes the pane. The close row closes it without
changing the file.

### 2. Failure cases

- The collection fails to load: the page's not-found view, as today.
- The folder queue fetch fails: the pane shows the tree, `queue=` stays in the URL, and the
  open file plays with no advance. This is today's "no tracks, no panel" behaviour, moved
  to the pane.
- The Smart Collection queue cannot be evaluated or is incomplete: the pane shows one line
  (`queueFailed`, existing text) where the rows would be. Previous and next are disabled.
  The failure is remembered for the tab per Smart Collection, as `failedSmartQueues` does
  today.
- The open file is not in the queue (it was removed elsewhere, or the URL was edited):
  no row is current, `n / N` shows `– / N`, and on end nothing advances.
- The next queued file fails to load: the right pane's existing not-found state. The
  queue does not skip past it on its own.
- A legacy URL names a file that does not exist or is locked: 404, as the route does
  today.
- A reorder or remove request fails: the existing toast and reload of the collection.

### 3. States

The left pane on a page under `/drive/{drive}`:

| State | Pane shows | Entered by | Left by |
|---|---|---|---|
| Tree | folder tree | default | `queue=` added |
| Collection queue | the collection's items as a queue | being on a collection page | leaving the page |
| Folder queue | folder queue | `queue=folder` | close, or selecting a file outside it |
| Smart queue (loading / failed / ready) | smart queue | `queue=smart:{id}` | close, or selecting a file outside it |

Visibility (open, yielded, hidden by the tree setting, phone overlay) is the existing
tree-pane state and applies to every row of the table unchanged, apart from the phone rule
of SPEC-CORE-193.

Loop is one boolean per browser (`collection-loop` in localStorage, as today), shared by
every queue.

### 4. Data read and written

- Read: `GET /api/drives/{drive}/collections/{id}` (collection items), `GET
  /api/drives/{drive}/files` (folder queue), the Smart Collection evaluation (unchanged),
  `GET /api/files/{id}` (legacy redirect, the right pane).
- Written: `PUT …/collections/{id}/reorder` and `DELETE …/items/{itemId}`, as today, from
  the pane only. Watch progress is written by the players as today
  (`POST /api/files/{id}/progress`). Playback completion records the final position and
  never deletes the record.
- Browser storage: `collection-loop` (localStorage, read and written),
  `smart-queue:<drive>:<id>` (sessionStorage, read and written as today),
  `video-share-autoplay` (read only).
- No table, column, endpoint or event is added or changed.

### 5. External services

None. Everything is the core backend over the existing APIs.

### 6. Authorization

Unchanged. Every request goes through the existing drive access checks. A locked drive's
collection or file is 404 before and after the redirect.

### 7. Effect on existing features

- Every caller of the collection surface moves: `CollectionDetail` Play,
  `FolderBrowser` Play all, `SmartFolderSaveButton` Play. `FileDetailFullScreen`,
  `CollectionPanel`, `SmartQueuePanel`, `CollectionPlayerCanvas`, the `"collection"` value of
  `FileDetailSurface` and the branches that exist only for it are removed. The branches
  are: `ridesFileDetailShell`'s surface test, `FileDetailSkeleton`'s non-canonical branch,
  `FileDetailContainer`'s surface checks for the intelligence entry and `hasInspector`, the
  collection-only `chapters` panel in `panels.tsx`, `ArchivePreview`'s collection height, the
  `data-collection-workbench` rule in `globals.css`, and `window.__collectionOnEnded`. On
  every playback page the chapters appear where they do on the file page (the inspector),
  and the detailed summary and in-file jumps behave as on the file page.
- `useSelectedFile.selectFile` keeps `queue=` only when the selected file is in the
  current queue.
- `FileNavControls` and the keyboard file navigation read a queue-ordered source on a
  queue page and `/neighbors` elsewhere. The Inbox walk (`nav=inbox`) is unchanged.
- The mini player, focus mode, find in file, the workbench and the split layout apply on
  queue pages as on any file page.
- Addon slots: `collection-actions` is unchanged. `player-side`, `file-preview-actions`,
  `file-detail-sections` and `document-side` entries now render where the file page renders
  them, also during playback. The extension-point contract does not change (no slot, prop or
  name is added or removed).
- The iOS app opens the web UI. It has no link to `/files/{id}?collection=`
  (checked: no hit under `ios/`).
- `mcp-server/` builds no playback URL (checked).

### 8. Error behavior

As in §2. No new message text except the pane's close label and the queue pane's
accessible name. No logging is added.

### 9. User-visible behavior

- Playback from a collection, a folder or a Smart Collection stays on a two-pane page
  (D1–D6). There is no separate centred playback page.
- On a collection page, any video or audio file opened from the collection advances to
  the next playable item when it ends, whether it was opened with **Play** or from a row or
  card.
- Advance skips items that are not video or audio, and items that are missing or in the
  trash.
- The collection's previous / next and `n / N` follow the collection, not the file's
  folder.
- The breadcrumb on a collection page names the collection (D2), and the collection name
  links back to the collection's list (clears `?file=`).
- Loop keeps its current meaning and storage.
- New text: `queueClose` ("Close the queue" / "キューを閉じる") and `queueLabel` ("Queue" /
  "キュー"). Existing `playback.*` strings are reused for the position and loop.
- Old bookmarks with `?collection=`, `?playlist=`, `?smart_collection=` or `?folder_play=1`
  land on the new pages.
- User docs: `docs/user-guide/playlists-favorites.md` ("Playing a collection"),
  `docs/user-guide/search.md` (Smart Collection Play), `docs/user-guide/tags-and-relations.md`
  (the "below the player" sentence).

### 10. Non-functional

- The folder queue keeps today's 500-per-page fetch and has no new cap. The Smart queue
  keeps its existing caps.
- The queue rows are not virtualised. A collection of a few hundred items renders as the
  item pane does today.
- No new request per advance beyond loading the next file.

## Touch points

- `frontend/src/app/files/[id]/page.tsx`
- `frontend/src/components/FileDetailFullScreen.tsx` (removed)
- `frontend/src/components/CollectionPanel.tsx` (removed; the loop storage and the folder
  fetch move to a queue module)
- `frontend/src/components/CollectionItemsPane.tsx`
- `frontend/src/components/CollectionDetail.tsx`
- `frontend/src/components/folder/TwoPaneLayout.tsx`
- `frontend/src/components/folder/RightPaneFile.tsx`
- `frontend/src/app/drive/[name]/layout.tsx`
- `frontend/src/hooks/useSelectedFile.ts`
- `frontend/src/hooks/useFileNav.ts`
- `frontend/src/lib/fileNavContext.tsx`
- `frontend/src/components/FileDetail/FileNavControls.tsx`
- `frontend/src/components/FolderBrowser.tsx`
- `frontend/src/components/SmartFolderSaveButton.tsx`
- `frontend/src/lib/smartQueue.ts`
- `frontend/src/lib/fileDetailShell.ts`
- `frontend/src/components/FileDetail/FileDetailPresenter.tsx`
- `frontend/src/components/FileDetail/FileDetailContainer.tsx`
- `frontend/src/components/FileDetail/FileDetailSkeleton.tsx`
- `frontend/src/components/FileDetail/FileDetailChrome.tsx`
- `frontend/src/components/FileDetail/workbench/panels.tsx`
- `frontend/src/components/ArchivePreview.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/messages-core/en.json`, `frontend/src/messages-core/ja.json`
- New: a queue module under `frontend/src/components/queue/` (pane, queue sources, the
  ended → next rule)
- Tests that exist only for the removed surface are removed with it:
  `frontend/src/components/__tests__/FileDetailFullScreen.test.tsx`,
  `FileDetailFullScreen.smartCollection.test.tsx`, `FileDetailFullScreen.inboxNav.test.tsx`,
  `FileDetailFullScreen.headerRow.test.tsx`, `CollectionPanel.test.tsx`,
  `frontend/src/components/FileDetail/__tests__/WorkbenchCollection.test.tsx`,
  `frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts`. The collection cases inside
  `frontend/src/app/files/[id]/__tests__/page.test.tsx`,
  `page.smartCollection.test.tsx`, `FileDetailPageRow.test.tsx`, `FileDetailCanvas.test.tsx`,
  `FindInFile.test.tsx`, `InspectorTabsSlot.test.tsx`, `LoftMetadataPlacement.test.tsx`,
  `WorkbenchRowBeside.test.tsx`, `WorkbenchPlayerFocus.test.tsx`,
  `FileDetailContent.test.tsx`, `SearchPage.smartCollectionPlay.test.tsx`,
  `frontend/src/lib/__tests__/fileDetailShell.test.ts` and
  `frontend/src/__tests__/section-rows.test.tsx` are rewritten to the new page or removed
  where they test the removed surface only.
- e2e fixtures that draw the collection surface: `frontend/e2e-components/fixtures/focusMode.tsx`,
  `fileHeaderRow.tsx`, `inspectorResponsive.tsx`, and
  `frontend/e2e-layout/no-horizontal-scroll.spec.ts`, `frontend/e2e-layout/no-horizontal-scroll-states.spec.ts` with
  `frontend/e2e-layout/fixtures/no-horizontal-scroll.html`, plus
  `frontend/src/components/__tests__/noHorizontalScrollFixtureParity.test.tsx`.
- `docs/user-guide/playlists-favorites.md`, `docs/user-guide/search.md`,
  `docs/user-guide/tags-and-relations.md`
- `DESIGN.md` (the left pane: a queue may take the tree's place)
- `docs/process/reviews/feature-collection-play-two-pane/design/`
- Rules passed through: `.claude/rules/design-decisions.md` (watch history: completion
  records the final position, never deletes; SPA navigation), `.claude/rules/frontend-conventions.md`,
  `DESIGN.md`.

No protected path is edited.

## Invariants

I1. On a queue page, when a video or audio file ends with a finite positive duration, its
watch record holds `position = currentTime` and `duration = duration` after the end. No
playback-completion path calls `deleteWatchProgress` or `clearProgress`.

I2. After a file ends on a queue page, the selected file is the first item after the
ended one, in the queue's order, whose file is a video or audio file with `deleted_at` and
`missing_since` both null. With loop on, the search continues from the start of the queue
after its end and stops at the ended item. When no item qualifies, the selected file does
not change.

I3. On a collection page, previous / next select the item immediately before / after the
open file's item in the collection's order, and the shown `n / N` is that item's 1-based
position and the collection's item count. They never select a file outside the
collection.

I4. A reorder or removal in the queue pane changes which file the next advance selects
without a reload. Advancing after a reorder follows the new order.

I5. `queue=` is present in the URL only while the selected file is in that queue: selecting
a file outside it, or pressing close, yields a URL without `queue=`, and the left pane then
shows the folder tree.

I6. Each legacy URL form (`?collection=`, `?playlist=`, `?smart_collection=`,
`?folder_play=1`) on `/files/{id}` answers with a 307 to the page in §1 for the file's own
drive. The target carries the same file id and the `t`, `page`, `section` and `highlight`
values of the request.

I7. No route renders `FileDetailFullScreen`, and `FileDetailSurface` has no value other
than the file page's. A file reached from a queue renders the same inspector, workbench
and page row as the same file reached from its folder at the same width.

I8. Exactly one queue pane is mounted on a page, and the folder tree is not shown while it
is. Every row of a collection queue has its move up, move down and remove buttons
visible without hover. A folder or Smart queue row has none of them.

I9. Below `md` with a file open and a queue present, the pane button shows the queue at
the full viewport width. Choosing a row selects that file and hides the queue. Playback of
the open file is not paused by opening or closing the pane.

I10. Opening a collection page with `?file=` for a file that is not in the collection
shows the file with no current row, `– / N`, and no advance at its end.

## Revises

SPEC-CORE-085 I1. On a player file in a wide form, after the first measurement: the row under the player (beside it in the beside state of SPEC-CORE-105; under the player in the left column in the split layout of SPEC-CORE-126) holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other panel toggle; an addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab, and once rendered, silence means available; while a panel is shown in the workbench of a framed player, the row also holds, after the toggles, the **Show panels beside the player** button of SPEC-CORE-127 when the page is split-eligible and the **Enlarge panels** button of SPEC-CORE-104 outside the split layout; the `file-preview-actions` entries are at the row's trailing end, after those buttons, and in the narrow forms they stay in the player box; each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`; the row is not drawn when it has no toggle and no action; chapters is never a toggle and is never drawn under the player.
SPEC-CORE-085 I5. While at least one panel is shown under a framed player in a wide form outside the split layout of SPEC-CORE-126, the 16:9 frame is at most half of the scroll container's visible height, the scroll container does not scroll at any visible height of 320px or more (with Find closed and the row not wrapped to no room), and each shown panel ends within the visible area. In the split layout the frame follows SPEC-CORE-126 I2 and the page does not scroll (SPEC-CORE-126 I3). Each panel's body scrolls inside itself.
SPEC-CORE-085 I9. On a player file, an id that is both a `player-side` entry and a `file-detail-sections` entry is drawn only as a panel, and `ActiveSummaryHost` is drawn only as the `active-summary` panel. On the file page of a file without a player, `ActiveSummaryHost` is the last block of Info before the comments and an id that is a `document-side` entry is drawn only as that slot's inspector tab (SPEC-CORE-132); in `MarkdownDocumentLayout` both are drawn where they were before SPEC-CORE-132. A `player-side` entry whose id equals a core panel or core tab id is not mounted.
SPEC-CORE-104 I1. The **Enlarge panels** button is drawn exactly when the file is in a workbench form, with a framed player and at least one panel shown under it, and the page is not in the split layout of SPEC-CORE-126. Then there is exactly one on the page, in the workbench row, after the "Panels" group and after the **Show panels beside the player** button when that is drawn, and before the `data-preview-actions` element, inside neither. It is never drawn in `stacked` with the inspector open, on the phone, for an unframed player, with no panel shown, or in the split layout.
SPEC-CORE-104 I7. With the stored value `"true"`, `stacked` with the inspector open, the phone and an unframed player are laid out exactly as they are with the value absent, and the pseudo or system full-screen frame and the mini-player window are the same size as with the value absent.
SPEC-CORE-126 I1. The **Show panels beside the player** button is drawn exactly when the page is split-eligible, once, in the workbench row's trailing element, before **Enlarge panels** when that is drawn and before the `data-preview-actions` element, each 0.5rem apart. Its box is 2rem x 2rem at a fine pointer and 2.75rem x 2.75rem at a coarse pointer; when it is the trailing element's last item, its right edge is the row's right edge. All within 1px. It is never drawn in `stacked` with the inspector open, on the phone, for audio, with no shown panel, or while W < 61rem.
SPEC-CORE-094 I1. On a file page (loading, loaded or failed) outside the focus layout of SPEC-CORE-128, the page shows exactly one row above the content, its height equals the header's height on a folder page of the same drive at the same width, the content's top y is the same in all three states, and the header never shows its ordinary form while the viewer stays on a file page (loading → loaded, file → file); in the focus layout with the header hidden the page shows no row, and with it revealed the row is drawn over the content without moving it.
SPEC-CORE-094 I3. At < 768px on a file page, the row shows no quick note button, no avatar, no Focus mode button and no inspector toggle, shows the tree button only while the page has a queue (SPEC-CORE-193), and while walking the Inbox shows no search and no document controls; at ≥ 768px, outside the focus layout or with the header revealed in it, it shows the quick note button, the avatar, the tree button wherever a current drive is known, the Focus mode button, and, wherever the page has an inspector, the inspector toggle as the header's last control, including while a rename is open.
SPEC-CORE-020 I5. A plain-text document renders in the document layout with exactly one page row on the file page, and never shows Split, on any viewport width, by the switch or by the shortcut.
SPEC-CORE-128 I1. In the focus layout with the header hidden, at any wide viewport: no pixel of the app header, `ChromeButtons`, the sidebar or the folder tree is painted, the header and `ChromeButtons` are `inert` and still mounted, and focus mode itself draws nothing visible over the page except, where `(any-pointer: coarse)` matches, the handle (the strip of 129 step 1 is transparent); on a folder, view, collection or search file page the `h-below-header` box runs from the safe area's top to the viewport's bottom; at 1440×900 and 1280×800 with the inspector open the canvas is the viewport's width less the inspector pane's width (384px, or the wide width of SPEC-CORE-133 while a wide `document-side` tab is selected), and with no workbench panel shown a video's frame is 1024×576 and 864×486 (within 1px).
SPEC-CORE-128 I7. Revealing and hiding move nothing on the page: the canvas, the inspector and the player frame keep their boxes (within 1px), and `--app-header-h` equals the safe-area inset in the focus layout whether hidden or revealed.
SPEC-CORE-131 I1. On a file page, for a PDF, an EPUB and an archive, at 1440×900 and 1280×800, in the `beside` and `overlay` forms, in focus mode and with the find bar open, the filled viewer's bottom edge is within 1px of the canvas's content bottom (its inner bottom less its padding and, for the archive, the host's 16px), and the canvas's `scrollHeight` equals its `clientHeight`, also when the find bar opens after the viewer has mounted; at 390×844 (phone) the same holds with the bottom reference above the sheet's peek.
SPEC-CORE-131 I8. On a file page, a citation's jump in the detailed summary tab to a page or section of the open file calls `goTo` with that location and leaves `location.pathname` and `location.search` unchanged; on a phone it also lowers the sheet; after it, on desktop, the detailed summary tab is still selected and the pane still wide; to another file, or with no controller, it navigates to `/files/{id}?page=` / `?section=` as today.
SPEC-CORE-109 I5. Smart Collection playback is `/drive/{drive}?file={id}&queue=smart:{smartId}` (SPEC-CORE-191); `/files/{id}?smart_collection=<id>` redirects there (SPEC-CORE-192). Ending a file opens the next queued entry, `queue=` survives next, previous, a queue-row choice and gallery close, and no reorder or remove control is drawn; with no stored queue the page evaluates the saved query once with relevance, and a failure shows the failure line in the queue pane and is not retried by later navigations; a file not in the queue shows no current row and nothing follows it.
SPEC-CORE-064 I3. On a touch environment, the shelf, page tabs, inspector tabs and the breadcrumb remain horizontally scrollable, as they were. The intelligence Scenes section scrolls on no horizontal axis; its list scrolls vertically.

## Checked, no action

- **The Autoplay preference does not gate advancing.** The user guide says a collection
  advances "when Autoplay is on". The code advances regardless (`CollectionPanel.handleEnded`)
  and forces `autoPlay` on the collection route. The owner chose "always advance" on
  2026-11-27, so the user-guide sentence is corrected, not the behaviour.
- **Shuffle.** None exists today, and none is added.
- **Missing / trashed items in the pane.** Neither the pane nor the old queue greys them
  today. Only the advance rule (I2) skips them. Drawing them differently is left out.
- **Inbox with a queue (`nav=inbox` together with `?collection=`).** It was possible only on
  the legacy route and has no entry point in the UI. The redirect drops `nav`.
- **A separate page for Smart Collection playback.** The search page is a cross-folder
  route with no left pane. Playback lands on the drive root instead (§1), which has the
  two-pane layout. Moving the search page into the two-pane layout is a different change.
- **iOS and MCP.** Neither builds a legacy playback URL (checked with grep), so neither
  changes.
- **Backend.** No endpoint changes. The redirect reads the file the route already fetches.
