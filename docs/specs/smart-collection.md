# Smart Folders become Smart Collections

SPEC-ID: SPEC-CORE-106
SPEC-ID: SPEC-CORE-107
SPEC-ID: SPEC-CORE-108

Approval: sha256:9668bed455fb686115f86df9f4757f1f9b987b609a6bf4d7a25e377e4a7694da Yuichi Senga 2026-11-14

## Summary

A Smart Folder is a saved search. Litloft also has real folders (pins sit next to Smart
Folders in the sidebar), so "folder" suggests a place a file lives. The feature is
renamed **Smart Collection** (ja: スマートコレクション), matching how playlists became
collections. Collections and Smart Collections are both sets of one drive's files,
shared by everyone who uses the drive; they differ only in how the files are gathered.
So the sidebar shows them under one **Collections** heading, ordered by name with the
existing drag reordering kept, and a name is unique across both kinds within a drive.

- **SPEC-CORE-106**: every user-visible string and every user-facing doc says Smart
  Collection, and a Smart Collection has one icon everywhere. Identifiers do not change.
- **SPEC-CORE-107**: one sidebar section holds both kinds.
- **SPEC-CORE-108**: a name is unique per drive across collections and Smart Collections,
  compared the way `in:` compares names.

Making a Smart Collection usable everywhere a collection is (`in:`, the 「＋ 条件」
collection list, Play, Ask here, MCP) is a separate spec. Listing collections in an app's
Target menu is another.

## Agreed design

Artifact: https://claude.ai/artifact/JGL7X7wEuJSKxmo9FBuZKY (version 4). Saved in
`docs/process/reviews/feature-smart-collection/design/` (`canvas.json`, `Main.dc.html`,
`Conflict.dc.html`). Both artboards load `./support.js`, the canvas runtime, which is
not part of the design and is not saved.

Visible decisions:

- D1. `Main.dc.html`, 統合後: one heading コレクション with its collapse chevron on the
  left and ＋ on the right. No スマートフォルダ heading.
- D2. Rows of both kinds in one list, in name order: icon (16px), name, and for a
  collection only the item count at the right. A collection has `Library`; a Smart
  Collection has `ListFilter` and no count. Both rows have the collection row's shape. No
  row is highlighted as current (as today).
- D3. `Conflict.dc.html`, サイドバーで作成: the inline input stays open below the
  heading holding the typed name, with a danger-colored outline, and a 12px
  danger-colored line under it: 同じ名前のコレクションがあります.
- D4. `Conflict.dc.html`, 検索から保存: the save dialog as today (Star icon and title
  スマートコレクションを保存, close button, in save mode the description line
  現在の検索条件を保存します。, 名前 label, Cancel and Save) with the name field's border
  in the danger color, the same line under the field, and Save in its enabled look. The
  artboard leaves out the description line; it stays.
- D5. The other name inputs (sidebar rename, `CollectionPicker`, the collection page
  title) are not drawn; they follow the placement rule in SPEC-CORE-108 step 4.

## Required items

### 1. Normal flow

**SPEC-CORE-106 (wording and icon).**

1. Every string in `frontend/src/messages-core/ja.json` and `en.json` that names the
   feature says スマートコレクション / Smart Collection (Smart Collections, and smart
   collection in running text, following the case the string already uses).
