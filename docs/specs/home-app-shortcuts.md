# Home shortcuts that open an app with a Target

SPEC-ID: SPEC-CORE-153
SPEC-ID: SPEC-CORE-154
SPEC-ID: SPEC-ADDON-157

Approval: sha256:8a3fc2c0a1bd84aa50b45215780fde9f349ca53144bf79ae78638b9980db3128 Yuichi Senga 2026-11-20

## Summary

A viewer can put "an app with one of its Targets" on the drive's Home entry row, for
example Clips with the レシピ collection, and open that app on that Target in one tap.
The apps are the purpose views the project ships (Video, Reading, Notes, Clips); the
viewer picks among them and their Targets and defines nothing new: no name, no icon,
no app of their own.

- **SPEC-CORE-153** — the store and the Home tile: a new shortcut kind `app_target`
  in `GET/PUT /api/drives/{drive}/home-shortcuts`, kept in a new table, drawn on Home
  with the app's own icon and the label `<app>・<target>`.
- **SPEC-CORE-154** — the core apps (Video, Reading) open on the Target named by
  `?target=<id>`, and `TargetMenu` gains the Put on Home / Remove from Home row.
- **SPEC-ADDON-157** — Notes and Clips (knowledge) open on `?target=<id>` and pass
  their Home entry key to `TargetMenu`.

Opening an app from a shortcut is the same as choosing that Target in the app's Target
menu: the Target is saved, and the app keeps it the next time it is opened plainly.

## Required items

### 1. Normal flow

**Put on Home.**
1. In Video, Reading, Notes or Clips, the viewer opens the Target menu while a Target
   other than the default is in force.
2. The menu shows ホームに置く / Put on Home (or ホームから外す / Remove from Home when
   this app and Target are already on Home), after the separator and before 管理….
3. Choosing it sends `PUT /api/drives/{drive}/home-shortcuts` with
   `{kind: "app_target", app: <entry key>, id: <target id>, on_home: true}` and closes
   the menu. Remove from Home sends the same with `on_home: false`.

**Open from Home.**
1. Home lists the shortcut among the drive's other Home shortcuts, in the order they
   were placed. The tile has the app's icon and the label `<app label>・<target name>`
   (en `<app label> · <target name>`).
2. The tile links to the app entry's own href plus `?target=<id>` (URL-encoded):
   `/drive/{d}/apps/video?target=collection%3Aab12…`,
   `/drive/{d}/addons/knowledge/clips?target=…`.
3. The app reads `target`, waits for the list that resolves it (the collection list for
   `collection:<id>`, the Smart Folder list otherwise), and when the id resolves to a
   usable Target of this drive:
   - saves it as the app's Target (`writeAppTarget` / the app's prefs), exactly as a
     choice in the Target menu does;
   - puts it in force with that Target's saved view (SPEC-CORE-145);
   - in Video and Reading, when it differs from the Target saved before, resets the tag
     and state filters, as a Target choice does (SPEC-CORE-147 I5); in Clips and in the
     Notes Library it is a Target change as SPEC-CORE-145 and SPEC-ADDON-151 define it
     (drops `tag` / `trust`, puts the new Target's `group` / `sort`), which on the tile's
     URL, carrying none of them, leaves only the fill-in;
   - removes `target` from the URL with `router.replace` (no history entry). When the
     landing also needs the Notes or Clips view fill-in (SPEC-CORE-145), the removal is
     part of that same replace; otherwise (Home face, an empty Target, an empty drive)
     it is a replace of its own that removes only `target`.
4. Back from the app returns to Home.

**Entry key.** Each app passes `TargetMenu` the key of its own Home entry, through a new
optional prop `homeEntry`:
- Video `video`, Reading `reading` (their `builtinApps` ids);
- Notes `knowledge`, Clips `knowledge/clips` (the keys `addonNavEntries` gives their
  manifest navigation entries), passed by the knowledge addon itself.

`?target=` is read on the app's root route only: Video and Reading pass it from
`apps/{video,reading}/page.tsx` through `VideoApp` / `ReadingApp` into their hook; Notes
reads it on any view of `/drive/{d}/addons/knowledge`, Clips on any view of
`/drive/{d}/addons/knowledge/clips`. The Video and Reading See all pages
(`apps/{video,reading}/shelf`) never read it and leave it in the URL. See all and shelf
pages pass `homeEntry` too, so their Target menu has the row.

"Usable" is the app's own test, the `isUsable` it passes to `TargetMenu` (plus, in
Notes and Clips, not the `unavailableId`), checked before the write. A member Target
whose evaluation later ends `tooLarge` or `failed` has been applied (written); the app
then shows what it shows today for that saved Target.

