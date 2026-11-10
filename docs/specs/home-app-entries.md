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
  navigation entry, the same entries the sidebar draws above its Views, plus the Inbox
  while it holds arrivals. The addon navigation icon table gains `images`.
- **SPEC-CORE-074**: the order and content of Home's rows. Recently Viewed leaves out what the
  Continue request holds, Favorites moves up, the addon row moves down, Liked goes.
- **SPEC-CORE-075**: `GET /api/drives/{drive}/watch-history?filter=not_continue`, the rows
  `filter=all` returns that `filter=continue` does not.

Agreed design: https://claude.ai/artifact/LgXPsQGLi7dsMZ4GZk7DvN, saved in
`docs/process/reviews/feature-home-app-entries/design/` (`canvas.json` and four `.dc.html`
artboards). Declared differences between the design and this spec, accepted with it:

- The design draws the Photo Diary tile with a box icon; it draws `images` once Photo
  Diary declares that token.
- The design draws the Library tile with lucide `Folder`; it uses `FolderTree`, the
  sidebar's Library icon.
- The design draws the shelves as six- and five-column grids and as a sideways row on the
  phone. Shelf layout is not part of this change: every row keeps today's `SectionRow`
  grid (`lib/cardGrid.ts`), and the shelf drawings are illustrative, as are card contents
  and the omitted row-heading icons.

## Required items

### 1. Normal flow

**Entry row (073)**

1. The viewer opens a drive's Home (`/drive/{drive}?view=home`).
2. Under the page header, before any row, Home draws a `<nav>` whose accessible name is
   `drive.appsNav` (アプリ / Apps; `aria-label` only, no visible heading), holding one link
   per entry, in this order:
   1. ライブラリ / Library → `driveHref(drive, "library")`;
   2. each entry of `builtinApps`, in its order (動画 / Video, 読む / Reading) → `app.route(drive)`;
   3. each entry of `addonNavEntries(catalogue, drive, "primary")` in its order (by
      `priority`, then name) → its `href`, read only from a catalogue whose
      `catalogueDrive` equals Home's drive (the sidebar's guard);
   4. 受信箱 / Inbox → `?view=inbox`, only while `useInboxCount(drive)` is at least 1,
      carrying that number (`99+` above 99).
3. Labels and icons are the sidebar's for the same entry: the built-in app's `labelKey` and
   `icon`, the addon's `slotEntryLabel(navigation, t)` and `ADDON_NAV_ICONS[navigation.icon]`
   with `Package` for a missing or unknown token, the sidebar's `library` / `inbox` strings
   with `FolderTree` / `Inbox`.
4. `ADDON_NAV_ICONS` moves to `frontend/src/lib/addonNavIcons.ts` and gains `images`
   (lucide `Images`). The sidebar's `AddonNavRows`, page jump's `useJumpDestinations` and
   the entry row import it from there. `useInboxCount` moves to
   `frontend/src/hooks/useInboxCount.ts`, unchanged, imported by the sidebar and the entry row.
5. Photo Diary is a separate repository (`mamepenguin/Litloft-photo-diary-addon`), cloned to
   `addons/photo_diary` by an operator who wants it; it is not a submodule and the core pins
   nothing for it. Its `backend/router.py` `ADDON_META.navigation` gains `"icon": "images"`
   in that repository, as a separate pull request there.
6. Activating an entry navigates with the router (a `next/link`), no full reload.

**Rows (074)**, top to bottom after the entry row:

1. 続きから / Continue (with a profile), unchanged from SPEC-CORE-069.
2. 最近見た / Recently Viewed (with a profile), from `filter=not_continue` with `limit=12`.
   Its See all stays `?view=recent`.
