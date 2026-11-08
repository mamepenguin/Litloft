# Video library: a built-in app with Discover and Library faces

SPEC-ID: SPEC-CORE-054
SPEC-ID: SPEC-CORE-055
SPEC-ID: SPEC-CORE-056
SPEC-ID: SPEC-CORE-057

Approval: sha256:3802363ed6d4223f69c5ba8f2766457d393097f13aaa707b38aac176c4d9c549 Yuichi Senga 2026-11-07

## Summary

Inside one drive, the sidebar gains a **Video** entry that opens a purpose-built way into
the drive's videos, beside Library, Notes and Ask. An *app* is a bundle of a target (which
files it works on), a view, and an entry. This change adds the first core-owned app, the
video library, and nothing user-defined: there is no app editor and no new settings screen.

- **SPEC-CORE-054**: a small core registry of built-in apps, the sidebar row it produces,
  and the route `/drive/{drive}/apps/video`. The registry names no addon; addon entries
  keep the manifest `navigation` declaration they have today and are not touched.
- **SPEC-CORE-055**: the app's target. Each app owns a default target (the video app:
  every active video of the drive). The viewer may replace it with one of the drive's smart
  folders. The choice applies to every face and is remembered per drive.
- **SPEC-CORE-056**: one read endpoint, `GET /api/drives/{drive}/shelves`, that groups the
  drive's files into shelves by folder, tag, month added, length or watch state, with
  counts and the first items of each shelf, under the same filters as the file listing.
- **SPEC-CORE-057**: the video library view. Two faces under underline tabs, **Discover**
  (shelves that lead straight to watching: Continue, Recommended, New) and **Library**
  (browse the videos by a chosen classification: Folder by default, Tag, Month added,
  Length, Watch state). The tab and the classification are remembered per drive.

Music is out of scope: it needs artist, album and track metadata the backend does not
hold. Notes keeps its current route and gets no target override in this change.

The viewer is one person on a PC browser; the phone layout runs the same pages. The iOS app
is not changed and its result is not verified (see 10).

## Required items

### 1. Normal flow

1. The viewer is inside a drive. The sidebar (the same component serves the desktop column
   and the phone drawer) shows **Video** directly after Library and before the addon rows
   (`AddonNavRows`). Choosing it opens `/drive/{drive}/apps/video`. The page header has the
   video icon tile, the title **Video**, the scope line "<drive> · N videos", and a
   **Target** button. N is the number of videos under the current target (the default
   target's count is the drive's active videos); while it loads the scope line shows the
   drive name alone.
2. The page opens on the face last used in this drive (Discover on first use). Underline
   tabs switch faces without a page load; the selection is saved for the drive.
3. **Discover** shows, top to bottom, up to three shelves of at most 12 videos each, each
   from its own request, all under the target:
   - **Continue**: `GET shelves?by=watch&key=in_progress&sort=last_played&per_shelf=12`.
     The viewer's started, unfinished videos, most recently played first.
   - **Recommended**: `GET shelves?by=watch&key=unwatched&sort=random&per_shelf=12`, a
     random sample of videos the viewer has not watched.
   - **New**: the existing listing, `GET files?sort=created_at&order=desc&limit=12`, newest
     added first.
   Cards show the thumbnail, the title and the duration label; Continue cards also show a
   progress bar from `watch_progress`. Recommended is fetched when the page opens and keeps
   its sample while the viewer switches faces and back; it is drawn again on a reload or a
   retry. A video the viewer only opened (no playback) is `unwatched` and may be recommended.
   A shelf with no videos is not drawn. Choosing a video opens its normal file page and
   plays; resume position, the mini-player and continuous play are the existing ones.
4. **Library** shows a **Classification** button (Folder by default) and a sort menu
   offering Added (newest first, the default), Added (oldest first), Title, and Size. There
   is no random order here. Below, shelves of the chosen classification, each with a title,
   a count, the first 5 videos and **See all**. Shelves are loaded 12 at a time as the viewer
   scrolls. **See all** opens `/drive/{drive}/apps/video/shelf?by=<c>&key=<k>`, a grid of
   that shelf's videos paged 60 at a time, with the same Target and sort.
