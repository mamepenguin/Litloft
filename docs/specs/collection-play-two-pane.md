# Collection playback in the two-pane file page

SPEC-ID: SPEC-CORE-190
SPEC-ID: SPEC-CORE-191
SPEC-ID: SPEC-CORE-192
SPEC-ID: SPEC-CORE-193

Approval: sha256:17637e522d4bd7687f504bf1d3f065b5596654d09b95229f55be0aeea30869e4 Yuichi Senga 2026-11-28

## Summary

Playing a collection, a Smart Collection or a folder opens a separate page today:
`/files/{id}` with `?collection=`, `?playlist=`, `?smart_collection=` or `?folder_play=1`.
This is `FileDetailFullScreen`, the "collection surface". It has none of the file page's
recent work: no inspector, and a vertical stack of player, panels, information and a queue
card. Earlier specs left it out on purpose.

This change retires that page. A queue becomes the left pane of the ordinary two-pane file
page, and the file is drawn by the same `RightPaneFile` and `FileDetailShell` as any other
file.

- SPEC-CORE-190: on a collection's page, the item list in the left pane is the queue.
  - A video or audio file opened from the collection advances to the next playable item
    when it ends.
  - The pane carries the loop switch and the position.
  - The page row's previous and next walk the collection.
- SPEC-CORE-191: folder playback and Smart Collection playback show their queue in the left
  pane in place of the folder tree. It stays until the queue is closed or a file outside it
  is chosen.
- SPEC-CORE-192: the legacy `/files/{id}` queue URLs redirect to these pages. The
  collection surface, its layout and every branch that exists only for it are removed.
- SPEC-CORE-193: on a phone, with a file open and a queue present, the pane button opens the
  queue at full width over the file page, and choosing a row closes it.

It is for the owner, who plays collections and folders and today gets two different file
pages depending on how a file was reached.

### Agreed design

https://claude.ai/artifact/AGk6sEgbnzY5re6k7ASoVa, saved in
`docs/process/reviews/feature-collection-play-two-pane/design/`. Its visible decisions:

- **D1 (`Main.dc.html`, 1440px).**
  - Regions, left to right: the queue pane, 280px wide; then the file page, which is the
    page row, the player column and the inspector.
  - The queue pane's top block holds the queue name, with the position `n / N` under it and
    the loop button at its right.
  - Below the top block are rows. Each row has its 1-based ordinal, a thumbnail, the title,
    and the duration under the title.
  - On a collection, each row also has move up, move down and remove buttons, always
    visible.
  - The current row has the accent tint and a 1px accent ring, and its ordinal is in accent
    and bold.
- **D2 (`Main.dc.html`).**
  - The page row has previous / next with `n / N` beside them, for every file type. They
    count the queue, not the folder.
  - On a collection page the trail is drive / collection name / file title.
  - The page row is SPEC-CORE-094's single header row. The design drawing it under a
    separate header is a simplification, not a decision.
- **D3 (`Narrow.dc.html`, 1024px).** Where the inspector does not fit beside the pane, the
  queue pane yields as the folder tree does (SPEC-CORE-082). The page row keeps the queue's
  previous / next.
- **D4 (`FolderPlay.dc.html`).**
  - Folder or Smart Collection playback draws the same pane in place of the tree.
  - Its top block has the folder's or the Smart Collection's name, `n / N`, the loop button
    and a close button (×).
  - Rows have the ordinal, title and duration, and no reorder or remove buttons.
- **D5 (`Phone.dc.html`, 390px).** While playing, the row has the pane button and previous /
  next. The file page is the usual phone layout.
- **D6 (`PhoneQueue.dc.html`, 390px).**
  - The pane button opens the queue at full width, with a close row on top.
  - Rows are at least 44px tall, and so are the loop button and the per-row buttons.

## Terms

**Queue.** An ordered list of items, each naming one file id.

| Kind | Shown on | Items |
|---|---|---|
| Collection | a collection's page, `/drive/{drive}/collections/{id}` | the collection's items, any type |
| Folder | a folder route with `queue=folder` (`/drive/{drive}` or `/drive/{drive}/{folder}`) | that route's folder's video and audio files |
| Smart | a folder route with `queue=smart:{smartId}` | the stored Smart Collection queue (video and audio only) |

**Queue page.** A page that has a ready queue holding the open file, whether or not the
pane is visible at that moment.

**Queue action.** Any of the following:

- **Play** on a collection page
- folder **Play all**
- Smart Collection **Play**
- choosing a row in the queue pane
- previous / next on a queue page, by the page-row buttons, by ← / → where §1 step 7 says
  they walk the queue, or by the system's previous / next track controls (Media Session)
- an advance

**Playable item.** An item whose file is a video or audio file, and is neither missing nor
in the trash as far as the queue's data says. A Smart queue entry carries no state, so every
Smart entry counts as playable.

## Required items

### 1. Normal flow

#### Collection (SPEC-CORE-190)

1. The viewer opens `/drive/{drive}/collections/{id}`. The left pane lists the items, and
   the right pane shows the collection's grid or list. Both are unchanged.
2. **Play** is shown when the collection has a playable item. It selects the first playable
   item with `?file=` on the same page. A collection whose video and audio items are all
   missing or in the trash shows no Play.
3. Choosing a row in the pane, or a card in the grid or list, selects that file the same
   way.
4. The right pane draws the file with `RightPaneFile`, exactly as on a folder page, with
   the inspector, the workbench and the page row.
5. A file reached by a queue action starts playing without a further press, whatever the
   **Autoplay** preference (`video-share-autoplay`) says. A file reached any other way
   starts only when that preference is on. The other ways are:
   - a card in the grid or list
   - a reload
   - Back / Forward
   - a link
   - a legacy redirect
   - a Smart URL with no stored queue

   Which way the file was reached is known from the action that selected it, held in
   memory for that one selection. It is not carried in the URL.
