# Channel name opens the channel's videos

SPEC-ID: SPEC-ADDON-160
SPEC-ID: SPEC-ADDON-161
SPEC-ID: SPEC-ADDON-162
SPEC-ID: SPEC-ADDON-163

Approval: sha256:0603e267973b9d683772fe8c156d662e1c9e873ea0f0739a1f52dac0c8c73550 Yuichi Senga 2026-11-20

## Summary

On a `.loft` file imported by Media Import, the channel name shown under the title (the
inspector's Info tab, and the same panel under the player on the collection surface)
becomes a link. It opens the Media Import page in a channel view that lists every active
`.loft` in the same drive whose stored provider and channel name equal the clicked ones,
newest first, drawn with the video app's cards. Each card has the same right-click (long
press on touch) menu as a file in the file list. Everything lives in the Media Import
addon; the core is not changed.

- SPEC-ADDON-160: the channel name in the `loft-metadata` panel is a link to the channel
  view.
- SPEC-ADDON-161: `GET /api/addons/media_import/channel-videos` returns the ordered file
  ids of one channel in one drive.
- SPEC-ADDON-162: the Media Import page with `?provider=&channel=` shows the channel view
  instead of its management content.
- SPEC-ADDON-163: a card in the channel view opens the core file context menu.

Agreed design: <https://claude.ai/artifact/Lcjv9j1JRfhFgNtB7PgveE>, saved in
`docs/process/reviews/feature-loft-channel-videos/design/` (`Main.dc.html` desktop at
1440 px, `Phone.dc.html` at 390 px, `Inspector.dc.html` the link in the Info tab). Sample
titles, dates, thumbnails and the sidebar in the artboards are placeholders. Only the
`ready` state is drawn; the human decided that loading, empty, failed and the context menu
follow the core components named in item 8 and SPEC-ADDON-163 without a drawing.

## Required items

### 1. Normal flow

1. The viewer opens a `.loft` file. `LoftMetadataPanel` reads its metadata as today.
2. When `metadata.channel` is a string with at least one non-whitespace character, it is
   drawn as a Next `Link` to
   `/drive/<drive>/addons/media_import?provider=<metadata.provider>&channel=<metadata.channel>`.
   The drive segment and both query values are encoded with `encodeURIComponent`; the
   channel is the raw stored value, untrimmed. The drive is the panel's `drive` prop.
3. Clicking it is a client-side navigation (no full reload).
4. The Media Import page reads `provider` and `channel` from the query. When both have at
   least one non-whitespace character it draws the channel view: it does not call
   `listSubscriptions`, does not draw the `loadingDrive` text, and draws neither the
   management header (Rss icon, page title) nor the Composer, subscriptions dashboard or
   activity. The channel view is keyed on drive, provider and channel, so a change of
   any of them mounts a fresh view.
5. The channel view draws its header at once, then calls
   `GET /api/addons/media_import/channel-videos?provider=&channel=` with
   `X-Lit-Drive: <drive>`, passing the query values unchanged. The answer is
   `{"items": [{"file_id": "...", "published_at": "..." | null}, ...]}`.
6. The view resolves ids into cards through the core `getShelves(drive, {by: "all",
   key: "all", per_shelf: 60, ids})`, 60 ids per call, taking the ids in list order.
   - A load step fetches the next batch of 60. If that batch added no card and ids remain,
     it fetches the following batch at once, without waiting for a scroll, until a card
     is added or the ids run out.
   - The first load step runs on entry. Further steps run when the grid's end comes near
     (`useNearEnd`), while ids remain.
7. Card order is the endpoint's order, whatever order `getShelves` answers in. An id the
   shelves answer does not return is skipped.
8. Each card's byline is the item's publication date, formatted as the Watch shelves
   format the date part of their byline (`calendarDate` +
   `Intl.DateTimeFormat(locale, {year: "numeric", month: "short", day: "numeric",
   timeZone: "UTC"})`). That date formatting becomes `formatPublishedDate(publishedAt,
   locale)`, exported from a new `addons/media_import/frontend/lib/publishedDate.ts` and
   used by both `bylineOf` and the channel view. The channel view's locale is next-intl's
   active locale (`useLocale()`). No byline when `published_at` is null or
   `calendarDate` returns null. The channel name is not in the byline.