2. The same holds for every page under `docs/` other than `docs/specs/`,
   `docs/process/reviews/` and `docs/developer-guide/reviews/` (records of past work),
   and for the core `README.md`, `DESIGN.md` and the photo_diary addon's `README.md`.
   This includes `docs/README_ja.md` and `docs/addons/media-import.md`. Beyond the word:
   - the user guide describes one Collections section holding both kinds
     (`file-browsing.md`, `search.md`, `playlists-favorites.md`), and states that a name
     is unique within a drive across collections and Smart Collections, ignoring case;
   - a renamed heading keeps every link to it working (`search.md`'s "Saving as a Smart
     Folder" and the link to it from `playlists-favorites.md`);
   - `docs/reference/api.md` lists the `409` on all four write routes of SPEC-CORE-108
     step 2.
3. A Smart Collection is drawn with the lucide `ListFilter` icon wherever it has one: the
   sidebar row, its Home shortcut (`HomeAppEntries`), and its row in the search jump list
   (`useJumpDestinations`).
4. Unchanged: the API paths (`/api/drives/{drive}/smart-folders`), the table
   `smart_folders`, the response field names, the backend error details (`Smart folder
   not found` and the schema validation messages), TypeScript types and functions
   (`SmartFolder`, `getSmartFolders`, `useSmartFolders`, `smartFolderHref`), the i18n
   namespace and key names (`smartFolder.*`), the search URL parameter `smart_folder_id`,
   the slot prop `smartFolderId` (read by the intelligence addon), the Home shortcut kind
   `smart_folder`, localStorage keys other than those named in SPEC-CORE-107, the MCP tool
   names, and the URL a Smart Collection opens. A "smart folder" written with `-` or `_`,
   or inside a code span, is one of these identifiers, not the term.

**SPEC-CORE-107 (one section).**

1. With a drive open, the sidebar shows one section headed コレクション / Collections.
   It holds the drive's collections and Smart Collections as rows of one list. There is
   no Smart Folders section.
2. A collection row is drawn as today: `Library` icon, name, item count. A Smart
   Collection row has `ListFilter`, the name, and no count. Both rows use the collection
   row's shape (`rounded-lg`).
3. Clicking a collection row opens the collection page; clicking a Smart Collection row
   opens its search page, as today.
4. Order:
   - With no saved order for the section, rows are in name order: the UI locale's
     collation, numeric (`Intl.Collator(locale, { numeric: true })`); on equal names a
     collection comes before a Smart Collection, then by id in code-unit order (`<`).
   - Dragging a row by its handle reorders the list, and the order is saved per drive in
     localStorage under `sidebar:order:collections-all:<drive>`. Each entry is
     `collection:<id>` or `smart:<id>`.
   - A row that is not in the saved order (a new collection or Smart Collection, or one
     created on another device) is inserted right after the nearest row that precedes it
     in name order and is already placed, or first when there is none. This is what
     `mergeOrder` (`frontend/src/components/sidebar/orderMerge.ts`) does when given the
     rows in name order.
   - A renamed row stays at its saved position. With no saved order it takes its new
     name's position, by the first rule.
   - A saved entry whose row is absent (deleted, or its list has not loaded or failed to
     load) is not drawn. A drag writes the drawn order followed by those absent entries in
     their saved order, so an entry is never removed from storage by a write made while
     its row is absent.
   - The per-kind keys `sidebar:order:collections:<drive>` and
     `sidebar:order:smart-folders:<drive>` are no longer read. They are not deleted.
5. The heading keeps its ＋ button, which creates a collection inline as today. A Smart
   Collection is still created from a search.
6. A collection row accepts files dropped on it (adds them, as today). A Smart Collection
   row does not accept a file drop: it does not take the drop and adds nothing.
7. Each row keeps its own context menu: a collection row renames inline and deletes as
   today; a Smart Collection row opens the rename dialog and the delete confirmation as
   today. While a collection row is being renamed inline it has no drag handle, as today.
8. The section is shown whenever a drive is open, also when the drive has no collection
   and no Smart Collection (as the collections section is today).
9. The merged section uses the `collections` section id for section order and collapse.
   A saved section order or collapse state that names `smart-folders` is ignored for that
   id; the other sections keep their saved positions.

**SPEC-CORE-108 (unique names).**

1. A name is in use in a drive when a collection or a Smart Collection of that drive,
   other than the one being created or renamed, has a name equal to it after Python
   `str.lower()` on both sides. Names reach this check already trimmed by the schemas.
   This is the comparison `in:` uses (`normalize_collections` and the collection
   resolution in `backend/app/routers/drives.py`).
2. `POST /api/drives/{drive}/collections`, `PUT .../collections/{id}` with a `name`,
   `POST /api/drives/{drive}/smart-folders` and `PATCH .../smart-folders/{id}` with a
   `name` answer `409` with detail `Name already in use` when the name is in use, and
   write nothing (no field of the request is applied). The collections routes' former
   detail `Collection name already exists` is replaced by this one.
3. Because the item itself is excluded, renaming an item to its own name in another case
   (`trip` → `Trip`) succeeds unless a different item matches. A `PUT` / `PATCH` without
   `name`, or with the item's unchanged name, is not checked.
4. In the frontend, a name input handles a `409` as follows:
   - The input (or dialog) stays open and holds what was typed. A line under it says
     同じ名前のコレクションがあります / A collection with this name already exists, in the
     danger color; the input is marked `aria-invalid` and described by the line.
   - Placement, at every path: the line is 12px text directly under the input's row,
     as wide as that row (in `CollectionPicker`, under the row holding the input and the
     Create button), and the input's border or outline turns the danger color (D3, D4).
   - Focus returns to the input, with the caret at the end of the text.
   - The path's existing failure feedback is not shown for a `409`: no toast
     (`useCollectionManagement`, `CollectionDetail`), no banner (`saveFailed` /
     `renameFailed`), and `CollectionDetail` does not reload.
   - The dialog's Save keeps its enabled look in this state.
   - Leaving the input (blur) does nothing in this state: nothing is sent, nothing closes.
   - Enter, or the dialog's Save, with the text unchanged since the `409` does nothing.
   - A keystroke that changes the text removes the line and `aria-invalid`; the next
     submit is sent as usual.
   - Escape, or the dialog's Cancel or close, closes the input and discards the text.
     Opening it again starts clean.
   - While a submit is in flight the input stays shown and is read-only, the dialog's
     Cancel and close and the input's Escape are ignored, and a second submit from the
     same input (Enter, or the blur that follows) is not sent. The text compared for
     "unchanged" is the text that was sent.
5. The paths that take a name, all covered by step 4:
   1. Sidebar inline create (the heading ＋).
   2. Sidebar inline rename of a collection row.
   3. The create field of `CollectionPicker`, whichever host opens it (`SelectionBar`,
      `FileContextMenu`, `FileActions`).
   4. The collection page's title edit (`CollectionDetail`). The editor stays open and
      read-only while the request runs (today it closes first), so on a `409` it is
      already open with the typed name; on success it closes as today. Its description
      edit is not a name and is unchanged.
   5. The Smart Collection save dialog in save mode, from the search page.
   6. The same dialog in rename mode from the search page's `…` menu.
   7. The same dialog in rename mode from the sidebar row's context menu.
6. Any failure other than `409` (a `422`, a `5xx`, a network error) behaves as it does
   today at that path and never shows the name-in-use line.
7. Existing duplicates are not renamed or changed. While both exist, `in:` keeps
   resolving as it does today.

### 2. Failure cases

- The list of collections or Smart Collections fails to load: the section shows the
  rows it has; the saved order keeps the entries of the rows it does not have (107
  step 4).
- localStorage is unavailable or holds something that is not an array of strings: name
  order is used, and a drag still reorders for the session.
- A create or rename fails with anything other than `409`: unchanged (108 step 6).
- Two writes race with the same name from two tabs: out of scope (see Checked, no
  action).

### 3. States

**A row.** Idle; renaming (collection: inline input, no drag handle; Smart Collection:
dialog open); drag source (from idle only); file-drop target (collection rows only, from
idle). A Smart Collection row never enters the file-drop target state.

**A name input** (each path in 108 step 5):

| From | Event | To |
|---|---|---|
| closed | open | editing (empty, or the current name for a rename) |
| editing | submit (Enter / Save, or blur where blur submits today) with a name the path accepts today | submitting |
| editing | submit with an empty name (or, in the rename dialog, the unchanged name) | as today at that path: the sidebar inputs close; the picker's Create and the dialog's Save stay disabled and nothing happens; the title edit keeps today's behavior |
| editing | Escape / Cancel / close | closed |
| submitting | submit, blur, Escape, Cancel, close, typing | submitting (ignored; the input is read-only) |
| submitting | success | closed, as today |
| submitting | `409` | in use |
| submitting | other failure | as today at that path |
| in use | blur | in use |
| in use | submit with the text that was sent | in use (nothing sent) |
| in use | keystroke changing the text | editing |
| in use | Escape / Cancel / close | closed, text discarded |
| in use | the heading ＋ pressed again (sidebar create) | in use, focus to the input, text kept |
| in use | the section collapsed, then expanded | in use, text kept |
| in use | rename started on another sidebar row | that row's rename opens; the in-use input closes, text discarded |
| in use | the drive changes | closed, text discarded |
| in use | the `CollectionPicker` host closes | closed, text discarded |

Opening an input after it closed always starts in editing, with no line.

**The section.** Expanded or collapsed (stored under the `collections` id).

### 4. Data read and written

- `collections`, `smart_folders`: the drive's names read on each create and rename.
  Written as today. No schema change, no migration.
- localStorage: `sidebar:order:collections-all:<drive>` read and written. The two
  per-kind order keys are no longer read.

### 5. External services

None: the change makes no call outside the core's own API and the browser's storage.

### 6. Authorization

Unchanged. Every endpoint keeps its `_validate_drive` / `check_drive_access` check. The
uniqueness check reads only the drive the request already passed.

### 7. Effect on existing features

- `in:` resolution, the 「＋ 条件」 collection list, apps' Target menus, Home shortcuts,
  the search jump list, MCP: unchanged in behavior; their visible wording and icon follow
  SPEC-CORE-106.
- The collections routes' `409` changes: it now also fires for a case-insensitive match
  and for a Smart Collection's name, and its detail becomes `Name already in use`.
  An MCP `create_playlist` or API client that created `trip` next to a collection `Trip`
  now gets `409`.
- The Smart Collection overwrite from the search page (`update(id, { query, file_type })`,
  no `name`) is not checked, so it still works over a legacy duplicate.
- The collections table's `uq_collections_drive_name` constraint stays.
- Settings' sidebar reset (`SidebarResetSection`) removes every `sidebar:order:*` key, so
  it clears the merged order (rows return to name order) and the two old keys. That is
  unchanged and intended; "never removed by a write" in SPEC-CORE-107 step 4 is about a
  drag.
- Backend tests that assert `Collection name already exists` change to the new detail.
- photo_diary: only its README wording. Its code uses the unchanged identifiers.

### 8. Error behavior

Covered in 108 steps 4 and 6 and in 2. Nothing new is logged.

### 9. User-visible behavior

- The words スマートフォルダ / Smart Folder no longer appear in the UI or the user-facing
  docs.
- One Collections section; Smart Collection rows have `ListFilter` and no count; Home
  shortcuts and jump-list rows for a Smart Collection have `ListFilter` too.
- First view after the change: rows in name order (earlier drag orders of the two old
  sections are not carried over).
- The name-in-use line under the input (D3, D4).

### 10. Non-functional

- The sidebar sort is over the drive's collections and Smart Collections (tens), done on
  the client. The uniqueness check reads two name lists of one drive per write.
- Layout, measured in a real browser (`frontend/e2e-layout/` or
  `frontend/e2e-components/`), at 1440px (sidebar) and 375px (the sidebar drawer):
  - mixed rows: a long name truncates inside its row, and a collection's count stays
    visible at the right;
  - the inline input in the in-use state: the line under it wraps inside the sidebar's
    width, and nothing scrolls horizontally.
  - At 375px also: `CollectionPicker` and the collection page title in the in-use state;
    the line sits under the input's row inside the viewport, with no horizontal scroll.

## Touch points

- `backend/app/routers/collections.py` (create, update: the name check, the `409`
  detail)
- `backend/app/routers/smart_folders.py` (create, update: the name check)
- a shared name-check helper in `backend/app/services/` (new)
- `backend/tests/` (tests for the check)
- `frontend/src/components/Sidebar.tsx` (sections list, `REORDERABLE_SECTIONS`)
- `frontend/src/components/sidebar/SidebarCollectionsSection.tsx`,
  `SidebarSmartFoldersSection.tsx` (merged into one section), `useSidebarItemOrder.ts`,
  `orderMerge.ts`, `useCollectionManagement.ts`, `useSidebarSectionOrder.ts`,
  `useSidebarSectionCollapsed.ts`, `useReorderableDnD.ts`
- `frontend/src/components/CollectionPicker.tsx`, `CollectionDetail.tsx`,
  `SmartFolderSaveDialog.tsx`, `SmartFolderSaveButton.tsx` (409 handling)
- `frontend/src/components/home/HomeAppEntries.tsx`,
  `frontend/src/components/search/useJumpDestinations.ts` (icon)
- `frontend/src/lib/api.ts` (a typed `409` from the four write calls)
- `frontend/src/messages-core/ja.json`, `en.json`
- frontend tests and e2e fixtures that assert the old wording, the old icon or the two
  sections (`frontend/src/**/__tests__/`, `frontend/e2e-components/`,
  `frontend/e2e-layout/`); replaced by tests citing these SPEC-IDs, not deleted
- `docs/user-guide/` (file-browsing, overview, playlists-favorites, reading, search,
  video), `docs/reference/api.md` (wording, the `409`), `docs/ADDON-DEVELOPMENT.md`,
  `docs/README_ja.md`, `docs/addons/media-import.md`, `DESIGN.md`, `README.md`
- photo_diary repository: `README.md` (its own PR)
- Rules passed through: `.claude/rules/design-decisions.md` (drive-partitioned tables,
  drive boundary), `.claude/rules/backend-conventions.md` (migrations: none here),
  `.claude/rules/frontend-conventions.md` (DESIGN.md, translation files)
- No protected path is edited.

## Invariants

I1. No value in `frontend/src/messages-core/ja.json` or `en.json`, and no page in the
SPEC-CORE-106 step 2 set, contains スマートフォルダ or "smart folder" (with a space) in
any letter case; and a Smart Collection's sidebar row, Home shortcut and jump-list row
all draw `ListFilter`, with no count on the sidebar row.

I2. These are the same as before the change: the API paths under `smart-folders`, the
`smart_folders` table, the response field names, `SmartFolder`, `getSmartFolders`,
`useSmartFolders`, `smartFolderHref`, the `smart_folder_id` URL parameter, the
`smartFolderId` slot prop and the `smart_folder` shortcut kind.

I3. With a drive open, the sidebar has exactly one section holding collection rows and
Smart Collection rows; it is shown when the drive has neither; its ＋ creates a
collection; a collection row renames inline and a Smart Collection row renames and
deletes through its dialogs; its collapse state is stored under `collections`; and a
saved section order naming `smart-folders` leaves every other section's relative
position unchanged.

I4. With no saved order, the section's rows are in `Intl.Collator(locale, { numeric:
true })` order of their names whatever their kind, a collection before a Smart
Collection on equal names, then by id in code-unit order.

I5. A drag reorder survives a reload; a row added afterwards appears right after the
nearest row that precedes it in name order (first when none does); a renamed row keeps
its saved position; and a drag made while one list is absent keeps that list's saved
entries in storage.

I6. A file dropped on a Smart Collection row adds nothing anywhere; a file dropped on a
collection row is added to that collection.

I7. A create or rename of a collection or Smart Collection whose name equals, after
`str.lower()` (non-ASCII letters included), the name of another collection or Smart
Collection of the same drive is answered `409` `Name already in use` and changes no field
of any row; the same name in another drive is accepted.

I8. Renaming an item to its own name in another case succeeds when no other item
matches, and a `PUT` / `PATCH` without `name` succeeds even while a duplicate exists.

I9. After a `409` at any path in SPEC-CORE-108 step 5, the input is open, focused, holds
the typed text, is `aria-invalid` and shows the name-in-use line, and no toast or banner
appears; a blur or an unchanged resubmit sends nothing; the next text-changing keystroke
removes the line; Escape or Cancel discards the text and the next open starts clean.

I10. One submit sends at most one request: a second submit or the following blur while
one is in flight sends nothing. A create or rename failure other than `409` never shows
the name-in-use line.

## Checked, no action

- Renaming identifiers (API paths, types, table, i18n keys, MCP tools, backend error
  details): the user chose wording only. A rename would break photo_diary (its CI builds
  against develop) and MCP clients, and renaming the table is a breaking migration.
- Renaming existing duplicates: the user's data has none, and `in:` already resolves a
  duplicate name to every matching collection.
- A DB constraint for uniqueness across the two tables: not expressible as a single
  constraint; the check is in the routers. A race between two simultaneous writes of the
  same name is out of scope for a single-user tool.
- Counts on Smart Collection rows: agreed not needed; counting needs evaluating every
  Smart Collection on each sidebar render.
- Carrying the two old drag orders into the merged one: the user chose name order with
  drag; interleaving two hand orders has no natural answer, so the merged list starts in
  name order once.
- Deleting the old localStorage keys, or pruning absent entries from the merged one:
  harmless to leave (tens of short strings), and pruning is what loses positions when a
  list fails to load.
- Absent entries written after the drawn ones (SPEC-CORE-107 step 4): when the missing
  list loads again, its rows sit at the end rather than where they were. Accepted: it
  needs a drag during a load failure, and the rows are kept, only moved.
- A current-row highlight in the section: none exists today and the agreed design draws
  none.
- Target menus: their rows have no per-kind icon, so SPEC-CORE-106 step 3 does not reach
  them. The search field icon in `ManageTargetsDialog` is a search affordance, not the
  Smart Collection icon.
- Smart Collections in `in:`, 「＋ 条件」, Play, Ask, MCP, and collections in app Target
  menus: separate specs.
- Search jump list order (pins, collections, smart collections): kept; it is not a
  sidebar section.