6. When a video or audio file reaches its end:
   - The final position is recorded as today.
   - The page then selects the next playable item after the ended one, in the queue's
     order, and it starts playing.
   - With loop on, the search continues from the first item after the last.
   - With loop off and nothing after the ended one, the page stays on the ended file.
7. Previous / next in the page row select the item before / after the current one in the
   collection's order, any file type.
   - `n / N` is the item's 1-based position and the item count.
   - Previous is disabled on the first item and next on the last. They do not wrap, even
     with loop on.
   - The arrow keys keep their reach and change only their source. On a player file they
     still seek. On a file whose ← / → change file today (images, Office and text files),
     they walk the queue, exactly as the buttons do. On a paged viewer (PDF, EPUB), they
     still turn pages.
   - On a document that rides the document shell (Markdown, plain text, HTML), the
     document row (`MarkdownDocumentLayout`) draws the same previous / next and `n / N`.
   - The system's next-track control follows the advance rule (step 6): the next playable
     item, wrapping with loop on, and it starts playing. The system's previous-track control
     selects the previous playable item, wrapping with loop on, and it starts playing. Both
     are registered only on a queue page.
8. Reordering or removing an item in the pane takes effect in the queue at once.
   - The next advance and previous / next use the new order.
   - Removing the current item leaves its file open as a file outside the collection (§2).
9. On each change of the selected file, and on first load, the pane scrolls the current row
   into view with `block: "nearest"`. The scroll is smooth, or instant under reduced motion
   (SPEC-CORE-178 I5).
10. The collection name in the pane's top block, and the collection crumb in the trail, go
    to the collection's list on the same page by clearing `?file=`.
11. These writes made from this page read the collection again:
    - an add to this collection through the file's **Add to collection**
      (`CollectionPicker`);
    - a drop onto this collection in the sidebar (`SidebarCollectionsSection`);
    - trashing the open file from its menu (`FileActions`).

    Each signals the page through an in-tab notice (`frontend/src/lib/collectionChanged.ts`).
    A re-read keeps the open file mounted and playing. It keeps the old rows and `n / N`
    until the new answer arrives, and an end during it uses the old queue. A failed re-read
    keeps the old queue and shows nothing; only the first load shows the not-found view.
12. When the stored tree setting for the drive is off, starting a queue shows the pane for
    this visit and does not write `tree:enabled:{drive}`.
    - While shown this way, the pane button hides and re-shows it, and writes nothing.
    - The pane yields at narrow widths like any pane (SPEC-CORE-082).
    - When the queue ends, the pane goes away and the tree is not shown.
    - Below `md` the pane does not open by itself. The pane button opens it (SPEC-CORE-193).
    - On a collection page the visit ends when the page is left.

#### Folder and Smart Collection (SPEC-CORE-191)

1. A folder's **Play all** selects the queue's first file on the folder's own page,
   `/drive/{drive}/{folder}?file={id}&queue=folder`.
   - When the folder's sort is not random, it adds that `sort` and `order`.
   - When it is random, the queue is the listing's video and audio files in the order shown
     at the press. That order is stored in the tab (`sessionStorage`,
     `folder-queue:<drive>:<path>`), and the URL carries `sort=random`.
2. A Smart Collection's **Play** evaluates and stores the queue as today
   (`storeSmartQueue`). It then selects the first file on the drive's root page,
   `/drive/{drive}?file={id}&queue=smart:{smartId}`.
3. While `queue=` is in the URL of a folder route, the left pane holds the queue (D4)
   instead of the folder tree.
   - **The folder queue.** The folder's video and audio files merged into one sequence, in
     the URL's `sort` and `order`. When those are absent, `created_at`, `desc`, which is
     today's default. It is fetched page by page, 500 at a time, as today. With
     `sort=random` it is the stored order. When nothing is stored (a link or a new tab), it
     is `created_at`, `desc`.
   - **The Smart queue.** The stored queue. When nothing is stored, one evaluation of the
     saved query (`loadSmartQueue`).
   - **The Smart top block.** Its name is the stored queue's name. The page also reads the
     drive's Smart Collections once (`GET /api/drives/{drive}/smart-folders`), for the
     name of a cold queue and for the link. While that read is pending, or if it fails, a
     cold queue shows no name and the stored name is shown without a link. A Smart
     Collection that no longer exists is named without a link.
4. The file starts playing (step 5 of the collection flow). Ending, advancing, loop,
   previous / next, the current-row scroll and the tree-off rule behave as for a
   collection, over the queue's items.
5. Previous, next and a row choice keep `queue=`, as does an advance and a choice from the
   tree or listing of the same page that the ready queue holds. For a folder queue they
   also keep `sort` and `order`. Gallery close counts as a choice. A navigation to another
   URL (search, a link, another folder) does not carry `queue=`, so the queue ends.
6. The name in the top block is a link:
   - for a folder, to the folder's listing;
   - for a Smart Collection, to its saved search page (`smartFolderHref`).

   Following it ends the queue.
7. The queue ends when any of the following happens. Ending removes `queue=`, and the
   `sort` / `order` that Play all added, from the URL, and shows the tree again (or, with
   the tree setting off, no pane):
   - the close button (×) is pressed: the open file stays open and keeps playing;
   - a file the ready queue does not hold is chosen anywhere (tree, listing, search, link);
   - the file is closed (`clearFile`: the crumb, Escape, trashing the open file);
   - the name link is followed.
8. Trashing a file from this page reads a non-random folder queue again. A stored random
   folder queue and the Smart queue are frozen, as SPEC-CORE-109 I3 states for the Smart
   queue.

#### Legacy URLs (SPEC-CORE-192)

1. `/files/{id}` with a queue parameter redirects (307). When several are present, the
   first that applies wins, in this order:

   | Parameter | Redirects to |
   |---|---|
   | `?collection={c}`, else `?playlist={c}` | `/drive/{drive}/collections/{c}?file={id}` |
   | `?smart_collection={s}` | `/drive/{drive}?file={id}&queue=smart:{s}` |
   | `?folder_play=1` | `/drive/{drive}/{folder}?file={id}&queue=folder`, keeping `sort` and `order` |