9. Clicking a card opens the file as `VideoCard` does everywhere else (client-side).
10. The back link is a Next `Link` to `/drive/<drive>/addons/media_import` with no query
    (client-side), the drive segment encoded with `encodeURIComponent`.
11. Ids are read in one pass: a read position moves past a batch only after its
    `getShelves` call succeeded. A failed batch is the one the retry requests again.

### 2. Failure cases

- `metadata.channel` null, empty or whitespace only: no link and nothing drawn for the
  channel. **Change:** today a whitespace-only channel draws an empty-looking span; it now
  draws nothing.
- `provider` or `channel` missing, empty or whitespace only in the page query: the page
  draws its management content, as today.
- Endpoint, in this order: `X-Lit-Drive` missing → 400; drive locked or unknown → 404
  with the existing body `{"detail": "Drive not found: <drive>"}` (the drive check runs
  before parameter validation; both parameters are declared optional); `provider` or
  `channel` missing, empty or whitespace only → 422; otherwise 200, `{"items": []}` when
  nothing matches.
- The channel view's first endpoint call or any `getShelves` call of the first load step
  fails (network, 4xx, 5xx, including 404): the `failed` state.
- A later load step fails: the cards already drawn stay, and the `more-failed` state
  shows a retry under them.
- The whole id list resolves to zero cards (no match, all trashed or missing, a channel
  renamed upstream and refreshed, or every id dropped by `getShelves`): the `empty`
  state. `empty` is decided only after the last id is resolved.

### 3. States

Channel view states: `loading`, `ready` (with a flag `exhausted` = no ids left),
`loading-more`, `more-failed`, `empty`, `failed`.

Allowed transitions:

- `loading` → `ready` | `empty` | `failed`
- `ready` (not exhausted) → `loading-more` (near end)
- `loading-more` → `ready` | `more-failed`
- `more-failed` → `loading-more` (retry; requests the batch that failed again)
- `failed` → `loading` (retry; calls the endpoint again and starts from the first id)
- any → `loading` after a successful rename, move or trash from the context menu
  (SPEC-ADDON-163)

Not allowed:

- a second `loading-more` while one is running, or starting one from `more-failed`
  without the retry;
- any load step from `ready` with `exhausted`;
- `empty` or `failed` changing except by retry (`failed`), a context-menu reload, or a
  query change (which mounts a new view).

On a query change, unmount, retry of `failed`, or a menu-triggered reload, the endpoint
call and any `getShelves` call in flight are aborted (`AbortController`; `getShelves`
takes `signal`). An answer that arrives for an earlier view or an earlier load is never
drawn.

### 4. Data read and written

- Read: core `files` (`id`, `drive`, `created_at`, `deleted_at`, `missing_since`) and the
  addon's `loft_metadata` (`file_id`, `provider`, `channel`, `published_at`), through the
  addon's existing `SessionLocal`.
- Read: core `GET /api/drives/{drive}/shelves` (already public; the knowledge addon calls
  it the same way).
- Written by the endpoint: nothing. No table, column, index, migration or file.
- Written through the context menu (SPEC-ADDON-163): only what the core
  `FileContextMenu` already writes, through the core's existing endpoints (rename, move,
  move to trash, add to collection) and the core clipboard state. Nothing new.

### 5. External services

None. Nothing calls YouTube or any provider; the list is built only from what is already
stored.

### 6. Authorization

- The endpoint resolves the drive with the existing `_scoped_drive` (`X-Lit-Drive`
  required, 400 when absent; `check_drive_access`, 404 for a locked or unknown drive) and
  filters `files.drive` to that drive. No cross-drive result is possible.
- `getShelves` and every context-menu action use the core's own access checks.
- The link carries only the panel's own drive.

### 7. Effect on existing features

- `LoftMetadataPanel` is drawn in the file page's Info tab and on the collection surface
  under the player; both get the link (same component).
- The Media Import page without both query parameters is unchanged.
- The Watch shelves' byline (`bylineOf` in `watchShelfProviders.ts`) keeps its text:
  "channel · date" with the same date format; only its date formatting moves into a
  shared function.
- `addons/media_import/backend/tests/test_drive_scope.py` lists every drive-scoped route
  (`ROUTES`, asserted at 20): the new route is added and the count becomes 21.
- No change to `loft_metadata` writers, Watch lanes, subscriptions, or the core.
- The addon starts importing core frontend modules (listed in Touch points). Addon →
  core is allowed; nothing core → addon is added. Core inventory tests over addon
  sources apply: no hand-written `<h1>`/`<h2>` (`page-headings`, `section-headings`) and
  no grid of its own (`card-grid`) in the addon.