5. The classifications and their shelves:
   - **Folder**: one shelf per first path segment of `folder_path`, ordered by video count
     descending then name. Videos at the drive root form one shelf whose `key` is `""`; the
     client labels it with the drive's name.
   - **Tag**: one shelf per tag, ordered by video count descending then name. A video with
     several tags appears in each of their shelves. Videos with no tag form a last shelf,
     key `no_tag`.
   - **Month added**: one shelf per calendar month of `created_at` in UTC, newest first,
     key `YYYY-MM`. The client shows it in the viewer's locale ("2026年11月", "Nov 2026").
   - **Length**: `under_10m` (duration under 600 s), `10_to_30m` (600 s up to but not
     including 1800 s), `30m_plus` (1800 s or more), in that order. A video whose duration
     is unknown (null or 0) is in none of them.
   - **Watch state**: `in_progress`, `unwatched`, `finished`, in that order (definitions in
     I4). Empty fixed shelves are omitted.
6. **Target** opens a menu: the app's default target ("All videos", with its count) at the
   top, then the drive's smart folders. Choosing one re-fetches the current face. The
   button reads `Target  <name>`, truncated with an ellipsis when long. The choice is saved for the drive. A smart folder's own
   saved sort (`sort_by`, `sort_order`) is ignored by the app: the sort menu in Library and
   the fixed orders in Discover are the app's.
7. Target and base condition. The client always sends `type=` as the intersection of the
   app's base kinds ({video}) with the target's kinds: the smart folder's `file_type` and any
   kind operators in its `query` (as `parseSearchQuery` yields them). The query parts the app
   supports are exactly those with a listing parameter: free text (`search`, which matches
   titles and folder paths as the listing does), `tag`, `type`, `folder`, `collection`,
   `size`, `duration`, `favorite`, `liked`. A smart folder whose query has any other part is
   not usable as a target: the menu lists it disabled and it cannot be chosen, so a part is
   never dropped silently. A smart folder's `folder` condition and the Folder shelf's key
   both apply (AND). The backend adds no
   kind condition of its own and takes the `type` it is given, as the listing does. When the
   intersection is empty the client sends no request and draws the empty state. All other
   conditions of the smart folder's query reach the endpoint as the same parameters the
   listing takes. Nothing about a smart folder is stored or interpreted by the backend
   beyond what it does today.

SPEC-CORE-056 request and response:

`GET /api/drives/{drive}/shelves?by=folder|tag|month|duration|watch` plus every filter
parameter of `GET /api/drives/{drive}/files` (`search`, `favorite`, `liked`, `tag`, `type`,
`folder`, `collection`, `size`, `duration`, `trust`) with the listing's meaning (`path` and `recursive` are not
parameters here), and:

- `sort` / `order`: item order inside a shelf. The listing's values, plus `last_played`
  (valid only with `by=watch`; the viewer's `last_played_at`, newest first with `desc`).
  `random` is valid only without `page` (a keyed request for the first page of
  `per_shelf` items is allowed); a keyed request with `page` and `random` is a 422. With
  `last_played`, the viewer's rows are ordered by `last_played_at` with ties broken by file
  id, and a file with no row sorts after every file that has one.
- `per_shelf` (1 to 60, default 5): items per shelf, or the page size when `key` is given.
- `shelf_limit` (1 to 24, default 12) and `offset` (shelves to skip): paging over shelves.
- `key` (optional) selects one shelf; with it, `page` (1-based) pages that shelf's items
  and `shelf_limit` and `offset` are ignored. `page` without `key` is a 422. An `offset`
  past the last shelf gives 200 with `shelves: []` and the true `total_shelves`. `key` present
  but empty is the root-folder shelf and is valid only with `by=folder`; with any other
  `by` it is a 422. A fixed key (`no_tag`, `under_10m`, `in_progress`, ...) is meaningful
  only under its own `by`; a folder or tag may be named like one without collision because
  keys are interpreted per `by`.

Response `ShelvesResponse {by, shelves: [{key, label, count, items: [FileResponse]}],
total_shelves}`. `items` are the listing's `FileResponse`; under `by=watch` each also carries
`watch_progress {position, duration}` from the viewer's row (absent when there is none), the
shape `/watch-history` already uses, so a Continue card can show progress. `count` is the
shelf's whole size under the filters, not the length of `items`; `total_shelves` is the
number of shelves under the filters, or 1 when `key` is given. `label` is the data value
(a folder segment, a tag, `YYYY-MM`) and is empty for fixed shelves, whose text the client
supplies.

Key matching: a folder key matches a file when `folder_path` equals the key or begins with
the key followed by `/`, NFC-normalised and LIKE-escaped as the listing does. A tag shelf is
one `Tag` row of this drive (`tags.drive == drive`), grouped and keyed by its stored name
with no case folding, so the grouped `count` and the keyed query use one rule; the `tag`
filter parameter still follows the listing's rule. Length buckets compare `File.duration`
cut to whole seconds, as the listing's `duration` filter does, so a keyed `under_10m`
request returns the same set as the listing with `duration=lt:600`; the watch buckets use
the viewer's history row only. A `key` that names no existing shelf gives 200 with an empty
shelf (`count` 0, `items` `[]`), and so does a `page` past the last page.

The filter construction of `list_drive_files` is extracted into one helper that both
endpoints call; the listing's behaviour, response and tests do not change.

### 2. Failure cases

- The remembered smart folder no longer exists, or is not among this drive's smart folders.
  The app uses the default target for display and requests and shows no error. The saved
  value is replaced by the default.
- A smart folder whose kinds do not intersect video matches nothing. Every face shows its
  empty state; the Target button keeps the name.
- The smart folder list fails to load. The Target menu shows only the default target; the
  page uses the default target.
- `by=watch`, or `sort=last_played`, with no viewer identity: 400 with `detail` code
  `viewer_required`. The client does not send it without a local profile (see 3). If it
  arrives anyway (the cookie is missing or expired), the client treats that call as the
  no-profile state: it omits Continue, draws Recommended from the listing and hides Watch
  state, and shows no retry, because a 400 is not retried.
- Filter normalisation errors (`folder`, `collection`, `size`, `duration`): 400, as the
  listing. Out-of-range or malformed parameters (`by`, `per_shelf`, `shelf_limit`, `order`,
  `trust`), `page` without `key`, `random` with `key`, `sort=last_played` without
  `by=watch`, and an empty `key` under a `by` other than folder: 422. A client tells
  `viewer_required` apart from other 400s by its `detail`.
- A shelf request is slow or fails (network or 5xx) while others succeeded: that shelf shows
  its loading state, then an inline retry (the existing retry string); the others stay. No
  response-time bound is required. Discover treats each of its three shelves the same way.
- Locked or unknown drive: 404, as the listing (`_validate_drive`).
- A stored face, classification or target value the client does not know (an older or newer
  build, or a stale id): treated as absent; the defaults apply (I9).

### 3. States

- Face: Discover | Library. Saved per drive, default Discover.
- Classification: Folder | Tag | Month added | Length | Watch state. Saved per drive,
  default Folder. Only Library reads it.
- Target: default | smart folder id. Saved per drive, default `default`.
- Per shelf: loading | loaded | empty (not drawn) | failed (retry).
- **No profile**: the client's own profile state (`useProfile().nickname === null`, the
  existing "no profile, nothing persisted server-side" rule). In that state the
  Classification menu does not offer **Watch state**, Discover omits **Continue**, and
  **Recommended** is `GET files?sort=random&limit=12` (a sample of all videos under the
  target), because the endpoint has no flag for it. If the saved classification is Watch
  state and there is no profile, Folder is used for display and the saved value is kept, so
  it returns when a profile is set. Setting or clearing a profile re-evaluates these
  options on the next render of the page; no reload is required.
- Transitions: any change of face, classification or target saves immediately and re-fetches
  only what that face needs. There is no state in which two faces are shown.