Without `homeEntry` the menu has no Home row. Core stores and compares the key as an
opaque string and maps no key to an app; it never names an addon.

### 2. Failure cases

- **`PUT on_home:false` for an existing Target with no row** (a stale menu, a second
  Remove): 204, nothing changes.
- **`PUT` fails** (network, 404, 422): the toast `drive.homeShortcutFailed`; nothing
  else changes. The next menu open asks the server again.
- **The `GET` behind the menu row fails**: the row is not drawn for that open; the rest
  of the menu is unchanged.
- **`?target=` does not resolve** (not in this drive's list, its list failed to load, a
  Smart Collection that is unusable, `default`, an empty value): the saved Target stays
  as it was and is used; nothing is written; `target` is removed from the URL; no error
  is shown. The id is never sent to the backend.
- **The Target of a shortcut is deleted**: `GET` stops returning that shortcut, so it
  leaves Home and the menu row of any app shows Put on Home again if it were recreated
  (it cannot be: ids are fresh nanoids).
- **The app is hidden on the drive, its addon is not installed, or the addon's policy is
  off on the drive**: Home draws no tile for it. The stored row stays; when the app's
  entry is drawn again, its shortcuts come back in their place.
- **A Smart Collection becomes unusable after it was put on Home** (its query gains a
  negation, a duration or a date): the tile stays; opening it is the "does not resolve"
  case above.
- **A `GET` on Home fails**: as SPEC-CORE-100 I7, nothing else on Home changes.

### 3. States

Per (drive, entry key, target id): **off Home** (no row) → **on Home** (row with
`home_added_at`) on `PUT on_home:true`; **on Home** → **off Home** on `PUT
on_home:false`. A second `on_home:true` keeps the first `home_added_at`.

On Home, a shortcut is **drawn** only while its target row exists in the drive and its
entry key equals an entry Home is drawing; otherwise it is **stored, not drawn**.

The menu row per open: **not drawn** (no `homeEntry`, default Target, `GET` pending or
failed, a `PUT` in flight) → **Put on Home** or **Remove from Home** once `GET` answers.

`?target=` per app load: **pending** (its list is loading; no request carries a Target)
→ **applied** (written, then the existing fallback rules decide what is in force, as
after a menu choice; removed from the URL) or **ignored** (saved Target used, removed
from the URL). Not allowed: an ignored id applied later (a later retry of the list
applies the saved Target, never the ignored one); a pending id applied after the
viewer navigated to another page of the app (navigating away drops it, unwritten); a
pending id applied after the viewer chose a Target in the menu (the choice wins, the
pending id is dropped unwritten).

The pending id lives in the app's state from its first render, not in the URL, so the
app's own `replace` calls (fill-in, rewrite) do not drop it. It is dropped, unwritten,
by the viewer's navigation to another URL (a tab, a link, Back) and by a menu choice of a
different row. While it is pending the Target menu shows "…" with the pending id checked;
choosing that row does nothing.

While `?target=` is pending, every listing, shelf, count and tag-counts request is held,
the default Target's included, and the body shows its loading block; the viewer never
sees the drive's whole content before the chosen Target.

A stored, undrawn shortcut becomes drawn on the next Home load, not while Home is open.

The menu row is keyed by the Target in force (`selectedId`): no row while `selectedId`
is `default` (in Notes and Clips this includes a fallback from a saved Target that is
gone, `failed` or `tooLarge`; in Video and Reading such a Target stays selected and keeps
the row, as the menu shows it selected), and no row while the Target is still being
looked up.

### 4. Data read and written

An `app_target` item of the `GET` response is `{kind: "app_target", id: <target id as
saved, with the collection: prefix for a collection>, app: <entry key>, name: <the
target's current name>, query: null, file_type: null}`; every other kind has `app:
null`. A shortcut's identity is (`kind`, `app`, `id`): Notes and Clips on the same
collection are two shortcuts and two tiles.

- New table `home_app_shortcuts`: `id` (integer primary key), `drive`, `app`
  (String(64)), `target` (String(64)), `home_added_at` (not null, the same column type as the existing
`home_added_at` columns and written the same way, so one `GET` sorts all kinds together), with
  `UniqueConstraint("drive", "app", "target")`. Written by `PUT`; read by `GET`.
  Created by `init_db`'s `create_all` like any new table; `_migrate` needs no step.
- `smart_folders`, `collections`: read by `PUT` (does the target exist in this drive)
  and `GET` (does it still exist; its current name). Not written.
