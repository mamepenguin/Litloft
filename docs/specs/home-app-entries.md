# Home: an entry row for the apps, and rows that resume across formats

SPEC-ID: SPEC-CORE-073
SPEC-ID: SPEC-CORE-074
SPEC-ID: SPEC-CORE-075

Approval:

## Summary

The Video, Reading, Notes, Ask and Photo Diary apps now each have their own entrance, so a
drive's Home no longer has to stand in for them. What only Home can do is resume work across
formats and send the viewer into an app. Below 1200px the sidebar is an overlay, so on a
phone, an iPad and a narrow window every app, Ask and the Inbox are two taps away and the
Inbox count is not visible. This change puts an entry row for the apps at the top of Home,
reorders the rows around resuming, and removes the Liked row.

- **SPEC-CORE-073**: the entry row. Library, the built-in apps and every addon's `primary`
  navigation entry, the same list the sidebar draws, plus the Inbox while it holds arrivals.
  The core's addon navigation icon table gains `images`.
- **SPEC-CORE-074**: the order and content of Home's rows. Recently Viewed leaves out what the
  Continue row holds, Favorites moves up, the addon row moves down, Liked goes.
- **SPEC-CORE-075**: `GET /api/drives/{drive}/watch-history?filter=not_continue`, the rows
  `filter=all` returns that `filter=continue` does not.

Agreed design: https://claude.ai/artifact/LgXPsQGLi7dsMZ4GZk7DvN, saved in
`docs/process/reviews/feature-home-app-entries/design/` (`canvas.json` and four `.dc.html`
artboards). The design draws the photo-diary tile with a box icon; with this change and the
addon's own declaration it draws `images` instead (agreed with the human).

## Required items

### 1. Normal flow

**Entry row (073)**

1. The viewer opens a drive's Home (`/drive/{drive}?view=home`).
2. Under the page header, before any row, Home draws a navigation region labelled アプリ /
   Apps holding one link per entry, in this order:
   1. ライブラリ / Library → `driveHref(drive, "library")`;
   2. each entry of `builtinApps`, in its order (動画 / Video, 読む / Reading) → `app.route(drive)`;
   3. each addon entry with `navigation.placement === "primary"` for this drive, ordered as
      `addonNavEntries` orders them (by `priority`, then name) → its `href`;
   4. 受信箱 / Inbox → `?view=inbox`, only while the drive's open arrival count is above 0,
      carrying the count (`99+` above 99).
3. Labels and icons are the sidebar's for the same entry: the built-in app's `labelKey` and
   `icon`, the addon's `slotEntryLabel(navigation, t)` and `ADDON_NAV_ICONS[navigation.icon]`
   with `package` for a missing or unknown token, the sidebar's `library` and `inbox` strings
   with FolderTree and Inbox.
4. `ADDON_NAV_ICONS` gains `images` (lucide `Images`). Photo Diary declares
   `"icon": "images"` in its own repository; that edit is outside this repository.
5. Activating an entry navigates there with the router (no full reload).

**Rows (074)**, top to bottom after the entry row:

1. 続きから / Continue (with a profile), unchanged from SPEC-CORE-069.
2. 最近見た / Recently Viewed (with a profile), from `filter=not_continue` with
   `limit=12`. Its See all stays `?view=recent`.