### 4. Data read and written

Reads: `files` (active only, through `active_file_filter()`), `tags` and `file_tags`,
`watch_history` (the requesting viewer's rows only; the only calls that read it are
`by=watch` and `sort=last_played`), `smart_folders` (existing list endpoint), and `drives.json`
through the existing drive validation.

Writes: none in the backend; the endpoint changes no row and creates no file. The client
writes three values to `localStorage` per drive (face, classification, target id), under
one key per drive. Losing them changes nothing but the defaults. No table, column,
migration, file or cache is added.

### 5. External services

None. The endpoint is a SQL read path. An unreachable backend shows the existing error state
of the page.

### 6. Authorization

The shelves endpoint uses the listing's gate: `get_unlocked_groups`, `_validate_drive` and
`check_drive_access`; a locked drive answers 404 and its existence is not revealed. Watch
state is computed only from the requesting viewer's own `watch_history` rows, with the
viewer id from the existing `get_viewer_id` dependency, so the `X-Lit-Viewer` header is
honoured for a non-browser client exactly as it is for `/watch-history`. Another viewer's
state is never readable. Items are `FileResponse` as the listing returns them. No
cross-drive grouping exists: every request names one drive and every query is drive-scoped
(`File.drive == drive`). The app route is a client page under the existing drive layout,
which already handles a locked drive.

### 7. Effect on existing features

- The sidebar gets one more row. The section order store and the drag-reorder store are
  unaffected: the row is fixed in position, not an item the viewer reorders.
- Addon navigation (`addonNavEntries`, manifest `navigation`) is unchanged. Notes and Ask
  appear exactly as before.
- Library, Home, `?view=` views and smart-folder pages are unchanged. Home keeps its own
  sections; Discover is a separate surface that may show some of the same videos.
- The file listing's response and behaviour are unchanged. Its filter construction moves
  into a shared helper (see 1); the existing listing tests run unchanged.
- `WatchHistory` is read, never written. **Finished** and **in progress** here are defined
  positively (I4); the `/watch-history` `unfinished` filter keeps its meaning, and a view-only
  row that endpoint treats as not unfinished is **unwatched** here.
- The route segment `apps` joins `search`, `collections` and `addons` as a fixed segment
  under `/drive/{name}/`. A folder at the drive root named `apps` is today served by the
  catch-all `[...path]` route, and after this change its URL `/drive/{drive}/apps` is the
  app route instead. A root folder named `search` is shadowed the same way today, so this is
  the existing limitation, extended by one name. See Questions for the human.

### 8. Error behavior

An invalid request is a 4xx with the listing's error body. A failing shelf draws an inline
retry in that shelf; the page never goes blank for one shelf. An unexpected server error is
logged with the drive name and `by`, never file names or paths.

### 9. User-visible behavior

Text (ja and en, through `messages-core`; no emoji, lucide icons): **Video**, tabs
**Discover** / **Library**, **Continue**, **Recommended**, **New**, **Classification** with
**Folder / Tag / Month added / Length / Watch state**, **Target** with **All videos**,
**See all**, **No tag**, **In progress / Unwatched / Finished**, **Under 10 min / 10 to 30
min / 30 min or more**, and the sort labels. The empty state, the retry string and the unit for counts reuse the
existing message keys where one exists (counts use an ICU plural); a target with no
videos reads "0 videos" in the scope line. The agreed screens are the Design Artifact
`https://claude.ai/artifact/6ZHAEAJLfcjneNShQ13jb4`; there is no explanatory copy beyond the
labels. Defaults: Discover, Folder, default target, newest first. Counts use the viewer's
locale number format. `docs/user-guide/` gets a page for the Video entry (where it is, the
two faces, the classifications, the Target menu, why Watch state and Continue are missing
without a profile). `docs/reference/api.md` documents the endpoint.

### 10. Non-functional

- The number of queries one shelves request issues does not grow with the number of
  shelves (a grouped count plus one query for the items of the requested shelves). This is
  a design intent for the reviewer, not a tested property.
