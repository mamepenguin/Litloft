# Home: the viewer's own shortcuts in the entry row

SPEC-ID: SPEC-CORE-100
SPEC-ID: SPEC-CORE-101
SPEC-ID: SPEC-CORE-102

Approval:

## Summary

Home's entry row (SPEC-CORE-073) holds the built-in apps and the addons' entries. A viewer
who wants a quick way into one slice of a drive, such as the lecture recordings or one
project's papers, has to build an app for it. This change lets the viewer put an existing
Smart Folder, pinned folder or collection in that row instead. A shortcut leads to the page
that already exists for it; no new screen and no user-defined app are added. Shortcuts are
stored on the server and shared within the drive, like the Smart Folders, pins and
collections they point to, so a shortcut placed from a computer also appears on a phone,
where the sidebar's menus cannot be opened.

- **SPEC-CORE-100**: a nullable `home_added_at` column on `smart_folders`, `pinned_folders`
  and `collections`; `GET` and `PUT /api/drives/{drive}/home-shortcuts`; an `on_home` field
  on the Smart Folder, pin and collection detail responses.
- **SPEC-CORE-101**: Home's entry row draws the drive's shortcuts after the addon entries
  and before the Inbox.
- **SPEC-CORE-102**: a "Put on Home" / "Remove from Home" row in the `…` menu of the
  destination page: a pinned folder's toolbar, a collection's page, a saved Smart Folder's
  search results.

## Required items

### 1. Normal flow

**Placing a shortcut (102, 100)**

1. The viewer opens one of:
   - a folder that is pinned (`FolderToolbar`'s `…` menu, which already holds Pin / Unpin);
   - a collection's page (`CollectionDetail`'s `OverflowMenu`, which holds Delete);
   - a search whose saved Smart Folder is current (`SmartFolderMenuItems`, which holds
     Update, Rename, Delete).
2. The menu shows ホームに置く / Put on Home when the target's `on_home` is false, and
   ホームから外す / Remove from Home when it is true.
   - Folder: the row is drawn only while the folder is pinned, directly after the Pin /
     Unpin row. An unpinned folder shows no Home row.
   - Collection: the row comes before Delete.
   - Smart Folder: the row comes after Rename and before Delete.
3. Choosing the row closes the menu and sends
   `PUT /api/drives/{drive}/home-shortcuts` with `{ "kind": "smart_folder" | "pin" |
   "collection", "id": <smart folder id | pin path | collection id>, "on_home": bool }`.
4. The backend sets the target row's `home_added_at` to the current UTC time when `on_home`
   is true and the column is NULL, keeps it when it is already set, and sets it to NULL when
   `on_home` is false. It answers 204.
5. On success the page's `on_home` for the target flips, so the next time the menu opens it
   offers the other row.

**Drawing shortcuts on Home (101, 100)**

1. `DriveHome` requests `GET /api/drives/{drive}/home-shortcuts` once per page load,
   alongside its other requests, and passes the result to `HomeAppEntries` as a
   `shortcuts` prop. `HomeAppEntries` stays a presenter.
2. The response lists every Smart Folder, pin and collection of the drive whose
   `home_added_at` is set, ordered by `home_added_at` ascending (the first placed first),
   ties broken by `kind` then `id`. Each item is
   `{ "kind", "id", "name", "query", "file_type" }`:
   - `smart_folder`: its `id`, `name`, `query`, `file_type`;
   - `pin`: `id` is the path, `name` is the path's last segment, `query` and `file_type`
     are null;
   - `collection`: its `id`, `name`, `query` and `file_type` null.
3. The entry row draws, in order: Library, the built-in apps, the addon entries, **the
   shortcuts in response order**, then the Inbox while it holds arrivals.
4. Each shortcut is a `next/link` tile in the same tile style as the other entries:
   - Smart Folder: lucide `Search`, link `smartFolderHref({ drive, id, query, file_type })`;
   - pin: lucide `Folder`, link `pinHrefFor(driveBase, path)`;
   - collection: lucide `Library`, link `/drive/{drive}/collections/{id}`.
   These are the sidebar's icons and destinations for the same items.
5. A Smart Folder or collection renamed after it was placed shows its current name the next
   time Home loads.

**Removing a target**

- Deleting a Smart Folder or a collection deletes its row, so its shortcut is gone.
- Unpinning a folder deletes its `pinned_folders` row, so its shortcut is gone; pinning it
  again starts with `on_home` false.

### 2. Failure cases

- `PUT` fails (network, 5xx): `on_home` on the page stays as it was and a toast shows
  `homeShortcutFailed` (ホームの入口を変更できませんでした / Couldn't change the Home
  entry), in the page's existing error-toast style. Nothing is retried.
- `PUT` names a target that no longer exists in that drive (deleted from another tab):
  404; the page shows the same toast.