- localStorage: the app's Target key (`litloft.videoApp.*` prefs,
  `litloft.readingApp.*` prefs, `litloft.addon.<name>.target.<drive>`) is written when
  `?target=` is applied. View keys (`<prefix>.view.<drive>`) are read, never written by
  this path.
- The Video and Reading filter store (`appshell/libraryFilters.ts`) is reset when a
  different Target is applied.

### 5. External services

none — the change calls only the core backend.

### 6. Authorization

`GET` and `PUT` keep the existing checks of `routers/home_shortcuts.py`
(`_validate_drive` + `check_drive_access`): a locked drive answers 404. `PUT` resolves
the target only within `{drive}`, so another drive's Smart Folder or collection id
answers 404 and writes nothing. No viewer identity is involved; like the other
shortcuts, these are shared within the drive.

### 7. Effect on existing features

- Existing shortcut kinds (`smart_folder`, `pin`, `collection`) keep their behaviour.
  The `GET` order gains `app` as a last tie-break, which leaves their order unchanged.
- `HomeShortcutUpdate` gains `app`; existing callers send none and are unaffected.
- `TargetMenu`'s rows, order and Manage dialog are unchanged apart from the new row.
- The view per Target (SPEC-CORE-145), the filters (SPEC-CORE-147) and the Target
  fallback rules (SPEC-CORE-118/119) apply to an applied `?target=` as to a menu choice.
- The MCP server reads `home-shortcuts` nowhere; it is unaffected.
- The core PR lands with the knowledge pin as it is: Notes and Clips pass no
  `homeEntry` yet and show no Home row until the knowledge PR and the pointer bump.

### 8. Error behavior

- `PUT` failure: toast `drive.homeShortcutFailed` (the existing message), no log.
- `PUT` with `kind: "app_target"` and no `app`, an `app` outside the pattern
  `^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)?$` or longer than 64, or an `app` with
  another kind: 422. A target id not in this drive (including `default`): 404.
- An unresolvable `?target=`: nothing shown, nothing logged.

### 9. User-visible behavior

- Target menu (all four apps, desktop and phone): with a non-default Target in force,
  one row after the separator and before 管理…: ホームに置く / Put on Home, or ホームから
  外す / Remove from Home, in the same row style as 管理… with the lucide `House` icon
  for both. Not drawn for the default Target.
- Home: the tile sits among the Home shortcuts by placement time; icon is the app
  entry's icon; label `<app>・<target>` / `<app> · <target>`, following the common
  label rule (one truncated line ≤ 16rem from 36rem, two clamped lines below); the
  accessible name is the full label. The app label is the entry's current label and the
  target name is the Target's current name.
- Opening from Home lands on the app with the Target in force and its saved grouping and
  sort; the address bar ends without `target`.
- The sidebar and the jump palette show no app shortcuts.

### 10. Non-functional

- No limit on the number of app shortcuts (as SPEC-CORE-100).
- `GET` reads two more small tables per Home load; no N+1 (one query per table).
- The new table is drive-partitioned and keyed per drive.
- The migration only adds a table; an older build ignores it.

## Touch points

- `backend/app/models.py` — `HomeAppShortcut`.
- `backend/app/database.py` — unchanged (`create_all` creates the table); the schema
  change still makes the risk HIGH.
- `backend/app/schemas.py` — `HomeShortcutResponse.kind` gains `app_target` and an
  `app` field; `HomeShortcutUpdate` gains `app`.
- `backend/app/routers/home_shortcuts.py` — `GET` union and order, `PUT` for
  `app_target`.
- `backend/tests/test_home_shortcuts*.py` (including one `GET` that mixes an app
  shortcut with the older kinds), and a test that opens a database made before the
  change and finds every row kept and `home_app_shortcuts` created.
- `frontend/src/types/index.ts` — `HomeShortcut` gains `kind: "app_target"` and an
  optional `app?: string | null`, so existing fixtures keep type-checking.
- `frontend/src/components/appshell/AppHeader.tsx` — unchanged; it spreads
  `TargetMenuProps`, so `homeEntry` reaches the menu.
- `frontend/src/lib/api.ts` — `setHomeShortcut` accepts `app`.
- `frontend/src/components/home/HomeAppEntries.tsx` — the `app_target` branch of
  `shortcutHref`, its icon and label, the "drawn only with its entry" filter, and a
  React key that includes `app`.
- Frontend tests: `frontend/src/__tests__/homeShortcuts.test.tsx`,
  `homeAppEntries.test.tsx`, the `TargetMenu`, Video and Reading app tests, and the
  e2e-components fixture `frontend/e2e-components/fixtures/homeAppEntries.tsx`,
  `home-app-entries.cases.ts` and `home-app-entries{,-desktop}.spec.ts` (I10).