- Caps: a response holds at most 24 shelves of 60 items (1,440 items); `per_shelf` and
  `shelf_limit` above their caps are a 422. A request cannot ask for the drive.
- The client loads at most 12 shelves at a time and prefetches nothing for the other face.
- Watch state of one viewer is never cached across viewers on the server.
- Privacy: the response carries only what the listing carries to that viewer.
- Months are UTC, because `created_at` is stored in UTC; a video added late in the evening
  local time can fall in the next month's shelf. See Questions for the human.
- Not verified here: the iOS app (it does not render this route) and a drive far larger than
  about 6,000 videos (`agent_cannot_verify`).

## Touch points

- `frontend/src/lib/builtinApps.ts` (new): the registry of core-owned apps (id, label key,
  icon, route, default target, faces).
- `frontend/src/components/sidebar/SidebarLibrarySection.tsx`: one row after Library,
  before `AddonNavRows`; the same component serves the phone drawer.
- `frontend/src/lib/driveViews.ts` and `frontend/src/components/sidebar/libraryRowActive.ts`:
  `apps` as a fixed segment; active-row logic for the new row.
- `frontend/src/app/drive/[name]/apps/video/page.tsx` and `.../shelf/page.tsx` (new).
- `frontend/src/components/videoapp/` (new): the faces, shelves, classification menu and
  Target menu; `frontend/src/lib/appPrefs.ts` (new) for the per-drive `localStorage` values.
- `frontend/src/lib/api.ts`: `getShelves`. `frontend/src/messages-core/ja.json`, `en.json`.
- `backend/app/routers/drives.py`: the listing's filter construction extracted into a shared
  helper (the listing path is edited); the new `GET /api/drives/{drive}/shelves` endpoint
  next to it, or in a new router under the same prefix. `backend/app/schemas.py`:
  `ShelvesResponse`.
- `frontend/src/app/drive/[name]/layout.tsx` (header chrome for the new route and the phone
  drawer closing on navigation); every `usePathname` consumer that tests a fixed segment
  (`isDriveSearchPath` and its siblings) is checked for the new `apps` segment.
- A layout measurement of Discover and Library on a narrow and a wide viewport in
  `frontend/e2e-layout/` (real boxes against a static fixture; jsdom lays nothing out).
- Tests: new backend tests for the endpoint and frontend tests for the app, registered the
  way the project's gates expect; the existing listing tests are unchanged.
- Rules passed through: `design-decisions.md` (drive boundary, File state, Watch history),
  `backend-conventions.md` (drive-scoped queries, `active_file_filter()`),
  `frontend-conventions.md` (`DESIGN.md`, i18n, `messages-core`), `DESIGN.md` §§1-3, 5, 6, 9.
- Docs: `docs/user-guide/` (new page), `docs/reference/api.md`, and the ledger
  `docs/specs/INDEX.md`. `internal-api-policy.md` and `docs/ADDON-DEVELOPMENT.md` are not
  touched: no Internal API endpoint changes. `docs/FEATURE-MAP.md` and `docs/README.md` are
  outside this change.
- Protected paths edited: none named in `docs/process/risk-and-human-review.md`; the Watch
  state branch reads viewer-scoped data and the review step applies mutation review to it
  (`by=watch`, `sort=last_played`, the viewer filter), because a bug there is a silent wrong
  result for one viewer.

## Invariants

I1. A request for shelves of one drive never returns, counts or groups a file that belongs
to another drive, a locked or unknown drive answers 404, and the endpoint changes no row.

I2. Every file in a shelf's `items`, and every file counted in its `count`, is an active
file (neither trash nor missing) that satisfies every filter sent with the request.

I3. Under `folder`, `month`, `duration` and `watch` a file is in at most one shelf, and in
exactly one except a file of unknown duration under `duration`; under `tag` it is in one
shelf per `Tag` row of this drive it carries, or in `no_tag` if it carries none.

