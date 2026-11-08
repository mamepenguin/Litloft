# Reading: a second built-in app, and the shelf and target changes it needs

SPEC-ID: SPEC-CORE-059
SPEC-ID: SPEC-CORE-060
SPEC-ID: SPEC-CORE-061
SPEC-ID: SPEC-CORE-062
SPEC-ID: SPEC-CORE-063

Approval:

## Summary

Inside one drive, the sidebar gains a **Reading** entry after Video: a purpose-built way into
the drive's books (PDF, EPUB and ZIP archives). Like Video it is a built-in app, a bundle of
a target (which files it works on), a view and an entry. Reading also needs four changes to
the shelves endpoint that the Video app shares, and one change to the Target menu that both
apps get.

- **SPEC-CORE-059**: the app's entry and target. The registry gains `reading`, the sidebar
  row, the routes `/drive/{drive}/apps/reading` and `.../shelf`, and the default target
  "All books": every active file whose kind is `pdf`, `epub` or `archive`. A smart folder may
  replace it, as in Video.
- **SPEC-CORE-060**: the shelves endpoint (SPEC-CORE-056) gains four things: the `epub` kind
  in the shared kind vocabulary; `by=all`, one shelf holding every matching file; a `watch`
  filter; and a folder classification that descends past a single common parent folder.
- **SPEC-CORE-061**: the Discover face: Continue reading, Not read yet, New.
- **SPEC-CORE-062**: the Library face: folder chips first, then tag, state, grouping and sort
  controls. The sort chosen in Library is carried to **See all**, in Reading and in Video.
- **SPEC-CORE-063**: the Target menu lists only a set of smart folders the viewer chose
  ("Manage…"), in both apps.

What a viewer files books under is the viewer's own: there is no automatic genre. The only
classifications are the folders the viewer made and the tags the viewer gave. The Library's
first-level choice is therefore folders; tags narrow within a folder or group it.

Out of scope: Music (needs artist and album metadata the backend does not hold); series
grouping from titles; a Notes target override; excluding magazines from New as a built-in
rule (a smart folder target does it). The viewer is one person on a PC browser; the phone
layout runs the same pages. The iOS app is not changed and not verified (see 10).

## Required items

### 1. Normal flow

1. The viewer is inside a drive. The sidebar shows **Reading** directly after **Video**.
   Choosing it opens `/drive/{drive}/apps/reading`. The header has the book icon tile, the
   title **Reading**, the scope line "<drive> · N books" and the **Target** button. N is the
   `count` of `shelves?by=all&per_shelf=1` under the target; while it loads, or if it fails,
   the scope line shows the drive name alone.
2. The page opens on the face last used in this drive (Discover on first use). Underline tabs
   **Discover** and **Library** switch faces without a page load; the face is saved per drive.
3. **Target and base condition.** The client always sends `type=` as the intersection of the
   app's base kinds {pdf, epub, archive} with the target's kinds, taken kind by kind: a base
   kind `b` stays when the target names a kind `k` with `k` equal to `b` or `kindHolds(k, b)`
   (`document` holds `pdf` and `epub`; `text`, `video`, `image`, `audio`, `other` hold none
   of them; `markdown` is read as `text`). Several `type` values in a target are OR'd, as the
   listing does. A target naming no kind keeps the base. The supported query parts are those
   with a listing parameter except `duration`: free text, `tag`, `type`, `folder`,
   `collection`, `size`, `favorite`, `liked`. A smart folder with any other part, `duration`
   and any negated operator included, is listed disabled in the menu and cannot be chosen.
   When the intersection is empty no request is sent and the empty state is drawn.