3. お気に入り / Favorites, unchanged request (`favorite=true`, `created_at` desc, 12).
4. The `drive-home-sections` addon slot (Intelligence's Pickup).
5. 最近追加 / Recently Added, unchanged request.

Home no longer draws the Liked row and no longer requests `liked=true`.

**Set-aside (revising 069)**:

1. 続きから外す calls the dismiss endpoint as today. On success the card leaves the Continue row.
2. Then, not awaited by the dismiss handler, Home fetches `filter=not_continue` (limit 12)
   once. The Recently Viewed row keeps its cards (no skeleton) until the response lands,
   then shows the response, so the set-aside file appears there when it is among the newest
   12 `not_continue` rows.
3. A refetch response is discarded when, by the time it lands, Home shows another drive, a
   newer page load has started, or a newer Recently Viewed refetch was sent. A card removed
   with Remove from history after the refetch was sent is left out of its response.
4. A failed refetch changes nothing and shows no toast.

**API (075)**: `GET /api/drives/{drive}/watch-history?filter=not_continue` returns this
viewer's rows for active files of the drive that `filter=all` returns and `filter=continue`
does not (`not_(continue_desk_filter())`), narrowed by `type` before `limit`, newest
`last_played_at` first.

### 2. Failure cases

- Addon catalogue for this drive not yet loaded, or failed: the row holds Library, the
  built-in apps and (if any) the Inbox; addon entries appear when the catalogue for this
  drive arrives. The catalogue is loaded once per drive by `AddonSlotsProvider`, which
  sits above the page, so this happens on the first load of a drive and on a drive switch.
- Inbox count request fails: `useInboxCount` keeps the last number it had for this drive
  (0 after a drive change), and the entry follows that number, as the sidebar's badge does.
  The next `inbox.updated` / `drive.structure_changed` event or drive change asks again.
- `not_continue` request fails on a page load: the Recently Viewed row is empty and hidden,
  as a failed watch row is today; a page where every core request failed shows
  `home-unavailable`.
- The refetch after a set-aside fails: see Set-aside step 4.

### 3. States

- Entry row: always drawn on Home.
  - Addon entries: absent (no catalogue for this drive) → present. On a drive change while
    Home stays mounted: present → absent → present for the new drive. Never present with
    another drive's catalogue.
  - Inbox entry: absent (count 0) ↔ present (count ≥ 1), following `useInboxCount`, which
    resets to 0 on a drive change.
- Recently Viewed row: not drawn without a profile; page load: loading → filled, or loading
  → hidden when empty or failed; after a set-aside: filled → refetching (same cards shown) →
  filled with the response, or → unchanged on failure or discard. It never returns to the
  loading skeleton on a refetch.
- Other rows: unchanged (loading → filled, or loading → hidden when empty).
- Not allowed: another drive's entries or history on Home during a switch; a card removed
  with Remove from history coming back from a refetch sent before the removal.

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
drive is 404, no viewer gives `{ "data": [] }`, an unknown `filter` is 422. The entry row's
links lead to pages that do their own checks. Addon entries come from the catalogue the
backend already filters by the drive's addon policy.

### 7. Effect on existing features

- Sidebar: unchanged in behaviour; it imports `ADDON_NAV_ICONS` and `useInboxCount` from
  their new paths, and can draw `images`.
- Page jump (`useJumpDestinations`): imports the icon table from its new path; an addon
  declaring `images` gets that icon there too.
- `?view=recent`, `?view=liked`, `?view=continue` and `?view=favorites` pages: unchanged.
  Liked stays reachable from the sidebar's Views and search.
- `filter=unfinished`, `filter=all`, `filter=continue`: unchanged. The MCP server's `filter`
  enum (`unfinished|all`) is unaffected.
- Video and Reading apps' Discover shelves and `SectionRow` / `cardGrid`: unchanged.
- Remove from history still removes the card from both Home rows. The dismiss endpoint
  still writes only `dismissed_at` (SPEC-CORE-069 I5).
- The `drive-home-sections` slot no longer sits right after Continue (SPEC-CORE-069 §7
  said it stays there; that was not an invariant). Pickup still receives `{ drive }` and
  draws without a profile.
- The Inbox count is requested by both the sidebar and Home; each instance follows its own
  drive argument.

### 8. Error behavior

No new message. A failed request hides or keeps the affected row as described in item 2;
a failed refetch after a set-aside shows no toast, and the set-aside's own toast
(`couldNotRemoveFromContinue`) still appears only when the dismiss request fails.
Nothing new is logged.

### 9. User-visible behavior

- Home's first block under the header is the entry row.
  - Viewport width ≥ `sm` (640px): one wrapping row of tiles, each an icon (18px) beside the
    label, `rounded-xl`, `bg-bg-elevated`, `px-4 py-3`, gap 8px. It never scrolls sideways.
  - Viewport width < `sm`: a 4-column grid, each tile the icon (22px) above a 12px label
    that may wrap to two lines, at least 72px tall.
  - Every tile is at least 44px tall. The Inbox count is a `rounded-full` `bg-warm-light`
    pill: after the label on the wide layout, at the tile's top-right corner on the grid.
  - No entry carries a selected state; the row is a `<nav>` of links, not a tablist.
- On a phone, the row grows from one line of tiles (Library, Video, Reading) to two when
  the drive's addon catalogue arrives, moving the rows below down once per drive load.
  Accepted (see Checked).
- Row order: entry row, Continue, Recently Viewed, Favorites, addon rows, Recently Added.
  No Liked row.
- Recently Viewed no longer repeats a file that Continue's request returns; a file that was
  finished, merely opened, older than 14 days or set aside still appears there.
- Without a profile: entry row, Favorites, addon rows, Recently Added.
- The empty state (`no-home-activity` / `home-unavailable`) appears under the entry row,
  judged on the core rows Home still draws (Liked no longer counts).
- Strings: new `drive.appsNav` 「アプリ」 / "Apps". Entry labels reuse existing keys.

Visible decisions of the agreed design, to check against:

- D1. The entry row sits between the page header and the Continue row, at every width.
- D2. Entry order: Library, Video, Reading, then addon entries by priority (Ask 10, Notes 20,
  Photo Diary 30, when installed), Inbox last.
- D3. 1440px with the sidebar inline and 1024px without it: tiles in one wrapping row, icon
  left of label; Inbox count pill after its label.
- D4. 390px: four columns, icon above label; seven entries make two rows (4 + 3); the Inbox
  pill sits at the tile's top-right.
- D5. Rows under it: 続きから, 最近見た, お気に入り, ピックアップ, 最近追加; no Liked.
- D6. Without a profile and with an empty Inbox: six entries (4 + 2 on the phone), then
  お気に入り, ピックアップ, 最近追加.
- D7. The page header (Home icon tile, ホーム, drive name, 追加) is unchanged.

R-5 and the design check need Photo Diary installed for D2, D4 and D6 as drawn: they run in
a checkout with the Photo Diary repository cloned to `addons/photo_diary` (with
`./setup-addons.sh`), and also once without it.

### 10. Non-functional

- Home makes one fewer request (no `liked=true`) and the same number of watch-history
  requests on a page load (`not_continue` replaces `all`); a set-aside adds one.
- `not_continue` is one query like `filter=all`; `limit` stays at most 50. The two requests
  compute "now" separately, so a row crossing the 14-day line between them can appear in
  neither row, never in both.

## Touch points

- `frontend/src/components/DriveHome.tsx` (row order; Liked removed from the batch, its
  state, `rowsEmpty` and `everyCoreRequestFailed`; `not_continue`; refetch after set-aside;
  entry row placement)
- New `frontend/src/components/home/HomeAppEntries.tsx` (entry row)
- New `frontend/src/lib/addonNavIcons.ts` (`ADDON_NAV_ICONS`, gains `images`)
- `frontend/src/components/sidebar/AddonNavRows.tsx` (imports the moved table)
- `frontend/src/components/search/useJumpDestinations.ts` (imports the moved table)
- `frontend/src/components/sidebar/useInboxCount.ts` → `frontend/src/hooks/useInboxCount.ts`;
  `frontend/src/components/sidebar/SidebarLibrarySection.tsx` imports it from there
- `frontend/src/lib/builtinApps.ts`, `frontend/src/lib/addonNavigation.ts`,
  `frontend/src/components/AddonSlotsProvider.tsx` (read)
- `frontend/src/lib/api.ts` (`getWatchHistory` filter type gains `not_continue`)
- `frontend/src/messages-core/{ja,en}.json` (`drive.appsNav`)
- `backend/app/routers/drives.py` (`watch-history` filter pattern and branch)
- `backend/app/models.py` (`continue_desk_filter`, read; negated for `not_continue`)
- Existing tests that pin behaviour this spec replaces, each changed only as the named
  invariant requires:
  - `frontend/src/__tests__/driveHomeSectionOrder.test.tsx` ("puts the addon slot between
    the two watch rows") → I5
  - `frontend/src/__tests__/homeContinueDesk.test.tsx` (the `filter === "all"` assertions →
    I7; "takes the card out of Continue only" → Revises SPEC-CORE-069 I9 and I8)
  - `frontend/src/__tests__/DriveHome.test.tsx` (the `liked: true` request → I5; the
    `"all"` request → I7)
  - `frontend/src/__tests__/addon-name-neutral-hosts.test.ts` (hosts list and its count gain
    `HomeAppEntries.tsx` and `lib/addonNavIcons.ts`) → I10
  - Sidebar tests importing `useInboxCount` or the icon table by path, if any (path only)
- New real-browser measurement: `frontend/e2e-components/home-app-entries.spec.ts` (touch,
  390px) and `home-app-entries-desktop.spec.ts` (mouse, 1024px and 1440px), drawing the real
  `HomeAppEntries` → I4, D3, D4
- `DESIGN.md`: a short "Home entry row" rule under §6 (wrapping tiles on wide, 4-column grid
  under `sm`, no selected state, count pill)
- Docs: `docs/reference/api.md` (`filter=not_continue`), `docs/user-guide/file-browsing.md`
  (Home rows and entry row), `docs/user-guide/comments-history.md` (what Recently Viewed on
  Home shows), `docs/user-guide/overview.md` (Home's rows), `docs/ADDON-DEVELOPMENT.md`
  (icon tokens gain `images`)
- Outside this repository: `Litloft-photo-diary-addon` `backend/router.py`
  (`ADDON_META.navigation.icon = "images"`)
- `docs/process/reviews/feature-home-app-entries/design/` (the agreed design)

No protected path is edited.

## Invariants

I1. Home draws the entry row under the page header and above every row, with or without a profile, with the empty state shown or not, at every width, whether the sidebar is open, closed or an overlay.
I2. The entry row lists Library, then every `builtinApps` entry in its order, then exactly `addonNavEntries(catalogue, drive, "primary")` in its order, then the Inbox entry when I3 allows it; each link's href equals the sidebar row's href for the same entry.
I3. The Inbox entry is present exactly when `useInboxCount(drive)` is at least 1 and shows that number (`99+` above 99); addon entries come only from a catalogue whose `catalogueDrive` equals Home's drive.
I4. Measured in a real browser at 390, 1024 and 1440px, the entry row causes no sideways overflow, every entry is at least 44px tall, and below 640px the entries form 4 columns at least 72px tall.
I5. With a profile, Home's rows are, in order: Continue, Recently Viewed, Favorites, the `drive-home-sections` slot, Recently Added; without one: Favorites, the slot, Recently Added; Home sends no request with `liked=true` and draws no Liked row, and each row shows the data of its own request.
I6. `filter=not_continue` returns exactly the rows `filter=all` returns minus the rows `filter=continue` returns for the same viewer, drive and `type`, applied before `limit`, ordered by `last_played_at` newest first; without a viewer it returns `{ "data": [] }`; `filter=unfinished`, `filter=all` and `filter=continue` return what they returned before.
I7. Home's Recently Viewed row requests `filter=not_continue` with `limit=12` and its See all opens `?view=recent`.
I8. After a successful 続きから外す the card leaves the Continue row and exactly one `not_continue` request follows; a failed dismiss changes neither row and shows `couldNotRemoveFromContinue`; a failed refetch changes neither row and shows no toast; a refetch response for another drive, an older page load or an older refetch is discarded; a card removed with Remove from history never comes back from a refetch sent before the removal.
I9. `ADDON_NAV_ICONS.images` is lucide `Images`, and a missing or unknown token draws `Package` in the sidebar, page jump and the entry row.
I10. `HomeAppEntries.tsx`, `DriveHome.tsx` and `lib/addonNavIcons.ts` name no bundled addon in code strings.
I11. The entry row's `<nav>` has the accessible name `drive.appsNav` (アプリ / Apps) and no entry carries `aria-current` or a selected style on Home.

## Revises

SPEC-CORE-069 I9. Home's Continue row is headed 続きから / Continue and requests `filter=continue`; only its card menu offers 続きから外す / Remove from Continue, directly above Remove from history; a successful dismiss removes the card from that row and fetches Recently Viewed (`filter=not_continue`) again; a failed one leaves both rows as they were and shows the toast; Remove from history still removes the card from both rows.

## Checked, no action

- **Hiding the entry row while the sidebar is inline.** Rejected: the sidebar's open state is
  client-only, so the row would appear after hydration and push the rows down; the row costs
  one line at 1440px.
- **Holding the entry row until the addon catalogue loads, or reserving its height.** The
  catalogue is fetched once per drive above the page, so the phone's one-line-to-two-line
  growth happens on a drive's first load or a switch, while the rows below are still
  skeletons themselves. Reserving height would need the entry count before it is known;
  holding the row back moves everything by the whole row instead of one line. Accepted.
- **Renaming Recently Viewed (最近開いたもの).** Kept 最近見た / Recently Viewed so the row matches
  the `?view=recent` page its See all opens; that page still lists files that are in Continue,
  as a superset, the way Continue's row is a subset of its page.
- **Client-side subtraction of the Continue row's items** instead of `not_continue`. Rejected:
  the Continue row draws only what fits, so a file past the visible cards would be dropped from
  Recently Viewed without being shown anywhere, and `limit` would count removed rows.
- **Hiding Favorites when empty.** Already the behaviour: `CarouselSection` returns null when
  loaded and empty.
- **Changing the shelf layout to match the design's drawings.** Out of scope; see Summary.
- **Clearing the Inbox entry on a failed count refresh.** Rejected: it would need a change to
  the shared hook and would make Home disagree with the sidebar's badge.
- **Skipping the drive picker at launch** (PWA `start_url` is `/`). A separate topic, agreed
  with the human.
- **An Inbox entry at the start of the row.** Rejected: it appears and disappears with the
  count, and at the start it would move every app tile.
- **Utility and sources addon placements** (`sources` = YouTube & Feeds). Not apps; they stay
  in the sidebar only.
- **A "today" entry for Photo Diary or a "new note" tile.** New note is already in the 追加 menu;
  Photo Diary is for looking back and has nothing to resume.
- **Liked's data.** Untouched; only Home stops listing it.