I4. For the requesting viewer's row: `finished` is a row with duration above 0 and position
at or above 90% of it; `in_progress` is a row with duration above 0, position above 0 and
below 90% of it; every other file, including one with no row, a position of 0 or a duration
of 0, is `unwatched`. Another viewer's history never changes which shelf a file is in, and
`by=watch` or `sort=last_played` without a viewer identity returns 400 `viewer_required`
and no file data.

I5. A shelf's `count` equals the number of files `key` returns across all its pages, and for
any non-random `sort` the `items` of an unkeyed request are the first `per_shelf` files of
the order that `key` pages through.

I6. The `type` sent by the video app is always a subset of {video}; a target whose kinds do
not intersect video produces no request and an empty state, so a smart folder can never
make the app list a file that is not a video, and a target with a query part the app does
not support cannot be chosen.

I7. The file listing returns the same response for the same request before and after its
filter construction is moved into the shared helper.

I8. Discover's shelves are: Continue = the viewer's `in_progress` videos, most recently
played first; Recommended = a random sample of the viewer's `unwatched` videos (of all
videos under the target when there is no profile); New = videos by `created_at`
descending; each at most 12; a shelf with no videos is not drawn; Continue is not drawn
without a profile.

I9. Library orders shelves by video count descending then name for folder and tag (with
`no_tag` last), newest first for month, and in the fixed order for length and watch state;
it shows 5 videos per shelf, loads 12 shelves at a time, and pages **See all** 60 at a time.

I10. The face, classification and target are remembered per drive under separate keys; a
stored value that is unknown, stale, not offered in the current state, or a smart folder id
that is not in this drive's list falls back to its default without an error screen and is
never sent to the backend; a saved Watch state survives the profile's absence.

I11. **Video** appears after Library and before the addon rows, is selected only on the app
routes, and leaves every addon's `navigation` entry rendering in the same rows and order as
before; the core registry names no addon.

## Questions for the human

- **UTC months.** Months are cut in UTC, so a video added late in the evening in a zone ahead
  of UTC can land in the next month's shelf. Accept, or cut in the viewer's local zone
  (needs a timezone parameter; changes 1, 10 and I3)?
- **The `apps` folder.** A root folder named `apps` becomes unreachable at its URL, as
  `search` is today. Accept, or move the route (for example `?view=app-video`; changes 1, 7 and the touch points)?
- **Continue without a profile.** Omitted, because only profile-bound watch history is
  stored server-side. Accept, or read the browser-local history as Home does? (The second changes 3, 4 and I8.)
- **Just-opened videos.** A video the viewer only opened, without playing, is `unwatched` and
  can be recommended again at once. Accept, or exclude recently opened videos from
  Recommended? (The second changes I4 and I8.)

## Checked, no action

- **User-defined apps and an app editor.** Decided out: built-in apps only, no settings
  screen.
- **Notes target override.** Notes keeps the manifest `navigation` declaration and gets no
  override now; the override needs the addon to accept a scope and is a separate spec,
  through a generic slot, never through core knowing "notes".
- **Music app.** Needs artist/album/track metadata that scanning does not produce.
- **Per-folder apps.** A smart folder with a `folder:` condition already expresses it.
- **Cross-drive anything.** A drive is a security boundary (`design-decisions.md`, Drives);
  the app, the endpoint and the stored preferences are per drive.
- **Server-side storage of face, classification and target.** They are per-viewer
  conveniences; `localStorage` is enough and a loss only resets defaults.
- **Reordering or hiding the Video row.** It is fixed like Home and Library.
- **Recommending by similarity.** Recommended is a random sample of unwatched videos; no
  ranking model, no LLM call, no addon dependency.
- **Internal API.** Addons do not call the shelves endpoint; R1-R5 do not apply.
- **A drive with no videos.** The row is always shown and the page draws the existing empty
  state, so the sidebar needs no count query.
- **A video of unknown duration under Length.** It joins no shelf; showing it somewhere would
  invent a length, and it stays reachable through the other classifications.
- **Tag case folding in shelves.** Tag shelves use the stored `Tag` name of this drive
  without folding; the listing's `tag` filter keeps its own folding, and the two are not
  asked to agree on `Foo` versus `foo`.