- `frontend/src/components/DriveHome.tsx` — passes what `HomeAppEntries` needs.
- `frontend/src/components/appshell/TargetMenu.tsx` — `homeEntry` prop and the row.
- `frontend/src/components/videoapp/` (`VideoApp.tsx`, `useVideoApp.ts`,
  `VideoAppHeader.tsx`, `VideoShelfPage.tsx`), `frontend/src/components/readingapp/`
  (`ReadingApp.tsx`, `useReadingApp.ts`, `ReadingAppHeader.tsx`, `ReadingShelfPage.tsx`),
  `frontend/src/app/drive/[name]/apps/{video,reading}/page.tsx` — read and remove
  `?target=`, pass `homeEntry`.
- `frontend/src/lib/appPrefs.ts`, `frontend/src/lib/appTarget.ts` — read only, unless
  a helper is needed.
- `frontend/src/messages-core/{ja,en}.json` — `appShell.putOnHome`,
  `appShell.removeFromHome`, `drive.appShortcutLabel`.
- `addons/knowledge/frontend/notesapp/useNotesTarget.ts`, `NotesPage.tsx`,
  `pages/clips.tsx`, `clipsapp/clipsUrl.ts`, Notes `library/libraryUrl.ts` — read and
  remove `?target=`, pass `homeEntry`.
- Knowledge tests carrying SPEC-ADDON-157: new
  `addons/knowledge/frontend/__tests__/notesTargetParam.test.tsx` and
  `clipsTargetParam.test.tsx`, plus `addons/knowledge/frontend/Page.tsx` (its `edit`
  replace keeps the pending id, as above).
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary,
  drive-partitioned unique keys), `backend-conventions.md` (migrations, config import),
  `frontend-conventions.md`, `DESIGN.md`.
- `addons/knowledge` gitlink: bumped in a later core PR after the knowledge PR merges;
  SPEC-ADDON-157 is implemented only with that bump.
- `DESIGN.md` — Home entry row: app shortcuts lead to the app, not to a sidebar row.
- Docs: `docs/reference/api.md` (home-shortcuts), `docs/user-guide/` (Home shortcuts
  page and the apps' Target section), `docs/ADDON-DEVELOPMENT.md` (`TargetMenu`'s
  `homeEntry`, `?target=`), `docs/addons/knowledge.md` (Notes/Clips `target`
  parameter).
- No protected path.

## Invariants

I1. `GET /api/drives/{drive}/home-shortcuts` returns an `app_target` shortcut only while
its row's `drive` is `{drive}` and its target exists in `{drive}` (`collection:<id>` a
collection of `{drive}`, any other id a Smart Folder of `{drive}`), with `name` equal to
that target's current name; a `PUT` naming a target outside `{drive}` answers 404 and
writes nothing.
I2. `PUT` with `kind: "app_target"` and `on_home: true` creates one row per (drive, app,
id) and leaves `home_added_at` unchanged when the row exists; `on_home: false` removes
it; a missing or malformed `app`, or an `app` with another kind, answers 422 and changes
no row.
I3. Home draws an `app_target` tile only when its `app` equals the key of a built-in or
addon entry that Home is drawing on that drive, and then links it to exactly that
entry's href followed by `?target=` and the URL-encoded id, with that entry's icon.
I4. Opening an app's root route (`/apps/video`, `/apps/reading`, any view of Notes' or Clips' route)
with `?target=<id>` sends no listing, shelf, count or tag-counts request carrying any
Target, the default's included, until the id has been applied or ignored; afterwards the requests carry the
Target the existing rules put in force after writing that id if it was applied, and
after the saved Target if it was ignored. The Video and Reading See all pages with
`?target=` behave as without it.
I5. A resolved `?target=` writes the app's Target key for that drive and no other key,
and puts in force the view saved for that Target; an ignored one writes nothing.
I6. After `?target=` is applied or ignored the URL has no `target`, the removal added
no history entry and kept every parameter a Target choice keeps, and in Notes and Clips the first
`replace` of the load (view fill-in, rewrite, or the removal alone) removes it and no
later one brings it back. A menu choice or a navigation while it is pending drops it
unwritten.
I7. In Video and Reading, applying a `?target=` that differs from the Target saved before
shows tag and state すべて; applying the Target already saved leaves the filters as they
were.
I8. `TargetMenu` with `homeEntry` and a non-default Target in force (`selectedId`) shows Put on Home
when `GET` lists no `app_target` for (`homeEntry`, that id) and Remove from Home when it
does, after the separator and before 管理…; with the default Target, without
`homeEntry`, before `GET` answers, after it fails, or while a `PUT` is in flight it shows
neither. A failed `PUT` from the row shows `drive.homeShortcutFailed` and changes no
stored Target, view or filter.
I9. An `app_target` tile's label is exactly `drive.appShortcutLabel` with the entry's
current label and the target's current name (ja `<app>・<target>`, en
`<app> · <target>`), and two shortcuts with the same id in different apps draw two
tiles.
I10. Measured in a real browser in containers 358 and 960px wide, with an app shortcut
whose target name is 80 characters: at 960px the tile is at most 16rem wide with a
one-line label that starts with the app's label; at 358px the label is at most two
lines; the tile's accessible name is the full label.
I11. `PUT` with `on_home: false` for an existing Target with no row answers 204 and
changes no row.
I12. Each app passes as `homeEntry`, on its root page and its See all and shelf
pages, the key of its own Home entry (Video `video`, Reading `reading`, Notes
`knowledge`, Clips `knowledge/clips`), so a shortcut put on Home from an app is drawn
with that app's icon and opens that app.
I13. The migration only adds `home_app_shortcuts`; every existing table and row keeps
its values.