4. **Discover**, top to bottom, up to three shelves of at most 12 books, each from its own
   request, all under the target:
   - **Continue reading**: `shelves?by=watch&key=in_progress&sort=last_played&per_shelf=12`.
   - **Not read yet**: `shelves?by=watch&key=unwatched&sort=random&per_shelf=12`, a random
     sample, fetched when the page opens and kept while faces switch; drawn again on reload
     or retry. Without a profile the same shelf is the listing's random sample of all books
     under the target, `files?sort=random&limit=12`, as Video's Recommended is.
   - **New**: the listing, `files?sort=created_at&order=desc&limit=12`.
   Every listing request here sends no `path`, so it spans the whole drive, and carries the
   target's conditions. A shelf with no books is not drawn; Continue reading is not drawn
   without a profile. **See all** goes to the shelf page: Continue reading to
   `by=watch&key=in_progress`, Not read yet to `by=watch&key=unwatched` (no See all without a
   profile), New to `by=all&key=all` sorted newest first. The shelf page's title is the
   shelf's Discover name, the tag name for a tag shelf ("No tag" for `no_tag`), and "All
   books" for `by=all` opened from Library. Cards are portrait (2:3) covers: the thumbnail cropped to fill,
   a format badge (EPUB, PDF, or "Archive"), a two-line title, and a meta line
   "<last segment of its folder, the drive name at the root> · <relative `created_at`>"
   (a locale-formatted relative time such as "yesterday", "3 days ago"); only Continue reading cards carry a progress bar, from
   `watch_progress`. Choosing a card opens the book's normal file page, whose resume, reader
   and history behavior are the existing ones.