- `PUT` with an unknown `kind`: 422. The UI never sends one.
- `GET` fails on Home: the entry row draws without shortcuts, as it draws without addon
  entries when the catalogue failed. Other rows are unaffected, and the request does not
  count toward `home-unavailable` (that page appears only when every core row request
  failed, as today).
- `GET` answers after Home has moved to another drive or a newer page load has started:
  the response is discarded.
- A pinned folder renamed or moved on disk: the pin keeps its old path (existing
  behaviour), and the shortcut leads to the same place the sidebar's pin row does.

### 3. States

- A target: off Home (`home_added_at` NULL) ↔ on Home (`home_added_at` set). Created off
  Home. Deleting the target ends both states. Placing an already placed target leaves its
  time, so its position does not change.
- Shortcuts on Home: absent until the `GET` for this drive lands (no skeleton, no
  placeholder tile) → present; or → absent for this page load on failure. On a drive change
  while Home stays mounted: the previous drive's shortcuts are dropped before the new
  drive's arrive. Never present with another drive's shortcuts.
- Menu row: `on_home` false → "Put on Home"; true → "Remove from Home"; while a `PUT` is in
  flight the row keeps the label it had and choosing it again sends nothing.
- Not allowed: a shortcut whose target was deleted or unpinned; a shortcut from another
  drive.

### 4. Data read and written

- `smart_folders`, `pinned_folders`, `collections`: new nullable column `home_added_at`
  (DATETIME), added by `database.py` when missing. Written only by `PUT .../home-shortcuts`.
  Read by `GET .../home-shortcuts` and to fill `on_home` in:
  - `GET /api/drives/{drive}/smart-folders` (and the create / update responses),
  - `GET /api/drives/{drive}/pins`,
  - `GET /api/drives/{drive}/collections/{id}` (collection detail).
- No other table, no file on disk, no cache.

### 5. External services

None. Everything is the core's own API.

### 6. Authorization