2. Every form keeps `t`, `page`, `section`, `highlight`, `find` and `edit`. Every form
   drops `nav`. Only the folder form keeps `sort` and `order`.
3. `{drive}` and `{folder}` are the file's own, read from `GET /api/files/{id}` as the route
   does today for its canonical redirect.

#### Phone (SPEC-CORE-193)

1. Below `md`, with a file open and a queue present, the row shows the pane button
   (labelled as in §9).
2. Pressing the button opens the queue pane at full width (D6). Playback continues
   underneath. The open state is the existing narrow-open state (`treeNarrowOpenStore`).
3. Choosing a row selects that file and closes the pane. The close row closes it without
   changing the file or the queue.

### 2. Failure cases

- **The collection fails to load.** The page shows its not-found view, as today.
- **A queue is loading.**
  - The pane draws the top block and the existing `queueLoading` line in place of the
    rows.
  - Previous and next are disabled, `n / N` shows `– / –`, and nothing advances.
  - A selection made meanwhile keeps `queue=`, because the queue cannot yet answer whether
    it holds the file.
- **A queue fails.** This covers a failed folder fetch, and a Smart evaluation that fails
  or is incomplete.
  - The pane draws the top block and the existing `queueFailed` line.
  - Previous and next are disabled, and nothing advances.
  - × still ends the queue, and any selection ends it.
  - A Smart failure is remembered for the tab, per Smart Collection, as
    `failedSmartQueues` does today.
- **The open file is not in the ready queue.** This happens after a URL edit, after the
  current collection item is removed, or after the file is moved elsewhere.
  - No row is current, and `n / N` shows `– / N`.
  - Previous and next are disabled, and nothing advances at its end.
- **The next queued file fails to load.** The right pane shows its existing not-found
  state. The queue does not skip past it on its own.
- **A legacy URL names a file that does not exist or is locked.** 404, as the route does
  today.
- **A reorder or remove request fails.** The existing toast shows and the collection is
  read again (§1 step 11). The open file stays mounted and keeps playing.
- **A re-read fails.** The old queue stays and nothing is shown (§1 step 11).
- **A `.loft` item.** It is a video file, so it is playable. Its player cannot start on its
  own and reports an end only when its embed does. A queue action on it shows it ready to
  play, and the queue advances from it only when it reports an end.
- **`queue=` reaches a route that does not show a folder's two-pane layout.** These routes
  are a collection page, a cross-folder view (`?view=`), the search route, an addon route
  and an app route. There `queue=` is ignored: no queue pane, no advance. The next
  selection drops it.

### 3. States

The left pane on a page under `/drive/{drive}`:

| State | Pane shows | Entered by | Left by |
|---|---|---|---|
| Tree | folder tree | default on a folder route | `queue=` added |
| Collection, no file | item list (top block with name and loop; `n / N` not drawn) | opening a collection page | selecting a file; leaving |
| Collection, file | item list as queue | selecting a file | clearing `?file=`; leaving |
| Collection, re-reading | the old rows | a §1 step 11 write | the answer (new rows) or a failure (old rows) |
| Folder / Smart: loading | top block + `queueLoading` | `queue=` on a folder route | ready; failed; any rule of §1 Folder step 7 |
| Folder / Smart: ready | queue rows | load done | any rule of §1 Folder step 7 |
| Folder / Smart: failed | top block + `queueFailed` | load failed | × or any selection |

Transitions that are not allowed:

- a queue pane and the tree mounted together;
- two queues on one page (a collection page ignores `queue=`);
- `queue=` kept after the close button, a choice outside a ready queue, or `clearFile`.

Visibility is the existing tree-pane state. It covers open, yielded and hidden by the
setting, and applies to every row of the table unchanged, with two exceptions: the phone rule
of SPEC-CORE-193, and the tree-off rule of §1 Collection step 12 (also applied to folder and
Smart queues).

The folder tree stays mounted under a queue pane. It is only not shown, so its expansion and
scroll state survive a queue.

Loop is one boolean per browser (`collection-loop` in localStorage, as today), shared by
every queue and written only by the loop button.

### 4. Data read and written