### 8. Error behavior

These follow the core `VideoPagedGrid` (the video app's See all page):

- `loading`: the channel header, then the core `SkeletonGrid` with `rows={2}`.
- `loading-more`: the drawn cards, then `SkeletonGrid rows={1}` under them (`mt-8`).
- `empty`: the core `EmptyState` with icon `Film` (lucide) and title
  `mediaImport.channelView.empty`; no description, no action.
- `failed`: the core `RetryButton` alone under the header, for every failure, 404
  included.
- `more-failed`: the drawn cards, then the core `RetryButton` under them (`mt-8`), no
  other text.
- The endpoint logs nothing beyond FastAPI's own request handling.

### 9. User-visible behavior

From the agreed design and the human's decisions:

- Info tab: the channel name keeps its current weight and color (`font-medium
  text-text-primary`, 12 px) and its place before ` · <published_at>`; it gains an
  underline on hover and the pointer cursor. Nothing else in the panel moves.
- Frame: the same as the management view, `PageFrame width="full"` with the
  `PageHeader` as its `header`, and the content in a `px-4 pb-6 pt-6` box. The design's
  32 px side padding is drawn at 16 px to match; the grid, skeleton, empty state and
  retry button all sit in that box.
- Channel view header: the core `PageHeader`. The back link (chevron-left icon + the
  `mediaImport.sidebar.label` text, muted 13 px) is its `breadcrumb`; `title` is the
  channel name (PageHeader's bold title); `scope` is the drive name, below the title. No
  `titleIcon`, no count, no actions.
- Below it, the grid of video cards, nothing else on the page.
- Grid: the core `VideoGrid` (320 px minimum card width, 16 px column gap, 32 px row
  gap, at least 2 columns). 3 columns in a 1440 px window with the sidebar; 2 columns at
  390 px.
- Each card is exactly the core `VideoCard` without its own `menu`: 16:9 thumbnail with
  rounded corners, duration badge bottom right, watch progress bar when the viewer has
  progress, the title in up to 2 lines, the publication date beneath.
- Order: by the existing `_PUBLISHED_SORT_KEY`: the date part of `published_at`
  (`YYYYMMDD` normalised to `YYYY-MM-DD`, otherwise its first 10 characters), and the
  date part of `files.created_at` where `published_at` is NULL or empty; descending. Ties
  by `files.created_at` descending, then file id descending.
- Strings (ja / en) added under `mediaImport.channelView`: `empty`.
- The browser tab title stays the Media Import page's.

### 10. Non-functional

- The endpoint returns every matching id with no cap. A channel of a few thousand files
  is a few tens of KB of JSON; one query over `loft_metadata` joined to `files` on the
  primary key, no new index.
- Card data is fetched 60 ids at a time, and only as the viewer scrolls (or to skip a
  batch that drew nothing).
- Matching is exact on the stored strings: `provider` equal, `channel` equal
  (case-sensitive, no trimming on either side).
- Layout is checked in a real browser at R-5:
  - Channel view: column count and the header's order (back link, title, drive name)
    measured with `getBoundingClientRect` at a 1440 px window with the sidebar
    (3 columns) and at 390 px (2 columns). Screenshots of `loading`, `ready`,
    `loading-more`, `empty`, `failed`, `more-failed` and the open context menu.
  - Info tab (the `Inspector` artboard): the file page at 1440 px and 390 px, the link
    at rest and on hover. Measured: the channel name's computed `font-weight`, `color`
    and `font-size` equal those of the same span on develop, `text-decoration-line` is
    `underline` only on hover, `cursor` is `pointer`, and the bounding boxes of the title,
    the channel line and the description match develop's within 1 px.
  - The native touch callout cannot be observed at R-5 (iOS on a device is in
    `agent_cannot_verify`); it is checked by the computed `-webkit-touch-callout: none`
    on the card link in a WebKit browser.

### SPEC-ADDON-163: the card's context menu

1. Right-click on a card (pointer) opens the core `FileContextMenu` for that card's file
   at the pointer, and the browser's own menu does not open. On touch, a 500 ms press
   without movement opens it; moving the finger cancels it.
2. A press that opened the menu does not also open the file.
3. The menu is `FileContextMenu` with `onOpenInNewTab` (opens `fileLinkHref(item)` in a
   new tab) and `onUpdate`, and without `onStartInlineRename`, `onRemoveFromHistory`,
   `onRemoveFromContinue` or `extraMenuItems`. Its rows are therefore, in the core's
   order: open in new tab, download, add to collection, copy, cut, copy ID, rename
   (dialog), move (dialog), move to trash (confirm dialog). `.loft` files get no "edit"
   row.
4. After a successful rename, move or move to trash (`onUpdate`), the channel view
   reloads from the endpoint (back to `loading`). A trashed file is not in the reloaded
   list; a renamed file shows its new title; a moved file stays (same drive).
5. Add to collection, copy, cut, copy ID, download and open in new tab do not reload the
   view.
6. The menu is attached by wrapping each `VideoCard` in the addon; `VideoCard` itself is
   not given a `menu`. The wrapper sets `-webkit-touch-callout: none` and
   `user-select: none` (inherited by the card link), so a long press shows neither the
   platform's link preview nor a text selection.
7. The view holds one `FileContextMenu` and one `useContextMenu`, with the pressed card's
   file as the target, as the home shelves (`CarouselSection`) do. A right-click while
   the menu is open behaves as it does on those shelves.

## Touch points

- `addons/media_import/backend/router.py`: new `GET /channel-videos` handler.
- `addons/media_import/backend/schemas.py`: response models for it.
- `addons/media_import/backend/subscription/db.py` (or a sibling query module): the
  ordered query, reusing `_PUBLISHED_SORT_KEY`.
- `addons/media_import/backend/tests/test_drive_scope.py`: the route added to `ROUTES`,
  count 21.
- `addons/media_import/frontend/LoftMetadataPanel.tsx`: the channel link.
- `addons/media_import/frontend/Page.tsx`: query parameters choose the channel view.
- `addons/media_import/frontend/ChannelVideos.tsx` (new): the channel view and its card
  wrapper with the context menu.
- `addons/media_import/frontend/api.ts`: `listChannelVideos` (takes a `signal`).
- `addons/media_import/frontend/watchShelfProviders.ts`: `bylineOf` calls
  `formatPublishedDate`.
- `addons/media_import/frontend/lib/publishedDate.ts` (new): `formatPublishedDate` and
  `calendarDate`.
- Existing addon tests that change, without weakening any assertion:
  `frontend/Page.test.tsx` (its `next/navigation` mock gains `useSearchParams`, returning
  no query for the existing cases; channel-mode cases added) and
  `frontend/LoftMetadataPanel.test.tsx` (link cases added, including whitespace-only;
  existing assertions on the channel text kept).
- `addons/media_import/frontend/messages/{ja,en}.json`: `mediaImport.channelView.*`.
- Core frontend modules the addon starts importing (not edited): `components/PageHeader`,
  `components/appshell/VideoGrid`, `components/videoapp/VideoCard`,
  `components/videoapp/VideoPagedGrid` (`SkeletonGrid`), `components/EmptyState`,
  `components/appshell/RetryButton`, `components/appshell/useNearEnd`,
  `components/FileContextMenu`, `hooks/useContextMenu`, `lib/api` (`getShelves`),
  `lib/canonicalFileUrl` (`fileLinkHref`).
- Core inventory tests that read addon sources, which the new and changed addon files
  must pass with no change to any core list or count: `frontend/src/__tests__/`
  `page-headings`, `section-headings`, `card-grid`, `page-container-width`,
  `design-tokens`, `escape-listeners`, `popup-dismissal`, `line-clamp-display`,
  `addon-name-neutral-hosts`, `button-adoption`. If one can only pass by editing a core
  list or count, implementation stops and asks: that is a core change this spec does not
  cover.
- Tables read: core `files`, addon `loft_metadata`. Tables written: none by this change;
  the context menu writes only through existing core endpoints.
- Rules passed through: drive boundary and 404 hiding
  (`.claude/rules/design-decisions.md`), Active-only file state, addon implementation
  discipline (no core → addon dependency), SPA navigation (no full reload), `DESIGN.md`.
- Docs: `docs/addons/media-import.md` (the endpoint, the channel view, its menu),
  `docs/user-guide/viewers-and-players.md` (one sentence on the YouTube line: the channel
  name opens that channel's videos in this drive).
- Core repository: the `addons/media_import` submodule pointer bump, this spec, its
  ledger rows, the review directory.
- No protected path is edited.

## Invariants

I1. The endpoint returns only files whose `drive` equals the verified `X-Lit-Drive`
drive; a locked or unknown drive answers 404 with `{"detail": "Drive not found: <drive>"}`
and returns no ids, whatever the other parameters are.
I2. The endpoint returns only Active files (`deleted_at` and `missing_since` both NULL)
whose `loft_metadata.provider` equals `provider` and whose `loft_metadata.channel` equals
`channel` exactly; another channel, or the same channel name under another provider, is
never in the answer.
I3. The endpoint writes nothing to the core DB, the addon tables or the drive, and on an
accessible drive a missing, empty or whitespace-only `provider` or `channel` answers 422
with no ids.
I4. Cards appear in the endpoint's order (the `_PUBLISHED_SORT_KEY` date descending,
then `files.created_at` descending, then file id descending), regardless of the order
`getShelves` answers in.
I5. Every matching id that `getShelves` returns becomes a card by scrolling to the end,
including when a batch of 60 returns no card and across a failed step and its retry;
at most one load step runs at a time, none runs once every id has been read, and `empty`
is shown only when the whole list resolved to zero cards.
I6. A later load step that fails keeps every drawn card and offers a retry; a failed
first load offers a retry for every failure, 404 included; an answer for an earlier
channel, an earlier load or the management view never replaces what is shown.
I7. The channel link targets the panel's own drive and the metadata's own provider and
raw channel, each `encodeURIComponent`-encoded, and is absent for a null, empty or
whitespace-only channel; the channel link, the back link and a card navigate client-side,
without a full page reload.
I8. Without both `provider` and `channel` (each with a non-whitespace character) the
Media Import page draws what it draws today; with both, it does not call
`listSubscriptions` and draws no Composer, subscriptions dashboard, activity or
management header.
I9. A channel-view card's byline is its publication date alone (no channel), absent when
the date is null or unparseable; the Watch shelves' byline stays "channel · date" in the
same format.
I10. Right-click or a 500 ms still press on a card opens the file context menu for that
card's file without also opening the file; after a rename, move or trash from it
succeeds, the view reloads and a trashed file is no longer listed, while the other rows
do not reload it.

## Checked, no action

- A Litloft list keyed by channel id: `loft_metadata` stores no channel id, and adding one
  needs a refresh of every existing `.loft`. Name matching splits a renamed channel into
  two lists; accepted for a personal tool.
- Opening the channel on YouTube (option B): declined by the user in favour of the
  in-library list.
- Putting the list in the core video app (`VideoShelfPage`): its shelf providers take no
  parameter, so it needs a core change; the Media Import page needs none.
- Internal API `/files/matching` or a core filter: the channel is addon data and not a
  core entity (`internal-api-policy.md` R1).
- Linking a subscribed channel to its subscription panel instead: unsubscribed single
  imports would get no list, and the panel is a management view.
- Pagination in the endpoint: the id list is small; paging the card fetch is enough.
- A video count in the header: the design omits it.
- One column at 390 px, as first drawn: the human chose the core grid's 2 columns.
- The drive name beside the title, as first drawn on desktop: the human chose
  `PageHeader`'s layout (below the title).
- Drawing the loading, empty, failed and menu states: the human chose the core
  components without a drawing.
- The video app card menu (`VideoCard`'s own `menu`): it would offer only "open in new
  tab" here; the human chose the file list's menu.
- Keeping cards and scroll position across a menu-triggered reload: a full reload is
  simpler and the list is rebuilt in one or two requests.
- Inline rename in the card: the cards have no editable title; the rename dialog is used.
- An unparseable `published_at` sorting by import date: the existing sort key sorts it by
  its own text; yt-dlp writes `YYYYMMDD`, so this does not arise in use.
- Filtering by `drives.json.addons.media_import` policy: the existing Media Import
  endpoints do not apply it in-process, and this one follows them.
- The mobile inspector sheet: the link navigates away like any other link in it.
- Playback when the channel link is clicked under a playing player: it is an ordinary
  client-side navigation away from the file, and playback does what it does for any other
  link on that page today. Nothing special is added. (Human to confirm at approval.)
- Coming back from a card to the channel view: it mounts fresh and starts at the top with
  the first batch; the scroll position is not restored. (Human to confirm at approval.)