5. **Library** (SPEC-CORE-062). A row of chips: **All** first, then one chip per child folder
   of the folder classification's `base` (item 8), ordered by count descending then name,
   scrolling sideways when they do not fit. Below it, controls **Tag**, **State**, **Group**,
   **Sort**, then the books.
   - **The chip request** (`shelves?by=folder&per_shelf=1`) carries the target's conditions
     only, not Tag, State or the chosen chip, so the chip set and `base` stay put while the
     viewer narrows; a chip can lead to an empty grid, which shows the empty state. Chips
     are fetched `shelf_limit=24` at a time up to 120 chips; if a page fails the chips loaded
     so far stay and the row ends with a retry button; with none loaded the row is **All** and a
     retry. Past 120 chips the remaining folders' books are reachable under **All**.
   - Choosing a folder chip narrows the target to that folder's subtree (a chip is its full
     path key, NFC): the listing ORs several `folder` values, so the client intersects instead
     of appending. Each `folder` the target already carries stays when it lies inside the chip,
     is replaced by the chip when the chip lies inside it, and is dropped otherwise; with no
     `folder` in the target the chip is the only value; nothing left means the empty state and
     no request. **All** changes nothing. `tag` values the viewer picks are added to the
     target's (each must hold, as the listing does), and `watch` is sent once. Under By tag a
     book keeps one shelf per tag it carries, and the Tag filter only chooses which books. The chip resets to **All** whenever the page is opened afresh (navigation, reload,
     returning from See all) and whenever the target changes; it is not saved.
   - **Tag**: choose tags (the listing's `tag` parameter). **State**: All, Unread, Reading,
     Finished, sent as `watch=unwatched|in_progress|finished`; it needs a profile, and
     without one the control is not drawn and no `watch` is sent.
   - **Group**: **None** (default) or **By tag**. None is `shelves?by=all`, a paged grid of
     every matching book, 60 per page, loaded as the viewer scrolls. By tag is
     `shelves?by=tag`, shelves of 12 loaded 12 at a time as the viewer scrolls, the
     first 5 books each with the shelf's title, count and **See all**, tag-less books in a
     last shelf `no_tag`, a multi-tag book in each of its shelves. The choice is saved per
     drive. A change of any control supersedes a fetch still in flight; only the latest
     response is drawn.
   - **Sort**: Added newest first (`sort=created_at&order=desc`, default), Added oldest first
     (`created_at`, `asc`), Title (`title`, `asc`), Size (`file_size`, `desc`), the values the
     endpoint already takes. It orders the books inside every shelf and in the flat grid. It is
     not saved.
   - **See all** (By tag shelves; Group None is already the whole list) opens
     `.../apps/reading/shelf?by=<tag|all|watch>&key=<k>&sort=<id>` plus the
     `folder`, `tag` and `watch` conditions in force: a grid of that shelf paged 60 at a time
     under the same target, opening with the carried sort and keeping its own sort menu.
   - On the shelf page the Target menu is present; choosing another target keeps the key and
     re-fetches. A key that names no shelf, or a shelf the conditions leave empty, shows the
     empty state.
6. **Video** carries the same sort over: Library's **See all** passes the Library sort, and the
   shelf page opens on it.
7. **Target menu** (SPEC-CORE-063), in both apps. The menu shows the app's default ("All
   books", "All videos"; with its count), then the smart folders in the viewer's **shown set**,
   then **Manage…**. Manage… opens a dialog: a search field, a checklist of every smart
   folder of the drive (one the app cannot use is shown disabled and unchecked), and **Done**.
   A toggle takes effect at once. The set is per app and per drive. When nothing has ever been
   saved, the dialog shows every usable folder checked, and the first toggle saves the
   usable folders with that one flipped; an empty saved set shows none. When nothing has ever been
   saved, every usable smart folder is shown; once any set is saved, only its members are. The
   current target is listed in the menu even when it is not in the set, provided it is usable.
8. **Folder classification with a base** (SPEC-CORE-060, for both apps). For `by=folder`
   without `key`, the server computes `base` over the files that match the filters: start with
   `base = ""`; while no matching file has `folder_path == base` and the matching files'
   `folder_path` values all lie under exactly one child segment of `base`, append that
   segment to `base`. With no matching file `base` is `""`. The shelves are the child folders
   of `base`: one per next path segment, keyed by its **full folder path**, labelled by the
   segment; files whose `folder_path` equals `base` exactly form one more shelf, keyed
   `<base>/` for a non-empty `base` and `""` for the root (as today), labelled by the last
   segment of `base` (the client labels `""` with the drive name, as today). When all
   matching files lie in one leaf folder `a/b`, the single shelf is keyed `a/b/` and the chip
   row has only **All**. `base` and every key are NFC-normalised. With `base` `""` the shelves
   are exactly what the first-segment grouping gave. The response carries `base`. A key that
   ends in `/` matches that folder exactly; any other non-empty key matches the folder and its
   subtree, as today. Ordering stays count descending then name.
9. **Request and response additions** to `GET /api/drives/{drive}/shelves`:
   - `type` accepts `epub`, in the same vocabulary as the listing, the tree's `type_filter`
     and every other endpoint that takes `FileKindParam`: a file whose mime is
     `application/epub+zip`, or whose name ends `.epub` when the mime was never recorded.
     `document` still returns it. The Filter menu does not gain an entry; `type:epub` parses
     as a search operator. The folder card's kind roll-up keeps labelling an EPUB `document`.
   - `by=all`: one shelf, key `all`, empty label, `count` the matching total, `total_shelves`
     1, paged by `key=all` and `page` like any shelf. A `key` other than `all` is a 200 with
     an empty shelf (`count` 0, `items` `[]`). Without `key`, `items` are the first
     `per_shelf`. `sort`, `order`, `random` (only without `page`) behave as for every `by`.
   - `watch=in_progress|unwatched|finished`: a filter on every `by`, with the viewer's
     definitions; with no viewer identity 400 `viewer_required`. `by=watch` with a `watch`
     that excludes its key gives a 200 with that shelf empty, and an unkeyed `by=watch` lists
     only the shelves that still hold a file.
   - Response field `base` (string; `""` unless `by=folder` without `key`).
   Existing parameters, keys, orders and responses are otherwise unchanged.

### 2. Failure cases

- No backend answer or an error on one shelf: that shelf shows a retry and the others still
  draw (as Video). A 400 `viewer_required` hides the control or shelf that needed a profile.
- The target's smart folder was deleted, or has since gained a part the app cannot use: the
  app uses its default target and shows no notice; the saved id is left in storage and
  ignored, and the menu does not list it as current.
- The intersection is empty: empty state, no request. A drive with no books, a folder chip
  or condition that leaves nothing, and a See all key naming nothing: the same empty state.
- The saved shown set is not valid JSON, not an array of strings, or names ids that no longer
  exist: invalid input is treated as "never saved"; unknown ids are ignored.
- A `watch` or `type` value outside its vocabulary is a 422 from the endpoint; the client
  never sends one, because stored values outside the vocabulary are replaced by defaults.
- Library: a failed first page of the flat grid or of the tag shelves shows an error with a
  retry; a failed later page shows a retry at the end of the list and keeps what is drawn;
  the Tag control, if its list fails to load, is disabled until reopened.
- A thumbnail that cannot be generated shows the card's placeholder; the book still opens.
- A locked or unknown drive: the Reading routes and its sidebar row follow what Video does
  (the drive layout's gate; the endpoint answers 404).

### 3. States

- Face: `discover` | `library`. Group: `none` | `tag`. Target: default or a smart folder id.
  Shown set: unset | a list of ids. Folder chip: `all` | a folder path. Each load: loading,
  loaded, empty, error. Any control may change in any state; a change re-fetches what it
  affects and supersedes a fetch in flight. Allowed and specific transitions: a target change
  resets the chip to All; clearing the profile removes State from the controls and from the
  request, and clears a chosen state; removing the current target from the set leaves it
  listed; a target change on the shelf page keeps the key; a shelf key that no longer exists
  shows the empty state.
- A book's reading state is the viewer's history row: `unwatched`, `in_progress`, `finished`
  (definitions in I4 of SPEC-CORE-054 and unchanged).

### 4. Data read and written

- Read: `files`, `tags`, `watch_history` (the viewer's rows), `smart_folders`. No table is
  written by the endpoint. No schema change.
- Written: `localStorage` only, per drive: `litloft.readingApp.face.<drive>`,
  `litloft.readingApp.group.<drive>`, `litloft.readingApp.target.<drive>`,
  `litloft.readingApp.targets.<drive>` (the shown set), and `litloft.videoApp.targets.<drive>`.
  Video's existing keys are unchanged. The sort and the folder chip are never stored; the
  sort and the conditions reach See all through its URL.

### 5. External services

None.

### 6. Authorization

The drive's existing access check on the shelves endpoint (locked drive: 404). Watch-based
parameters need the viewer identity cookie or header, as SPEC-CORE-056.

### 7. Effect on existing features

- Video changes in three ways that supersede the corresponding normal-flow text of
  SPEC-CORE-055, 056 and 057 (no invariant of those specs is weakened): its Folder shelves
  descend past a single common parent; its Target menu shows only the viewer's shown set
  (unset keeps showing every usable smart folder, so nothing disappears on upgrade); its
  **See all** opens on the Library's sort.
- Every endpoint that takes `FileKindParam` (the listing, the tree's `type_filter`, the
  folder and file-count routes, the shelves) accepts `epub`; every other kind returns what it
  returned. The folder card's kind label and roll-up are unchanged.
- `POST /api/internal/files/matching` takes `kinds` as `FileKindParam`, so it accepts `epub`
  without an edit to `internal.py`; the accepted values are documented in
  `docs/ADDON-DEVELOPMENT.md`. `FolderKind` (the folder card's vocabulary) does not gain it.
  The MCP server's kind enums and the Filter menu are unchanged.
- On the frontend `kindHolds("document", "epub")` is true; results of existing `type:document`
  scopes do not change, because the server's `document` already returns EPUB files.
- Video's first-segment keys in bookmarked See all URLs keep matching the same subtree; the
  shelf page titles a folder key by its last path segment.
- The file page, reader, resume and history writers are not touched.
- `by=folder` callers that sent first-segment keys get the same files for the same key.

### 8. Error behavior

As SPEC-CORE-056 and 057: per-shelf retry, empty states, an empty-state message when the
target is not usable. The endpoint logs nothing new. 422 and 400 bodies are FastAPI's.

### 9. User-visible behavior

- Text: **Reading** / 読む; Discover / 発見; Library / ライブラリ; Continue reading / 続きを読む;
  Not read yet / まだ読んでいない本; New / 新着; See all / すべて見る; All / すべて; Group /
  まとめ方; None / なし; By tag / タグ別; Sort / 並び順; State / 状態; Unread / 未読; In progress /
  読書中; Finished / 読了; Tag / タグ; No tag / タグなし; Retry / 再試行; Manage… / 管理…; Done / 完了; Target / 対象; All books / すべての本.
  Empty states: "No books" / 本がありません (nothing matches); "This target cannot be used" /
  この対象は使えません (the intersection is empty). Per-shelf error: the existing retry text.
  Count unit: 冊 / "books" ("706 冊", "706 books"). No emoji (lucide icons).
- Defaults: Discover; All chip; Group None; Sort Added newest first.
- A phone shows the same pages: the chip row scrolls, the cover grid has fewer columns.
- Layout and look follow `DESIGN.md` (underline tabs, pill chips, one accent fill).

### 10. Non-functional

- `base` is derived from the distinct `folder_path` values of the matching files, in one
  query; the endpoint stays read-only and drive-scoped.
- Limits of SPEC-CORE-056 stand (`per_shelf` ≤ 60, `shelf_limit` ≤ 24); the chip row stops at
  120 chips.
- Covers load lazily; nothing is fetched for shelves not drawn.
- The iOS app on a device is not verified (`agent_cannot_verify`). How a cropped PDF page or
  archive cover looks in a 2:3 card is a visual judgement for R-5.

## Touch points

- `backend/app/routers/drives.py`: `FileKind` gains `epub`, recognised by a new filter-only
  mime and suffix table that only `_kind_predicate` reads; `_KIND_MIMES`, `_KIND_SUFFIXES`,
  and the folder-card classifier (`_classify_kind`, `_classify_kind_parts`,
  `_suffix_kind_case`, `_FLAT_FOLDER_KINDS`) are not edited; every route that takes `FileKindParam` (the listing, `type_filter`, and the
  others in that file) takes the new value.
- `backend/app/routers/shelves.py`: `by=all`, the `watch` filter on every `by`, the folder
  `base` descent, the trailing-slash exact key, NFC `base`, response `base`;
  `backend/app/schemas.py`.
- `frontend/src/types` (`FileKind`), `frontend/src/lib/searchQuery.ts` (`FILE_KINDS`,
  `kindHolds`, `resolveKinds` use, operator parsing), the places that enumerate kinds for
  the Filter menu (no new menu entry), `docs/reference/api.md`, `docs/ADDON-DEVELOPMENT.md` (the values
  `/files/matching` accepts). `internal.py` and `schemas.py`'s `FolderKind` are read, not
  edited; `mcp-server/` is not changed.
- `frontend/src/lib/builtinApps.ts` (the `reading` entry), `driveViews.ts`,
  `sidebar/SidebarLibrarySection.tsx`, `libraryRowActive.ts`, the layout route checks.
- `frontend/src/app/drive/[name]/apps/reading/page.tsx` and `.../shelf/page.tsx` (new).
- `frontend/src/components/videoapp/` and a new reading component directory; the pieces both
  apps use (header, tabs, Target menu and Manage dialog, shelf block, paging hooks) become
  shared components parameterized by the app; the Video behavior outside the three changes
  in item 7 stays as it is.
- `frontend/src/lib/appPrefs.ts` (per-app key namespace; the shown set),
  `frontend/src/lib/api.ts` (`getShelves` params and `base`),
  `frontend/src/messages-core/ja.json`, `en.json`.
- Layout measurement of Reading's two faces on a narrow and a wide viewport: a new spec file
  under `frontend/e2e-layout/` with its fixture. Frontend tests are vitest files under
  `frontend/src`; neither lives on a protected path.
- Rules passed through: `design-decisions.md` (drive boundary, File state, Watch history),
  `backend-conventions.md`, `frontend-conventions.md`, `DESIGN.md`.
- Docs: `docs/user-guide/` (a Reading page; the Video page's Target and See all text),
  `docs/reference/api.md`, `docs/specs/INDEX.md`. Docs have no invariant of their own; no
  Internal API endpoint changes.
- Protected paths edited: none named in `docs/process/risk-and-human-review.md`
  (`internal.py` is a trust-boundary file and is not edited). The Watch
  filter reads viewer-scoped data; mutation review applies to it and to the `base` descent
  and exact-key paths.

## Invariants

SPEC-CORE-060 (endpoint):

I1. A shelves request of one drive never returns, counts or groups a file of another drive,
a locked or unknown drive answers 404, and the request changes no row, under every `by`
including `all`.

I2. Every file in a shelf's `items` and `count` is active and satisfies every filter sent
(`type`, `watch`, `folder` and the rest).

I3. A shelf's `count` equals the number of files its `key` returns across all pages.

I4. `type=epub` returns exactly the files whose mime is `application/epub+zip`, or whose name
ends `.epub` when no mime was recorded.

I5. A request of any other kind, and the folder card's kind label of every file, return what
they returned before `epub` was added.

I6. `by=all` yields one shelf, key `all`, whose count is the matching total and whose
`total_shelves` is 1.

I7. The `watch` filter and `by=watch` use one boundary: `finished` is a row with duration
above 0 and position at or above 90% of it, `in_progress` is duration above 0 and position
above 0 and below 90%, and everything else, including no row, is `unwatched`.

I8. `watch`, like `by=watch` and `sort=last_played`, with no viewer identity returns 400
`viewer_required` and no file data, and another viewer's history never changes which files it
returns.

I9. Under `by=folder` each matching file is in exactly one shelf, the shelves are the child
folders of the response's `base` keyed by full path, and files directly in `base` are in the
`<base>/` shelf (`""` at the root).

I10. `base` is `""` unless every matching file lies under one child segment of it with none
directly at that level, applied repeatedly; with `base` `""` the shelves and keys are the
first-segment ones.

I10a. A key ending in `/` matches that folder exactly while any other non-empty key matches
the folder and its subtree, and `base` and every key are NFC-normalised.

I10b. `by=all` with a `key` other than `all` is a 200 with an empty shelf, and `by=watch` with
a `watch` that excludes its key is a 200 with that shelf empty.

I11. Under `by=tag` a book is in one shelf per tag of this drive it carries, and in `no_tag`
only when it carries none.

SPEC-CORE-059 and 063 (entry, target, shown set):

I12. The `type` sent by the reading app is always a subset of {pdf, epub, archive}, and
`document` as a target keeps `pdf` and `epub`.

I12a. A target whose kinds do not intersect the app's produces no request and an empty state.

I12b. A smart folder with a query part the app does not support (`duration` and any negated
operator among them) cannot be chosen.

I13. **Reading** appears after **Video** and before the addon rows, is selected only on the
Reading routes, and leaves every addon's `navigation` entry in the same rows and order; the
core registry names no addon.

I14. The shown set is saved per app and per drive under its own key; never saved means every
usable smart folder is listed, a saved set lists exactly its members (an empty set lists
none), and the current target is listed whether or not it is a member.

I15. Manage… never changes the current target and writes no smart folder; a stored shown set
that is not a JSON array of strings is read as never saved, and ids not in the drive's list
are ignored.

I16. The face, group and target of Reading are saved per drive under the `litloft.readingApp`
keys, and Video's saved face, classification and target under `litloft.videoApp` still apply
unchanged.

I16a. A stored value that is unknown or stale falls back to its default without an error
screen and is never sent to the backend; a target whose smart folder is gone or unusable is
ignored while its saved id stays in storage.

I16b. The Library sort and the folder chip are never stored; the chip resets to All on a
fresh open and on a target change.

SPEC-CORE-061 and 062 (faces):

I17. Discover is Continue reading = the viewer's `in_progress` books by last played, Not read
yet = a random sample of `unwatched` books (all books under the target when there is no
profile), New = `created_at` descending, at most 12 each; an empty shelf is not drawn;
Continue reading is not drawn without a profile.

I18. Library's chips are All plus the child folders of `base` computed under the target
alone, by count descending then name, and choosing a chip narrows the target to exactly that
folder's subtree, never widening it past a `folder` the target carries.

I19. Group None lists books by `all` and By tag by `tag` with `no_tag` last, and Sort orders
the books inside every shelf and the flat grid.

I20. State is not drawn and no `watch` is sent without a profile, and clearing the profile
clears a chosen state.

I20a. When controls change quickly only the latest response is drawn.

I21. See all pages 60 at a time under the conditions in force, and opens on the sort Library
carried, in both apps.

## Questions for the human

- **Any ZIP is a book.** The `archive` kind is every ZIP, so a ZIP of something else counts as
  a book. The viewer narrows it with a smart folder target (for example `folder:Books`).
  Accept, or add a rule that an archive must hold images to be a book (needs an index read
  per archive; changes 1, 7 and I12)?
- **`epub` is a public kind.** It becomes searchable as `type:epub` and every endpoint that
  takes a kind accepts it, though the Filter menu does not list it. Accept, or keep it
  private to the app (a mime filter parameter instead; changes 9, I4 and I5)?
- **Progress bars.** Only Continue reading cards carry one (the shelves endpoint supplies
  `watch_progress` under `by=watch` only), so Library cards show none. Accept, or extend
  `watch_progress` to every `by` (changes 9 and the endpoint)?
- **Folder chips and loose files.** Books sitting directly in `base` have no chip; they are
  reachable under All. Accept, or add an Others chip (needs an exact-folder condition on the
  listing parameters; changes 5, I18)?
- **Empty-state wording** in item 9 (本がありません, この対象は使えません).

## Checked, no action

- **Genre as a concept.** Not a thing in the data. Folders and tags are the only sources;
  the UI says Folder or Tag.
- **Tag as a sort.** A book has several tags, so "sort by tag" has no single order; grouping
  by tag is the well-defined form, and Sort applies inside groups.
- **Series grouping.** Volumes of one series stay separate cards; Title sort keeps them
  adjacent. A grouping from titles needs title heuristics and is a separate decision.
- **Magazines flooding New.** A smart folder target that excludes the magazine folder is
  the way; no built-in rule.
- **A Library classification menu as in Video.** Folder, tag, month, length and watch state
  as peers was set aside: folder is the main, rarely crossing axis, tags refine it.
- **Server-side storage of the shown set.** Per-device, as every other app preference.
- **Cross-drive anything.** A drive is a security boundary; everything here is per drive.
- **User-defined apps, an app editor, Music, a Notes target override.** As SPEC-CORE-054.
- **Filter menu and MCP.** Neither lists `epub`; the Filter menu has its own list and the MCP
  enums are untouched, so no invariant is needed.
- **Revises.** No invariant of SPEC-CORE-054 to 057 changes; the Video changes in 7 alter
  normal-flow text only, so there is no `## Revises`.
- **Join cost of `watch` on every `by`.** The viewer's history is one row per file, so the
  join adds no duplicate rows; I3 and I11 catch an inflated count.
- **Random across pages.** `random` stays valid only without `page`, as SPEC-CORE-056.
