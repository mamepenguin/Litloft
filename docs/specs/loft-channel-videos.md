# Channel name opens the channel's videos

SPEC-ID: SPEC-ADDON-160
SPEC-ID: SPEC-ADDON-161
SPEC-ID: SPEC-ADDON-162

Approval:

## Summary

On a `.loft` file imported by Media Import, the channel name shown under the title (the
inspector's Info tab, and the same panel under the player on the collection surface)
becomes a link. It opens the Media Import page in a channel view that lists every active
`.loft` in the same drive whose stored provider and channel name equal the clicked ones,
newest first, drawn with the video app's cards. Everything lives in the Media Import
addon; the core is not changed.

- SPEC-ADDON-160: the channel name in the `loft-metadata` panel is a link to the channel
  view.
- SPEC-ADDON-161: `GET /api/addons/media_import/channel-videos` returns the ordered file
  ids of one channel in one drive.
- SPEC-ADDON-162: the Media Import page with `?provider=&channel=` shows the channel view
  instead of its management content.

Agreed design: <https://claude.ai/artifact/Lcjv9j1JRfhFgNtB7PgveE>, saved in
`docs/process/reviews/feature-loft-channel-videos/design/` (`Main.dc.html` desktop at
1440 px, `Phone.dc.html` at 390 px, `Inspector.dc.html` the link in the Info tab). Sample
titles, dates and the sidebar in the artboards are placeholders.

## Required items

### 1. Normal flow

1. The viewer opens a `.loft` file. `LoftMetadataPanel` reads its metadata as today.
2. When `metadata.channel` is a non-empty string, it is drawn as a link to
   `/drive/<drive>/addons/media_import?provider=<metadata.provider>&channel=<metadata.channel>`
   (each value percent-encoded). The drive is the panel's `drive` prop.
3. Clicking it is a client-side navigation (Next `Link`), no full reload.
4. The Media Import page reads `provider` and `channel` from the query. When both are
   non-empty it draws the channel view and none of its management content (Composer,
   subscriptions dashboard, activity).
5. The channel view calls `GET /api/addons/media_import/channel-videos?provider=&channel=`
   with `X-Lit-Drive: <drive>`. The answer is
   `{"items": [{"file_id": "...", "published_at": "..." | null}, ...]}`.
6. The view resolves the ids into cards through the core's `getShelves(drive, {by: "all",
   key: "all", per_shelf: 60, ids})`, 60 ids per call, in list order, and draws them with
   the core `VideoGrid` and `VideoCard`. The first 60 load on entry; the next 60 load when
   the grid's end comes near (`useNearEnd`), until the id list is exhausted.
7. Card order is the endpoint's order, whatever order `getShelves` answers in. An id the
   shelves answer does not return is skipped.
8. Each card's byline is the item's publication date formatted as the Watch shelves format
   it (`calendarDate` + `Intl.DateTimeFormat(locale, {year: "numeric", month: "short",
   day: "numeric", timeZone: "UTC"})`); no byline when `published_at` is null or
   unparseable. The channel name is not repeated in the byline.
9. Clicking a card opens the file as `VideoCard` does everywhere else.

### 2. Failure cases

- `metadata.channel` null or empty (whitespace only counts as empty): no link, nothing
  drawn for the channel, as today.
- `provider` or `channel` missing or empty in the query: the page draws its normal
  management content.
- Endpoint 404 (drive locked or unknown): the view shows the error state.
- Endpoint or a `getShelves` call fails (network, 5xx): the first load shows the error
  state with a retry; a later page's failure keeps the cards already drawn and shows a
  retry under them.
- The channel has no active `.loft` in the drive (all trashed or missing, or the channel
  was renamed upstream and refreshed): the empty state.
- Every id is dropped by `getShelves`: the empty state.

### 3. States

Channel view: `loading` (skeleton grid) → `ready` | `empty` | `failed`. From `ready`:
`loading-more` → `ready` | `more-failed`; `more-failed` → `loading-more` on retry;
`failed` → `loading` on retry. Changing the query (another channel, or leaving the
channel view) discards the old state; an answer for an earlier query is not drawn.

### 4. Data read and written

- Read: core `files` (`id`, `drive`, `created_at`, `deleted_at`, `missing_since`) and the
  addon's `loft_metadata` (`file_id`, `provider`, `channel`, `published_at`), through the
  addon's existing `SessionLocal`.
- Read: core `GET /api/drives/{drive}/shelves` (already public; the knowledge addon calls
  it the same way).
- Written: nothing. No table, column, index, migration or file.

### 5. External services

None. Nothing calls YouTube or any provider; the list is built only from what is already
stored.

### 6. Authorization

- The endpoint resolves the drive with the existing `_scoped_drive` (`X-Lit-Drive`
  required, 400 when absent; `check_drive_access`, 404 for a locked or unknown drive) and
  filters `files.drive` to that drive. No cross-drive result is possible.
- `getShelves` applies the core's own drive access check.
- The link carries only the panel's own drive.

### 7. Effect on existing features

- `LoftMetadataPanel` is drawn in the file page's Info tab and on the collection surface
  under the player; both get the link (same component).
- The Media Import page without the two query parameters is unchanged.
- No change to `loft_metadata` writers, the Watch lanes, subscriptions, or the core.
- The addon starts importing `VideoGrid`, `VideoCard`, `SkeletonGrid` and `getShelves`
  from the core frontend (addon → core is allowed; the reverse is not added).

### 8. Error behavior

- Error state: the core `EmptyState` with the addon's error text and `RetryButton`.
- Empty state: the core `EmptyState` with the addon's "no videos" text.
- The endpoint logs nothing beyond FastAPI's own request handling.

### 9. User-visible behavior

From the agreed design:

- Info tab: the channel name keeps its current weight and color (`font-medium
  text-text-primary`, 12 px) and its place before ` · <published_at>`; it gains an
  underline on hover and the pointer cursor. Nothing else in the panel moves.
- Channel view header, top to bottom: a back link (chevron-left icon + the Media Import
  page name, muted 13 px) to the same page without the query; the channel name as the
  page title; the drive name as the muted scope. No count, no icon before the title.
- Below it, the grid of video cards, nothing else on the page.
- Desktop (1440 px window with the sidebar): 3 columns, the core `VIDEO_GRID` rule
  (320 px minimum card width, 16 px column gap, 32 px row gap). 390 px: 1 column.
- Each card: 16:9 thumbnail with rounded corners, duration badge bottom right, watch
  progress bar when the viewer has progress, the title in up to 2 lines, the publication
  date beneath. Exactly the core `VideoCard`.
- Order: publication date, newest first; files without a publication date sort by their
  import date in the same sequence; ties by import time, then file id, all descending.
- Strings (ja / en) added under `mediaImport.channelView`: empty text, error text. The
  back link reuses `mediaImport.sidebar.label`.
- The browser tab title stays the Media Import page's.

### 10. Non-functional

- The endpoint returns every matching id with no cap. A channel of a few thousand files
  is a few tens of KB of JSON; one query over `loft_metadata` joined to `files` on the
  primary key, no new index.
- Card data is fetched 60 ids at a time and only as the viewer scrolls.
- Matching is exact on the stored strings: `provider` equal, `channel` equal
  (case-sensitive, no trimming of stored values).

## Touch points

- `addons/media_import/backend/router.py`: new `GET /channel-videos` handler.
- `addons/media_import/backend/schemas.py`: response models for it.
- `addons/media_import/backend/subscription/db.py` (or a sibling query module): the
  ordered query, reusing `_PUBLISHED_SORT_KEY`.
- `addons/media_import/frontend/LoftMetadataPanel.tsx`: the channel link.
- `addons/media_import/frontend/Page.tsx`: query parameters choose the channel view.
- `addons/media_import/frontend/ChannelVideos.tsx` (new): the channel view.
- `addons/media_import/frontend/api.ts`: `listChannelVideos`.
- `addons/media_import/frontend/watchShelfProviders.ts`: export the date formatting so
  both use one implementation.
- `addons/media_import/frontend/messages/{ja,en}.json`: `mediaImport.channelView.*`.
- Core frontend modules the addon starts importing (not edited):
  `components/appshell/VideoGrid`, `components/videoapp/VideoCard`,
  `components/videoapp/VideoPagedGrid` (`SkeletonGrid`), `components/EmptyState`,
  `components/appshell/RetryButton`, `components/appshell/useNearEnd`, `lib/api`
  (`getShelves`).
- Tables read: core `files`, addon `loft_metadata`.
- Rules passed through: drive boundary and 404 hiding
  (`.claude/rules/design-decisions.md`), `active_file_filter` semantics (Active only),
  addon implementation discipline (no core → addon dependency), SPA navigation (no full
  reload), `DESIGN.md`.
- Docs: `docs/addons/media-import.md` (the endpoint and the channel view),
  `docs/user-guide/viewers-and-players.md` (one sentence on the YouTube line: the channel
  name opens that channel's videos in this drive).
- Core repository: the `addons/media_import` submodule pointer bump, this spec, its
  ledger rows, the review directory.
- No protected path is edited.

## Invariants

I1. The endpoint returns only files whose `drive` equals the verified `X-Lit-Drive`
drive; a locked or unknown drive answers 404 and returns no ids.
I2. The endpoint returns only Active files: a file with `deleted_at` or `missing_since`
set is never in the answer.
I3. The endpoint returns a file only when its `loft_metadata.provider` equals `provider`
and its `loft_metadata.channel` equals `channel` exactly; a file of another channel, or
the same channel name under another provider, is never in the answer.
I4. The endpoint and the channel view write nothing: no row, column or file changes in
the core DB, the addon tables or the drive.
I5. Cards appear in the endpoint's order (publication date descending, import date
standing in where it is absent, ties by import time then file id descending), regardless
of the order `getShelves` answers in.
I6. Every matching id is reachable by scrolling: no id beyond the first 60 is silently
dropped except one `getShelves` does not return.
I7. The link's target carries the panel's own drive and the metadata's own provider and
channel; a channel with no name draws no link.
I8. Without both `provider` and `channel` in the query, the Media Import page draws what
it draws today.
I9. An answer for an earlier channel (or for the management view) never replaces the
cards of the channel now in the query.

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
- Filtering by `drives.json.addons.media_import` policy: the existing Media Import
  endpoints do not apply it in-process, and this one follows them.
- The mobile inspector sheet: the link navigates away like any other link in it; no
  special handling.