`GET` and `PUT .../home-shortcuts` use the drive check every sibling endpoint uses
(`check_drive_access` with the viewer's unlocked groups): a locked or unknown drive is 404.
The target is looked up with `drive == {drive}` as well as its id, so a request can never
read or change another drive's row. No viewer cookie is required, like the Smart Folder,
pin and collection endpoints. The tiles lead to pages that do their own checks.

### 7. Effect on existing features

- Sidebar's Smart Folders, Pins and Collections sections: unchanged; they ignore `on_home`.
- `FolderToolbar`: one more row in the `…` menu while the folder is pinned.
  `usePinnedFolders` also keeps each pin's `on_home`.
- `CollectionDetail`: one more row in its `OverflowMenu`.
- `SmartFolderMenuItems` (search page `…` menu): one more row while a saved Smart Folder
  is current. The `SmartFolderActionsContext` gains the toggle.
- Smart Folder create, update, rename and delete; collection create, rename, delete and
  item changes; pin and unpin: unchanged behaviour. A rename leaves `home_added_at` as it is.
- `HomeAppEntries`: gains the `shortcuts` prop. The order and content of the existing
  entries (SPEC-CORE-073) are unchanged; the Inbox stays last.
- MCP server (`list_collections`, `get_collection`): the extra `on_home` field is ignored.
- Older builds opening a database with the new column ignore it (add-only migration).

### 8. Error behavior

- The toast in item 2 is the only new message. Nothing new is logged.
- A failed `GET` on Home shows nothing.

### 9. User-visible behavior

- New menu rows, in the same row style as the menus' other rows:
  - Put on Home: lucide `HousePlus`; ja ホームに置く, en Put on Home.
  - Remove from Home: lucide `House`; ja ホームから外す, en Remove from Home.
- Shortcut tiles look like the other entry tiles (SPEC-CORE-073 item 9). A long name:
  - container ≥ 36rem: the tile is at most 16rem wide and the label truncates with `…`;
  - container < 36rem: the label wraps to at most two lines and is clamped with `…`.
  The tile's accessible name is the full name either way.
- No count limit. With many shortcuts the narrow grid adds rows and the wide row wraps; it
  never scrolls sideways.
- A change made from a page shows on Home the next time Home loads; Home does not listen
  for it while open.
- No visible heading or separator between the addon entries and the shortcuts.

### 10. Non-functional

- One extra request per Home load. The response is bounded by the drive's Smart Folders,
  pins and collections, which are tens of rows.
- The migration only adds three nullable columns.
- Privacy: shortcuts are visible to everyone who can open the drive, as the Smart Folders,
  pins and collections themselves already are.

### Stack-specific (PROJECT.md)

- Drive boundary: every query in the new router is filtered by `drive`.
- Migration: add-only, per `backend-conventions.md`.
- `app.config` is imported as a module.

## Touch points

- `backend/app/models.py`: `home_added_at` on `SmartFolder`, `PinnedFolder`, `Collection`.
- `backend/app/database.py`: add the three columns when missing (risk zone, HIGH).
- `backend/app/schemas.py`: `on_home` on `SmartFolderResponse`, `PinnedFolderResponse`,
  `CollectionDetailResponse`; `HomeShortcutResponse`, `HomeShortcutUpdate`.
- `backend/app/routers/home_shortcuts.py` (new) and its registration in `backend/app/main.py`.
- `backend/app/routers/smart_folders.py`, `backend/app/routers/drives.py` (pins),
  `backend/app/routers/collections.py`: fill `on_home`.
- `backend/tests/`: new tests for the endpoint, the migration and the responses.
- `frontend/src/lib/api.ts`, `frontend/src/types/` (`SmartFolder`, `PinnedFolder`,
  collection detail, `HomeShortcut`).
- `frontend/src/components/HomeAppEntries.tsx` (path as found) and `DriveHome`.
- `frontend/src/components/folder/FolderToolbar.tsx`,
  `frontend/src/components/folder/usePinnedFolders.ts`, and the caller that passes
  `isPinned` / `onTogglePin`.
- `frontend/src/components/CollectionDetail.tsx`.
- `frontend/src/components/SmartFolderSaveButton.tsx` (`SmartFolderActionsContext`,
  `SmartFolderMenuItems`), `frontend/src/hooks/useSmartFolders.ts`.
- `frontend/src/messages-core/ja.json`, `en.json`.
- Frontend tests (vitest) and a real-browser case for the tile label at both container
  widths (`frontend/e2e-components/`).
- Docs: `docs/reference/api.md` (new endpoint, `on_home` fields), `docs/user-guide/` (where
  to put a shortcut on Home).
- Rules passed through: `design-decisions.md` (drive boundary), `backend-conventions.md`
  (migrations, config import), `frontend-conventions.md`, `DESIGN.md`.

## Invariants

I1. `GET /api/drives/{drive}/home-shortcuts` returns only Smart Folders, pins and
collections whose `drive` is `{drive}`; a row of another drive never appears, and a `PUT`
naming another drive's id answers 404 and changes nothing.
I2. A Smart Folder or collection that has been deleted, or a folder that has been unpinned,
never appears in the `GET` response or on Home; pinning the folder again leaves it off Home.
I3. `PUT` with `on_home: true` on a target already on Home leaves its `home_added_at`
unchanged, so its position on Home does not move.
I4. The `GET` response is ordered by `home_added_at` ascending, and Home draws the
shortcuts in that order, after every addon entry and before the Inbox entry.
I5. Each shortcut tile links to the same destination the sidebar uses for that item
(`smartFolderHref`, `pinHrefFor`, `/drive/{drive}/collections/{id}`).
I6. Home never draws another drive's shortcuts: a response for a drive other than the one
shown, or for an older page load, is discarded.
I7. A failed `GET` on Home leaves every other entry and row as it would be without the
feature, and alone never produces `home-unavailable`.
I8. A failed `PUT` leaves the page's `on_home` for that target as it was and shows
`homeShortcutFailed`.
I9. The migration only adds the nullable `home_added_at` columns; existing rows keep every
value and start off Home.
I10. Renaming a Smart Folder or collection, or changing a collection's items, leaves its
`home_added_at` unchanged.

## Checked, no action

- **Any folder, not only pinned ones**: rejected with the user. A shortcut on an unpinned
  path would need its own detection of renamed or deleted folders.
- **Placing from the sidebar's menus**: rejected with the user. The sidebar rows open their
  menu only on `contextmenu`, which iOS does not fire on a long press, so it would work only
  on a computer; the destination pages' `…` menus work everywhere.
- **Per-device storage (localStorage)**: rejected with the user; the shortcut would have to
  be placed again on every device, and the phone, where it matters most, cannot reach the
  sidebar menus.
- **Per-viewer shortcuts**: Smart Folders, pins and collections are shared within the drive
  and listed without a viewer filter, so their shortcuts are too.
- **A limit on the number of shortcuts**: none, with the user. The viewer removes what they
  no longer want.
- **Reordering shortcuts**: not offered. They keep the order they were placed in; removing
  and placing again moves one to the end.
- **Removing a shortcut from the tile itself on Home**: not offered; the tile is a plain
  link like the other entries. Removal is on the destination page.
- **Live update of Home when a shortcut changes elsewhere**: not added; Home picks it up on
  its next load.
- **Pins left pointing at a renamed folder**: existing behaviour of pins, unchanged here.
- **Design artifact**: the change adds tiles in the existing entry-tile style and menu rows
  in the existing menu-row style, and no new screen; whether a design artifact is needed is
  asked at approval.
- **A tile for a Smart Folder keeps its sort**: `smartFolderHref` carries `q`, `type` and
  `smart_folder_id`, as the sidebar's link does; the search page applies the saved sort
  from the Smart Folder as it does today.