I14. An `app_target` `PUT` writes only `home_app_shortcuts`: the target's own row keeps
its `home_added_at` and `updated_at`, and no Smart Folder, pin or collection shortcut
changes.

SPEC-ID map: SPEC-CORE-153 — I1, I2, I3, I9, I10, I11, I13, I14. SPEC-CORE-154 — I8 and
the Video and Reading parts of I4, I5, I6, I7, I12. SPEC-ADDON-157 — the Notes and Clips
parts of I4, I5, I6, I12.

## Revises

SPEC-CORE-100 I1. `GET /api/drives/{drive}/home-shortcuts` returns only Smart Folders, pins, collections and app shortcuts whose `drive` is `{drive}`; a row of another drive never appears, and a `PUT` naming another drive's id answers 404 and changes nothing.
SPEC-CORE-100 I4. The `GET` response is ordered by `home_added_at` ascending, ties by `kind`, then `id`, then `app` (null first) in string order, and Home draws the shortcuts it draws in that order, after every addon entry and before the Inbox entry.
SPEC-CORE-100 I5. Each Smart Folder, pin and collection shortcut tile links to the same destination the sidebar uses for that item (`smartFolderHref`, `pinHrefFor`, `/drive/{drive}/collections/{id}`), an app shortcut tile links to its app entry's href with `?target=<id>`, and every tile shows the item's current name.
SPEC-CORE-073 I2. The entry row lists Library, then every `builtinApps` entry in its order, then exactly `addonNavEntries(catalogue, drive, "primary")` in its order, then the drive's Home shortcuts in the order `GET /api/drives/{drive}/home-shortcuts` returns them, leaving out an app shortcut whose app entry is not drawn, then the Inbox entry when I3 allows it; each Library, app and addon link's href equals the sidebar row's href for the same entry.
SPEC-CORE-114 I2. A key listed in a drive's `hidden_entries` removes exactly that entry, and the app shortcuts whose `app` is that key, from that drive's Home entry row, and that entry from its sidebar navigation and jump palette.

## Checked, no action

- **Showing app shortcuts in the sidebar or the jump palette.** The existing Home
  shortcuts are on Home only; the sidebar already lists the apps.
- **Placing or removing from the Home tile.** As SPEC-CORE-100, the operation lives on
  the destination (here the Target menu).
- **A per-device store.** Shortcuts are drive-shared on the server, like the existing
  ones and like the collections and Smart Folders they point to.
- **Deleting rows when a target is deleted.** `GET` omits them and target ids are
  nanoids that are never reused, so a stale row cannot come back on another target.
- **The default Target as a shortcut.** It is the app entry itself; the row is not
  drawn and `PUT` answers 404.
- **`?target=` on shelf (See all) pages and Notes' other routes.** Only the app routes
  read it; the tile never links elsewhere.
- **A hand-typed `?target=` of a gone or other-drive id.** Ignored silently; it cannot
  overwrite a good saved Target.
- **The Notes URL contract (SPEC-ADDON-131 I8 as revised by SPEC-ADDON-147) and the
  Clips URL rules (SPEC-ADDON-148).** `target` is one more parameter read on load and
  removed; no listed parameter changes meaning.
- **A design artifact.** The human chose none: the tile and the menu row reuse the
  existing parts.
- **Validating `app` against the installed entries on `PUT`.** The backend does not
  know the frontend's entry keys; Home draws only shortcuts whose entry it draws.