3. お気に入り / Favorites, unchanged request (`favorite=true`, `created_at` desc, 12).
4. The `drive-home-sections` addon slot (Intelligence's Pickup).
5. 最近追加 / Recently Added, unchanged request.

Home no longer draws the Liked row and no longer requests `liked=true`.

**Set-aside (revising 069)**: after 続きから外す succeeds, the card leaves the Continue row and
the Recently Viewed row is fetched again, so the set-aside file appears there when it is
among the newest 12 `not_continue` rows.

**API (075)**: `GET /api/drives/{drive}/watch-history?filter=not_continue` returns this
viewer's rows for active files of the drive that `filter=all` returns and `filter=continue`
does not, narrowed by `type` before `limit`, newest `last_played_at` first.

### 2. Failure cases

- Addon catalogue for this drive not yet loaded, or failed: the row holds Library, the
  built-in apps and (if any) the Inbox; addon entries appear when the catalogue for this
  drive arrives. A catalogue still held from another drive is not used (the sidebar's
  `catalogueDrive === currentDrive` guard).
- Inbox count request fails: no Inbox entry (as the sidebar shows no badge); the next
  `inbox.updated` / `drive.structure_changed` event or drive change asks again.
- `not_continue` request fails: the Recently Viewed row is empty and hidden, like any other
  failed watch row today; a page where every core request failed shows `home-unavailable`.
- The refetch after a set-aside fails: the Recently Viewed row keeps what it held.

### 3. States

Entry row: always drawn on Home. Inbox entry: absent (count 0, unknown or failed) ↔ present
(count ≥ 1), following the count. Addon entries: absent (catalogue not loaded for this drive)
→ present.

Rows: each of Continue and Recently Viewed is not drawn without a profile; every row is
loading → filled, or loading → hidden when empty, as today.

### 4. Data read and written

- Read: `watch_history` (through `GET .../watch-history`, `filter=continue` and the new
  `filter=not_continue`), `files` (Recently Added and Favorites listings), the inbox count
  (`getInboxCount`), the addon catalogue already loaded by `AddonSlotsProvider`.
- Written: `watch_history.dismissed_at` through the existing dismiss endpoint only.
  No schema change.

### 5. External services

None. Everything is the core's own API.

### 6. Authorization

Unchanged. The watch-history endpoint keeps its viewer and drive access checks: a locked
drive is 404, no viewer gives `{ "data": [] }`. The entry row's links lead to pages that do
their own checks. Addon entries come from the catalogue the backend already filters by the
drive's addon policy.

### 7. Effect on existing features

- Sidebar: unchanged; the entry row reads the same `builtinApps`, `addonNavEntries` and
  `useInboxCount`. Adding `images` to `ADDON_NAV_ICONS` also lets the sidebar draw it.
- `?view=recent`, `?view=liked`, `?view=continue` and `?view=favorites` pages: unchanged.
  Liked stays reachable from the sidebar's Views and search.
- `filter=unfinished`, `filter=all`, `filter=continue`: unchanged.
- Video and Reading apps' Discover shelves: unchanged.
- Remove from history still removes the card from both Home rows.
- The `drive-home-sections` slot no longer sits right after Continue (SPEC-CORE-069 §7
  said it stays there; that was not an invariant).
- `addon-name-neutral-hosts.test.ts`: DriveHome and any new component must still name no
  bundled addon.

### 8. Error behavior

No new message. A failed request hides or keeps the affected row as described in item 2.
Nothing new is logged.

### 9. User-visible behavior

- Home's first block under the header is the entry row.
  - Width ≥ `sm` (640px): one wrapping row of tiles, each an icon (18px) beside the label,
    `rounded-xl`, `bg-bg-elevated`, `px-4 py-3`, gap 8px. It never scrolls sideways.
  - Width < `sm`: a 4-column grid, each tile the icon (22px) above a 12px label that may wrap
    to two lines, at least 72px tall.
  - Every tile is at least 44px tall. The Inbox count is a `rounded-full` `bg-warm-light`
    pill: beside the label on the wide layout, at the tile's top-right corner on the grid.
  - No entry carries a selected state; the row is a `<nav>` of links, not a tablist.
- Row order: entry row, Continue, Recently Viewed, Favorites, addon rows, Recently Added.
  No Liked row.
- Recently Viewed no longer repeats a file that is in Continue's request; a file that was
  finished, merely opened, older than 14 days or set aside still appears there.
- Without a profile: entry row, Favorites, addon rows, Recently Added.
- The empty state (`no-home-activity` / `home-unavailable`) appears under the entry row,
  judged on the core rows (Liked no longer counts).
- Strings: new `drive.appsNav` 「アプリ」 / "Apps" for the region's label. Entry labels reuse
  existing keys.

Visible decisions of the agreed design, to check against:

- D1. The entry row sits between the page header and the Continue row, at every width.
- D2. Entry order: Library, Video, Reading, then addon entries by priority (Ask 10, Notes 20,
  Photo Diary 30), Inbox last.
- D3. 1440px with the sidebar inline and 1024px without it: tiles in one wrapping row, icon
  left of label; Inbox count pill after its label.
- D4. 390px: four columns, icon above label; seven entries make two rows (4 + 3); the Inbox
  pill sits at the tile's top-right.
- D5. Rows under it: 続きから, 最近見た, お気に入り, ピックアップ, 最近追加; no Liked.
- D6. With a pointer that hovers (mouse), shelves are two-row grids with no sideways scroll;
  on touch (390px) they stay one sideways row.
- D7. Without a profile and with an empty Inbox: six entries (4 + 2 on the phone), then
  お気に入り, ピックアップ, 最近追加.
- D8. The page header (Home icon tile, ホーム, drive name, 追加) is unchanged.

The design's shelf headings omit the row icons; the implementation keeps the existing
`CarouselSection` / `ContinueWatchingSection` headings, icons included. Card contents are
illustrative.

### 10. Non-functional

- Home makes one fewer request (no `liked=true`) and the same number of watch-history
  requests (`not_continue` replaces `all`). The Inbox count adds one small request on Home
  when the sidebar is not mounted; when it is, both components ask (accepted: one integer).
- `not_continue` is one indexed query like `filter=all`; `limit` stays at most 50.

## Touch points

- `frontend/src/components/DriveHome.tsx` (row order, Liked removal, `not_continue`,
  refetch after set-aside, entry row placement)
- New `frontend/src/components/home/HomeAppEntries.tsx` (entry row)
- `frontend/src/components/sidebar/AddonNavRows.tsx` (`ADDON_NAV_ICONS` gains `images`;
  may be moved to `lib/` so Home imports it without reaching into `sidebar/`)
- `frontend/src/components/sidebar/useInboxCount.ts` (read; may move with the icon table)
- `frontend/src/lib/builtinApps.ts`, `frontend/src/lib/addonNavigation.ts` (read)
- `frontend/src/components/AddonSlotsProvider.tsx` (read: catalogue and `catalogueDrive`)
- `frontend/src/lib/api.ts` (`getWatchHistory` filter type gains `not_continue`)
- `frontend/src/messages-core/{ja,en}.json` (`drive.appsNav`)
- `backend/app/routers/drives.py` (`watch-history` filter pattern and branch)
- `backend/app/models.py` (`continue_desk_filter`, read; negated for `not_continue`)
- `frontend/src/__tests__/addon-name-neutral-hosts.test.ts` (new host file listed)
- `DESIGN.md` (Home's entry row, if a rule is new)
- Docs: `docs/reference/api.md` (`filter=not_continue`), `docs/user-guide/file-browsing.md`
  (Home rows and entry row), `docs/user-guide/comments-history.md` (what Recently Viewed on
  Home shows), `docs/user-guide/overview.md` (Home's rows), `docs/ADDON-DEVELOPMENT.md`
  (icon tokens gain `images`)
- Outside this repository: `addons/photo_diary` (`ADDON_META.navigation.icon = "images"`)
- `docs/process/reviews/feature-home-app-entries/design/` (the agreed design)

No protected path is edited.

## Invariants

I1. Home draws the entry row under the page header and above every row, with or without a profile, at every width, whether the sidebar is open, closed or an overlay.
I2. The entry row lists Library, then every `builtinApps` entry in its order, then exactly the `primary` addon entries the sidebar lists for the same drive in the same order, then Inbox; each link's href equals the sidebar row's href for the same entry.
I3. The Inbox entry is present exactly when the drive's open arrival count is at least 1, shows that count (`99+` above 99), and an addon entry from another drive's catalogue never appears.
I4. The entry row never scrolls sideways at any width, and every entry is at least 44px tall.
I5. With a profile, Home's rows are, in order: Continue, Recently Viewed, Favorites, the `drive-home-sections` slot, Recently Added; Home sends no request with `liked=true` and draws no Liked row.
I6. `filter=not_continue` returns exactly the rows `filter=all` returns minus the rows `filter=continue` returns for the same viewer, drive and `type`, applied before `limit`, ordered by `last_played_at` newest first; without a viewer it returns `{ "data": [] }`, and `filter=unfinished`, `filter=all` and `filter=continue` return what they returned before.
I7. Home's Recently Viewed row requests `filter=not_continue`, so no file appears in both the Continue row and the Recently Viewed row from the same page load.
I8. After a successful 続きから外す the card leaves the Continue row and Recently Viewed is fetched again; a failed one changes neither row; Remove from history removes the card from both rows.
I9. `ADDON_NAV_ICONS.images` is lucide `Images`, and an unknown or missing token still draws `Package` in the sidebar and in the entry row.

## Revises

SPEC-CORE-069 I9. Home's Continue row is headed 続きから / Continue and requests `filter=continue`; only its card menu offers 続きから外す / Remove from Continue, directly above Remove from history; a successful dismiss removes the card from that row and fetches Recently Viewed (`filter=not_continue`) again; a failed one leaves both rows as they were and shows the toast; Remove from history still removes the card from both rows.

## Checked, no action

- **Hiding the entry row while the sidebar is inline.** Rejected: the sidebar's open state is
  client-only, so the row would appear after hydration and push the rows down; the row costs
  one line at 1440px.
- **Renaming Recently Viewed (最近開いたもの).** Kept 最近見た / Recently Viewed so the row matches
  the `?view=recent` page its See all opens; that page still lists files that are in Continue,
  as a superset, the way Continue's row is a subset of its page.
- **Client-side subtraction of the Continue row's items** instead of `not_continue`. Rejected:
  the Continue row draws only what fits, so a file past the visible cards would be dropped from
  Recently Viewed without being shown anywhere, and `limit` would count removed rows.
- **Hiding Favorites when empty.** Already the behaviour: `CarouselSection` returns null when
  loaded and empty.
- **Skipping the drive picker at launch** (PWA `start_url` is `/`). A separate topic, agreed
  with the human.
- **An Inbox entry at the start of the row.** Rejected: it appears and disappears with the
  count, and at the start it would move every app tile.
- **Utility and sources addon placements** (`sources` = YouTube & Feeds). Not apps; they stay
  in the sidebar only.
- **A "today" entry for Photo Diary or a "new note" tile.** New note is already in the 追加 menu;
  Photo Diary is for looking back and has nothing to resume.
- **Liked's data.** Untouched; only Home stops listing it.