- **Read:**
  - `GET /api/drives/{drive}/collections/{id}` (collection items)
  - `GET /api/drives/{drive}/files` (folder queue)
  - the Smart Collection evaluation (unchanged)
  - `GET /api/drives/{drive}/smart-folders` (the Smart queue's name and link)
  - `GET /api/files/{id}` (legacy redirect, the right pane)
- **Written:**
  - `PUT …/collections/{id}/reorder` and `DELETE …/items/{itemId}`, as today, from the pane
    only.
  - Watch progress, by the players as today (`POST /api/files/{id}/progress`). Playback
    completion records the final position and never deletes the record.
- **Browser storage:**
  - `collection-loop` (localStorage, read and written)
  - `smart-queue:<drive>:<id>` (sessionStorage, read and written as today)
  - `folder-queue:<drive>:<path>` (sessionStorage, new: written by Play all under a random
    sort, read by the folder queue)
  - `video-share-autoplay` (read only)
  - the tree-pane stores (`tree:enabled:{drive}`, `treeNarrowOpenStore`, `treeYieldStore`):
    read, and written only as they are today
- No table, column, endpoint or event is added or changed.

### 5. External services

None. Everything is the core backend over the existing APIs.

### 6. Authorization

Unchanged. Every request goes through the existing drive access checks. A locked drive's
collection or file is 404 before and after the redirect.

### 7. Effect on existing features

- **Callers move.** Every caller of the collection surface moves: `CollectionDetail` Play,
  `FolderBrowser` Play all and `SmartFolderSaveButton` Play.
- **Removed.** These go, together with the branches that exist only for them:
  - `FileDetailFullScreen`, `CollectionPanel`, `SmartQueuePanel` and `CollectionPlayerCanvas`
  - the `"collection"` value of `FileDetailSurface`
  - `ridesFileDetailShell`'s surface test
  - `FileDetailSkeleton`'s non-canonical branch
  - `FileDetailContainer`'s surface checks for the intelligence entry and `hasInspector`
  - the collection-only `chapters` panel in `panels.tsx`
  - `ArchivePreview`'s collection height
  - the `data-collection-workbench` rule in `globals.css`
  - `window.__collectionOnEnded`

  On every playback page, the chapters appear where they do on the file page (the
  inspector), and the detailed summary and in-file jumps behave as on the file page.
- **SPEC-CORE-090** (the collection surface uses the workbench) has nothing left to
  describe. Its ledger row becomes `superseded` in this change.
- **Selection.** `useSelectedFile.selectFile` keeps `queue=` only as §1 Folder steps 5 and 7
  and §2 say.
- **Previous / next.**
  - `FileNavControls` and the ← / → keys read a queue-ordered source on a queue page, and
    `/neighbors` elsewhere.
  - `ShellLayout` and `MarkdownDocumentLayout` draw the controls for every file type on a
    queue page, and for images elsewhere, as today.
  - Which files the keys act on is unchanged (`useFileNav`'s player and paged checks).
  - The Inbox walk (`nav=inbox`, SPEC-CORE-032) is unchanged.
- **Media Session.** On a queue page, the players register `nexttrack` and `previoustrack`
  with the queue rules of §1 step 7, through the existing `lib/mediaSession.ts` handlers.
  Elsewhere they register what they do today.
- **Remaining non-fill branches.** These are removed when no caller reaches them after the
  change, and kept otherwise: `FileDetailPresenter`'s non-shell branch and
  `FileDetailCanvas`, `PdfPreview`'s `h-[80vh]`, `OfficePreview`'s `h-[80vh]`, and
  `EpubPreview`'s `60dvh` fallback. The PR states which.
- **The phone row.** It shows the pane button on a queue page (`ChromeButtons`,
  `TreeToggle`), and the aside can take the full width there (`TwoPaneLayout`).
- **Other file-page features.** The mini player, focus mode, find in file, the workbench and
  the split layout apply on queue pages as on any file page.
- **Addon slots.**
  - `collection-actions` is unchanged.
  - `player-side`, `file-preview-actions`, `file-detail-sections` and `document-side`
    entries now render where the file page renders them, also during playback.
  - The extension-point contract does not change: no slot, prop or name is added or
    removed.
- **iOS and MCP.** The iOS app has no link to a legacy playback URL, and `mcp-server/`
  builds none (both checked).

### 8. Error behavior

As in §2. No logging is added.

### 9. User-visible behavior

- **The page.** Playback from a collection, a folder or a Smart Collection stays on a
  two-pane page (D1–D6). There is no separate centred playback page.
- **Advancing.**
  - On a collection page, any video or audio file opened from the collection advances to
    the next playable item when it ends.
  - A file starts playing on its own after a queue action, and otherwise per the
    Autoplay preference.
- **Previous / next.** They are now shown for video and audio on a queue page, and on a
  collection they follow the collection, not the file's folder.
- **The trail.** On a collection page it names the collection (D2). On a phone, the narrow
  heading's line 1 is the collection name.
- **Loop.** It keeps its current meaning and storage.
- **New text, in en and ja.** It follows the agreed design:

  | Key | en | ja |
  |---|---|---|
  | `queueLabel` (the pane's accessible name) | "Queue" | 「キュー」 |
  | `queueShow` / `queueHide` (the pane button on a queue page) | "Show the queue" / "Hide the queue" | 「キューを表示」 / 「キューを隠す」 |
  | `queueEnd` (×: removes `queue=`) | "Close the queue and show the folder tree" | 「キューを閉じてフォルダツリーに戻す」 |
  | `queueOverlayClose` (the phone close row: hides only) | "Close the queue" | 「キューを閉じる」 |

  Existing `playback.*` strings are reused for the position, loop, loading and failure.
- **Old bookmarks.** Links with `?collection=`, `?playlist=`, `?smart_collection=` or
  `?folder_play=1` land on the new pages.
- **User docs.**
  - `docs/user-guide/playlists-favorites.md` ("Playing a collection"): advancing no longer
    depends on Autoplay; the queue is the left pane.
  - `docs/user-guide/search.md`: Smart Collection Play.
  - `docs/user-guide/tags-and-relations.md`: the "below the player" sentence.

  - `docs/user-guide/keyboard-shortcuts.md`: on a collection, folder or Smart queue, ← / →
    walk the queue where they change file.

### 10. Non-functional

- **Size.** The folder queue keeps today's 500-per-page fetch and has no new cap. The Smart
  queue keeps its existing caps.
- **Rendering.** The queue rows are not virtualised. A collection of a few hundred items
  renders as the item pane does today.
- **Requests.** An advance makes no new request beyond loading the next file.
- **Measured in a real browser (`frontend/e2e-components/`, against the real components).**
  - I8 and D1 at 1440×900: the pane is 280px; each row's buttons are visible without hover;
    the tree is not shown.
  - D3 at 1024×768: the pane yields and previous / next are in the row.
  - I9 and D6 at 390×844: the overlay is the viewport's width; rows and buttons are at least
    44px; the video element is not paused by opening or closing.
  - The queue pane enters the no-horizontal-scroll check at 280px on a mouse
    (SPEC-CORE-064).
  - The page row on a queue page does not wrap and nothing in it overlaps:
    - at 320px with a 200-character name (SPEC-CORE-094 I8);
    - at 768px with a video and find (SPEC-CORE-098 I8);
    - for a Markdown file at 1440px and 768px.
  - D3 at 1024×768 with the tree setting off, after Play: the pane is shown and yields.
- **`agent_cannot_verify`: the owner checks by hand on iOS.**
  - Background audio and Now Playing across an advance.
  - Full screen and Picture in Picture across an advance.
  - The mini player while the phone queue overlay is open.
  - The lock screen's and the headphones' next / previous track on a queue page, with the
    Autoplay preference off.

## Touch points

- `frontend/src/app/files/[id]/page.tsx`
- `frontend/src/lib/canonicalFileUrl.ts`
- `frontend/src/components/FileDetailFullScreen.tsx` (removed)
- `frontend/src/components/CollectionPanel.tsx` (removed; the loop storage and the folder
  fetch move to the queue module)
- `frontend/src/components/CollectionItemsPane.tsx`
- `frontend/src/components/CollectionDetail.tsx`
- `frontend/src/components/folder/TwoPaneLayout.tsx`
- `frontend/src/components/folder/RightPaneFile.tsx`
- `frontend/src/app/drive/[name]/layout.tsx`
- `frontend/src/hooks/useSelectedFile.ts`
- `frontend/src/hooks/useFileNav.ts`
- `frontend/src/hooks/useTreeVisible.ts`
- `frontend/src/lib/leftPaneContext.ts` (`shownBySetting` also covers a pane shown for the
  visit)
- `frontend/src/lib/collectionChanged.ts` (new)
- `frontend/src/components/CollectionPicker.tsx`
- `frontend/src/components/sidebar/SidebarCollectionsSection.tsx`
- `frontend/src/components/FileActions.tsx`
- `frontend/src/components/markdown/MarkdownDocumentLayout.tsx`
- `frontend/src/lib/mediaSession.ts`
- `frontend/src/components/AudioPlayer.tsx`
- `frontend/src/components/VideoPlayer.tsx`
- `frontend/src/components/player/ShellVideoPlayer.tsx`
- `frontend/src/components/PdfPreview.tsx`
- `frontend/src/components/office/OfficePreview.tsx`
- `frontend/src/components/epub/EpubPreview.tsx`
- `frontend/src/components/FileDetail/FileDetailCanvas.tsx`
- `frontend/e2e-components/projects.ts`
- `frontend/e2e-components/spec-viewport.spec.ts`
- `frontend/src/components/FileDetail/__tests__/DocumentSideSlot.test.tsx` and
  `PlainTextDocument.test.tsx`: their collection-surface cases go; SPEC-CORE-132,
  SPEC-CORE-020, SPEC-CORE-050 and SPEC-CORE-094 stay cited by their canonical cases.
- `docs/user-guide/keyboard-shortcuts.md`
- `frontend/src/lib/treeNarrowOpenStore.ts`
- `frontend/src/lib/treeYieldStore.ts`
- `frontend/src/lib/fileNavContext.tsx`
- `frontend/src/components/ChromeButtons.tsx`
- `frontend/src/components/TreeToggle.tsx`
- `frontend/src/components/FileDetail/FileNavControls.tsx`
- `frontend/src/components/FileDetail/ShellLayout.tsx`
- `frontend/src/components/FileDetailShell.tsx`
- `frontend/src/components/FileDetail/FileDetailChrome.tsx`
- `frontend/src/components/FolderBrowser.tsx`
- `frontend/src/components/SmartFolderSaveButton.tsx`
- `frontend/src/lib/smartQueue.ts`
- `frontend/src/lib/driveViews.ts` (read: `smartFolderHref`)
- `frontend/src/lib/fileDetailShell.ts`
- `frontend/src/components/FileDetail/FileDetailPresenter.tsx`
- `frontend/src/components/FileDetail/FileDetailContainer.tsx`
- `frontend/src/components/FileDetail/FileDetailSkeleton.tsx`
- `frontend/src/components/FileDetail/workbench/panels.tsx`
- `frontend/src/components/ArchivePreview.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/messages-core/en.json`
- `frontend/src/messages-core/ja.json`
- New: a queue module under `frontend/src/components/queue/`. It holds the pane, the queue
  sources, the ended → next rule and the one-shot play intent.
- **Tests removed with the surface they test.** Where each SPEC citation remains is given
  after the arrow:
  - `frontend/src/components/__tests__/FileDetailFullScreen.test.tsx`
  - `FileDetailFullScreen.smartCollection.test.tsx` → SPEC-CORE-109 stays in
    `frontend/src/components/__tests__/SearchPage.smartCollectionPlay.test.tsx` and the
    rewritten `page.smartCollection.test.tsx`
  - `FileDetailFullScreen.inboxNav.test.tsx` → SPEC-CORE-032 stays in
    `frontend/src/components/folder/__tests__/RightPaneFile.inboxNav.test.tsx` and the
    sidebar tests
  - `FileDetailFullScreen.headerRow.test.tsx` → SPEC-CORE-094 stays in
    `frontend/src/components/folder/__tests__/RightPaneFile.headerRow.test.tsx`
  - `CollectionPanel.test.tsx` → SPEC-CORE-179 stays in
    `frontend/src/components/__tests__/CollectionItemsPane.reducedMotion.test.tsx`
  - `frontend/src/components/FileDetail/__tests__/WorkbenchCollection.test.tsx` →
    SPEC-CORE-089 stays in `Workbench.test.tsx`; SPEC-CORE-090 is superseded
  - `frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts`
  - `frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts`
- **Tests rewritten to the new page, or with their collection-surface cases removed.**
  - `frontend/src/app/files/[id]/__tests__/page.test.tsx`
  - `page.smartCollection.test.tsx`
  - `frontend/src/components/__tests__/CollectionDetail.test.tsx`
  - `FileDetailPageRow.test.tsx`
  - `FileDetailCanvas.test.tsx`
  - `FindInFile.test.tsx`
  - `InspectorTabsSlot.test.tsx`
  - `LoftMetadataPlacement.test.tsx`
  - `WorkbenchRowBeside.test.tsx`
  - `WorkbenchPlayerFocus.test.tsx`
  - `FileDetailContent.test.tsx`
  - `SearchPage.smartCollectionPlay.test.tsx`
  - `frontend/src/lib/__tests__/fileDetailShell.test.ts`
  - `frontend/src/__tests__/section-rows.test.tsx`
- **e2e files that draw or assert the collection surface.**
  - `frontend/e2e-components/player-workbench-desktop.spec.ts`
  - `frontend/e2e-components/scenes-scroll-list-desktop.spec.ts`
  - `frontend/e2e-components/workbench-no-panel-desktop.spec.ts`
  - `frontend/e2e-components/workbench-split-desktop.spec.ts`
  - `frontend/e2e-components/fixtures/app.tsx`
  - `frontend/e2e-components/fixtures/focusMode.tsx`
  - `frontend/e2e-components/fixtures/fileHeaderRow.tsx`
  - `frontend/e2e-components/fixtures/inspectorResponsive.tsx`
  - `frontend/e2e-layout/no-horizontal-scroll.spec.ts`
  - `frontend/e2e-layout/no-horizontal-scroll-states.spec.ts`
  - `frontend/e2e-layout/fixtures/no-horizontal-scroll.html`
  - `frontend/src/components/__tests__/noHorizontalScrollFixtureParity.test.tsx`
  - New e2e-components specs for §10's measurements.
- `docs/specs/INDEX.md` (SPEC-CORE-090 → superseded)
- `docs/user-guide/playlists-favorites.md`
- `docs/user-guide/search.md`
- `docs/user-guide/tags-and-relations.md`
- `DESIGN.md` (the left pane: a queue may take the tree's place)
- `docs/process/reviews/feature-collection-play-two-pane/design/`
- **Rules passed through.**
  - `.claude/rules/design-decisions.md`: watch history (completion records the final
    position and never deletes); SPA navigation.
  - `.claude/rules/frontend-conventions.md`
  - `DESIGN.md`

No protected path is edited.

## Invariants

I1. On every queue kind, when a video or audio file ends with a finite positive duration, its
watch record holds `position = currentTime` and `duration = duration` after the advance. No
playback-completion path calls `deleteWatchProgress` or `clearProgress`.

I2. Selection after an end:

- After a file in a ready queue ends, the selected file is the first item after the ended
  one, in the queue's order, that is a playable item.
- With loop on, the search continues from the queue's start and stops at the ended item.
- When no item qualifies, the selected file does not change.
- The newly selected file starts playing.

I3. On a queue page, previous / next behave as follows:

- The page-row buttons, and ← / → on a file whose keys change file, select the item
  immediately before / after the open file in the queue's order. They are disabled at the
  first and the last item, whether loop is on or off.
- The shown `n / N` is the item's 1-based position and the item count.
- They never select a file outside the queue.
- The buttons are drawn for every file type, the document row included.
- The system's next / previous track select the next / previous playable item, wrap with
  loop on, and start it playing.

I4. A reorder or removal in the collection pane changes the queue without a reload. The
next previous / next and advance follow the new order. A failed reorder or removal leaves
the open file mounted and its playback running.

I5. `queue=` lifetime:

- On a folder route, `queue=` is removed by ×, by the name link, by `clearFile`, and by
  choosing a file the ready queue does not hold.
- It is kept by previous, next, a row choice, an advance, and a same-page choice of a file
  the ready queue holds. For a folder queue, `sort` and `order` are kept along with it.
- Ending the queue also removes the `sort` / `order` Play all added.
- Without `queue=`, the left pane shows the folder tree with its prior expansion and
  scroll state when the tree setting is on, and nothing when it is off.

I6. Legacy redirects:

- Each legacy form on `/files/{id}` answers with a 307 to the target of §1 for the file's
  own drive, following the stated precedence.
- The target carries the same file id and the request's `t`, `page`, `section`,
  `highlight`, `find` and `edit` values.
- For the folder form, the target also carries `sort` and `order`.
- The target never carries `nav`.

I7. No route renders `FileDetailFullScreen`, and `FileDetailSurface` has no value other than
the file page's. A file reached from a queue renders the same inspector, workbench and
player as the same file reached from its folder at the same width. The page row differs
only in the trail (D2), in previous / next and `n / N` (I3), and in the phone pane button
(I9).

I8. Pane content:

- Exactly one queue pane is mounted on a queue page, and the folder tree is not shown
  while it is.
- Every row of a collection queue has its move up, move down and remove buttons visible
  without hover. A folder or Smart queue row has none of them.

I9. Below `md`, with a file open and a queue present:

- The row shows the pane button, and it shows the queue at the full viewport width.
- Choosing a row selects that file and hides the queue.
- Opening or closing the overlay does not pause the open file's playback.

I10. A file whose ready queue does not hold it shows no current row and `– / N`. Its
previous / next are disabled, and nothing advances at its end. This holds on a collection
page after the current item is removed, and for a `?file=` outside the collection.

I11. Autoplay:

- A file selected by a queue action starts playing whatever the Autoplay preference says,
  except a `.loft` item, whose player cannot start on its own.
- A file reached by a reload, Back / Forward, a link, a legacy redirect, a cold Smart URL
  or a grid or list card starts playing only when the preference is on.
- The URL carries no parameter for this.

I12. Current row and links:

- On each change of the selected file and on first load, the current row is inside the
  pane's visible box after the scroll, which uses `block: "nearest"` and the behaviour
  SPEC-CORE-178 I5 states.
- On a collection page, the trail is drive / collection name / file title. The collection
  crumb and the pane's collection name both clear `?file=` and keep the viewer on the
  collection page.

I13. Tree setting:

- With `tree:enabled:{drive}` off, starting a queue at `md` or wider shows its pane, and
  the pane yields under the same conditions as a pane shown by the setting.
- Neither starting a queue, nor hiding or re-showing a pane shown this way, nor ending the
  queue writes `tree:enabled:{drive}`.
- When such a queue ends, no left pane is shown.

I14. Freshness:

- Each write listed in §1 step 11, made on a collection page, is reflected in its queue's
  next advance and previous / next.
- Neither a re-read nor its failure unmounts the open file or pauses it.
- Loop is read from and written to `collection-loop` only, and only the loop button writes
  it.

I15. Folder queue contents:

- A folder queue holds exactly the folder's video and audio files, merged into one
  sequence in the URL's `sort` and `order`, or `created_at desc` when they are absent.
- Under `sort=random`, it holds the stored order when one is stored for the tab.
- Play all selects that queue's first item.

I16. Collection Play selects the first item, in the collection's order, that is a
playable item. Play is not drawn when no item is playable.

## Revises

SPEC-CORE-082 I7. A yield happens only when a left pane is present and shown, by the stored setting or for the visit by a started queue (SPEC-CORE-190 step 12); the file has a player; the inspector is open by the stored value or the default (not by find); the viewport is not a phone; and the measured row is narrow. It never writes `tree:enabled:{drive}` and keeps the sidebar in its overlay form. No frame is painted with the pane at full width once the yield conditions hold. A row that fits without the pane goes to `beside` with no `stacked` frame drawn.
SPEC-CORE-082 I8. On a file page the tree button follows the table in §3: while yielded it reports the pane as hidden and pressing it shows the pane without writing storage; from "hidden by setting" it writes `true` and the pane is not collapsed afterwards; from "reopened" it writes `false`. A reopened pane, at md width and wider, stays shown across widths, file changes and inspector toggles until the file page is left. A queue pane shown for the visit with the setting off (SPEC-CORE-190 step 12) is hidden and re-shown by the button without writing storage, and goes away when its queue ends. In the focus layout of SPEC-CORE-128 the tree button reports the pane as hidden, and a press ends focus mode and then applies this table only when the pane is not visible in the layout that leaving produces.
SPEC-CORE-082 I9. A yielded pane stays collapsed across closing the inspector, widening, a phone crossing and a file without a player. Leaving the file page, by any route or by `TwoPaneLayout` unmounting, clears the yield state. At md and wider the listing shows the pane exactly when the stored setting is on, or a queue pane is shown for the visit on a collection page (SPEC-CORE-190 step 12).

SPEC-CORE-085 I1. On a player file in a wide form, after the first measurement: the row under the player (beside it in the beside state of SPEC-CORE-105; under the player in the left column in the split layout of SPEC-CORE-126) holds exactly one toggle per panel-list item that has rendered and has not answered `false`, in `priority` order, and no other panel toggle; an addon entry whose component has not rendered yet (its module is still loading, or failed to load) has no toggle, no shown panel and no tab, and once rendered, silence means available; while a panel is shown in the workbench of a framed player, the row also holds, after the toggles, the **Show panels beside the player** button of SPEC-CORE-127 when the page is split-eligible and the **Enlarge panels** button of SPEC-CORE-104 outside the split layout; the `file-preview-actions` entries are at the row's trailing end, after those buttons, and in the narrow forms they stay in the player box; each toggle's `aria-pressed` is `true` exactly when its id is in `workbench-panels`; the row is not drawn when it has no toggle and no action; chapters is never a toggle and is never drawn under the player.
SPEC-CORE-085 I5. While at least one panel is shown under a framed player in a wide form outside the split layout of SPEC-CORE-126, the 16:9 frame is at most half of the scroll container's visible height, the scroll container does not scroll at any visible height of 320px or more (with Find closed and the row not wrapped to no room), and each shown panel ends within the visible area. In the split layout the frame follows SPEC-CORE-126 I2 and the page does not scroll (SPEC-CORE-126 I3). Each panel's body scrolls inside itself.
SPEC-CORE-085 I9. On a player file, an id that is both a `player-side` entry and a `file-detail-sections` entry is drawn only as a panel, and `ActiveSummaryHost` is drawn only as the `active-summary` panel. On the file page of a file without a player, `ActiveSummaryHost` is the last block of Info before the comments and an id that is a `document-side` entry is drawn only as that slot's inspector tab (SPEC-CORE-132); in `MarkdownDocumentLayout` both are drawn where they were before SPEC-CORE-132. A `player-side` entry whose id equals a core panel or core tab id is not mounted.
SPEC-CORE-104 I1. The **Enlarge panels** button is drawn exactly when the file is in a workbench form, with a framed player and at least one panel shown under it, and the page is not in the split layout of SPEC-CORE-126. Then there is exactly one on the page, in the workbench row, after the "Panels" group and after the **Show panels beside the player** button when that is drawn, and before the `data-preview-actions` element, inside neither. It is never drawn in `stacked` with the inspector open, on the phone, for an unframed player, with no panel shown, or in the split layout.
SPEC-CORE-104 I7. With the stored value `"true"`, `stacked` with the inspector open, the phone and an unframed player are laid out exactly as they are with the value absent, and the pseudo or system full-screen frame and the mini-player window are the same size as with the value absent.
SPEC-CORE-126 I1. The **Show panels beside the player** button is drawn exactly when the page is split-eligible, once, in the workbench row's trailing element, before **Enlarge panels** when that is drawn and before the `data-preview-actions` element, each 0.5rem apart. Its box is 2rem x 2rem at a fine pointer and 2.75rem x 2.75rem at a coarse pointer; when it is the trailing element's last item, its right edge is the row's right edge. All within 1px. It is never drawn in `stacked` with the inspector open, on the phone, for audio, with no shown panel, or while W < 61rem.
SPEC-CORE-094 I1. On a file page (loading, loaded or failed) outside the focus layout of SPEC-CORE-128, the page shows exactly one row above the content, its height equals the header's height on a folder page of the same drive at the same width, the content's top y is the same in all three states, and the header never shows its ordinary form while the viewer stays on a file page (loading → loaded, file → file); in the focus layout with the header hidden the page shows no row, and with it revealed the row is drawn over the content without moving it.
SPEC-CORE-094 I3. At < 768px on a file page, the row shows no quick note button, no avatar, no Focus mode button and no inspector toggle, shows the tree button only while the page has a queue (SPEC-CORE-193), and while walking the Inbox shows no search and no document controls; at ≥ 768px, outside the focus layout or with the header revealed in it, it shows the quick note button, the avatar, the tree button wherever a current drive is known, the Focus mode button, and, wherever the page has an inspector, the inspector toggle as the header's last control, including while a rename is open.
SPEC-CORE-094 I5. Every trail link (and the narrow heading's line 1) navigates to the same destination as today's `FileDetailChrome` link, except on a collection page, where the trail is drive / collection name / file title, the collection crumb and the narrow heading's line 1 (the collection name) clear `?file=` on that page; where the host supplies `onBack`, that control calls `onBack` and does not navigate to the parent folder.
SPEC-CORE-020 I5. A plain-text document renders in the document layout with exactly one page row on the file page, and never shows Split, on any viewport width, by the switch or by the shortcut.
SPEC-CORE-128 I1. In the focus layout with the header hidden, at any wide viewport: no pixel of the app header, `ChromeButtons`, the sidebar or the folder tree is painted, the header and `ChromeButtons` are `inert` and still mounted, and focus mode itself draws nothing visible over the page except, where `(any-pointer: coarse)` matches, the handle (the strip of 129 step 1 is transparent); on a folder, view, collection or search file page the `h-below-header` box runs from the safe area's top to the viewport's bottom; at 1440×900 and 1280×800 with the inspector open the canvas is the viewport's width less the inspector pane's width (384px, or the wide width of SPEC-CORE-133 while a wide `document-side` tab is selected), and with no workbench panel shown a video's frame is 1024×576 and 864×486 (within 1px).
SPEC-CORE-128 I7. Revealing and hiding move nothing on the page: the canvas, the inspector and the player frame keep their boxes (within 1px), and `--app-header-h` equals the safe-area inset in the focus layout whether hidden or revealed.
SPEC-CORE-131 I1. On a file page, for a PDF, an EPUB and an archive, at 1440×900 and 1280×800, in the `beside` and `overlay` forms, in focus mode and with the find bar open, the filled viewer's bottom edge is within 1px of the canvas's content bottom (its inner bottom less its padding and, for the archive, the host's 16px), and the canvas's `scrollHeight` equals its `clientHeight`, also when the find bar opens after the viewer has mounted; at 390×844 (phone) the same holds with the bottom reference above the sheet's peek.
SPEC-CORE-131 I8. On a file page, a citation's jump in the detailed summary tab to a page or section of the open file calls `goTo` with that location and leaves `location.pathname` and `location.search` unchanged; on a phone it also lowers the sheet; after it, on desktop, the detailed summary tab is still selected and the pane still wide; to another file, or with no controller, it navigates to `/files/{id}?page=` / `?section=` as today.
SPEC-CORE-109 I5. Smart Collection playback is `/drive/{drive}?file={id}&queue=smart:{smartId}` (SPEC-CORE-191), and `/files/{id}?smart_collection=<id>` redirects there (SPEC-CORE-192). Ending a file opens the next queued entry; `queue=` survives next, previous, a queue-row choice, an advance and gallery close; no reorder or remove control is drawn. With no stored queue the page evaluates the saved query once with relevance, and the file starts playing only when the Autoplay preference is on. A failure shows the failure line in the queue pane and is not retried by later navigations. A file not in the queue shows no current row and nothing follows it.
SPEC-CORE-064 I3. On a touch environment, the shelf, page tabs, inspector tabs and the breadcrumb remain horizontally scrollable, as they were. The intelligence Scenes section scrolls on no horizontal axis; its list scrolls vertically.
SPEC-CORE-064 I4. On a mouse environment, no drawn item is clipped by a wrapper: the bounding box of every drawn card, tab and breadcrumb segment lies inside its container's box. A shelf with a "see all" link draws at most two rows. A shelf without one draws every card in wrapped rows. The queue pane keeps every row reachable through its vertical scroll, with no horizontal scroll at its 280px width. The intelligence Scenes section keeps every tile reachable through its list's vertical scroll, with no horizontal scroll.

## Checked, no action

- **The Autoplay preference does not gate advancing.** The user guide says a collection
  advances "when Autoplay is on". The code advances regardless
  (`CollectionPanel.handleEnded`) and forces `autoPlay` on the collection route. The owner
  chose "always advance" and "queue actions play" on 2026-11-27, so the user-guide sentence
  is corrected, not the behaviour.
- **Arrow keys.** On a player they keep seeking (owner, 2026-11-27); only the page row's
  buttons and the system track controls walk the queue there. On files whose keys change
  file, they walk the queue (owner, 2026-11-28), which SPEC-CORE-094 I9 ("move through that
  page's list") already allows.
- **Restore from this page.** A file in the trash cannot be opened on a collection or
  folder page, so no restore happens there. Only a trash refreshes the queue.
- **Shuffle.** None exists today, and none is added.
- **Drawing missing / trashed items differently in the pane.** Neither the pane nor the old
  queue greys them today. Only the advance rule (I2) skips them.
- **Changes made in another tab or by a scan.** They are not followed while a queue plays
  (owner, 2026-11-27). Only writes made from the same page refresh the queue (I14).
- **Inbox with a queue (`nav=inbox` together with `?collection=`).** It was possible only on
  the legacy route and has no entry point in the UI. The redirect drops `nav`.
- **A two-pane search page for Smart Collection playback.** The search page is a
  cross-folder route with no left pane. Playback lands on the drive root, and the queue's
  name links back to the search page (§1 Folder step 6). Moving the search page into the
  two-pane layout is a different change.
- **Previous / next wrapping with loop on.** They do not wrap. Loop governs only the
  advance at the end (I3).
- **iOS and MCP.** Neither builds a legacy playback URL (checked with grep), so neither
  changes. The iOS behaviours that depend on playback are listed in §10 as hand checks.
- **Backend.** No endpoint changes. The redirect reads the file the route already fetches.
- **The design's two-row header.** The design draws the page row under a separate header.
  The implementation keeps SPEC-CORE-094's single row (D2); this is not a design difference
  to fix.
