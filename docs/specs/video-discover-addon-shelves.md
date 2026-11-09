# Video Discover: addon-ranked Recommended and addon shelves

SPEC-ID: SPEC-CORE-067
SPEC-ID: SPEC-CORE-068
SPEC-ID: SPEC-ADDON-087
SPEC-ID: SPEC-ADDON-088

Approval:

## Summary

The video app's **Discover** face (SPEC-CORE-057) draws three core shelves: Continue,
Recommended and New. Recommended is a random sample of the viewer's unwatched videos, which
recommends nothing. Two addons already compute lists for someone looking for something to
watch, but Discover cannot reach them, because the core never names an addon:

- Intelligence's **Pickup** ranks the files a viewer has never opened by how well they match
  that viewer's history in the drive. It is shown only on the drive home today.
- Media Import's **Watch** view has two lanes: **Regular sources** (the latest videos from
  subscriptions set to *regular*, at most 2 per source) and **Recent videos** (videos from
  subscriptions set to *feed*, newest first). They are shown only on the addon's own page.

The video app is a screen for a person looking for a video, so these lists belong there. An
earlier decision kept Media Import's feed off the drive home, which shows every kind of file.
That decision covers the home only, and this change leaves the home as it is.

This change adds a data-provider kind of slot entry. An addon's `slots.ts` may export
functions that return **ordered file ids**. The core draws the shelf itself, with its own
cards, and only after it has narrowed those ids through its own filter for the app's target.

- **SPEC-CORE-067**: `GET /api/drives/{drive}/shelves` accepts `ids`, which restricts every
  shelf to those file ids. This is how the core narrows a provider's ids to the target.
- **SPEC-CORE-068**: two slots in Discover. `video-discover-recommended` supplies
  Recommended. `video-discover-shelves` adds one shelf per entry. Recommended is no longer
  random. It shows only what a provider recommends, and it is not drawn when no provider
  recommends anything.
- **SPEC-ADDON-087**: Intelligence provides `video-discover-recommended` from the Pickup
  feed.
- **SPEC-ADDON-088**: Media Import provides two `video-discover-shelves` entries, from its
  Regular and Recent lanes.

The viewer is one person on a PC browser; the phone layout runs the same pages. The iOS app
is the same web UI and is not changed.

## Required items

### 1. Normal flow

**Provider contract (core).** An addon's `frontend/slots.ts` may export, beside
`slotComponents`:

```ts
export const slotProviders: Record<string, ShelfProvider>;

type ShelfProvider = (args: {
  drive: string;
  limit: number;                                    // ids the shelf will draw, 12
  restrict: (ids: string[]) => Promise<string[]>;   // core's filter, any number of ids
}) => Promise<string[]>;                            // ordered file ids, best first
```

The provider is found the same way as a slot component: slot id → catalogue entries (sorted
by `priority`) → `addonName` → that addon's `slots.ts` → `slotProviders[entry.id]`. The
loader uses the same module cache as `SlotEntryRenderer`. An entry may declare an optional
`href`, a path relative to `/drive/{drive}/`, and an optional `i18n_key` for its label, as
other slots do.

`restrict(ids)` calls `GET /api/drives/{drive}/shelves?by=all&key=all&per_shelf=60&ids=…`
with the app's target parameters, plus the shelf's own condition (below). It returns the
subset of `ids` that matched, in the order the provider passed them.

- It accepts any number of ids and sends them in requests of at most 60 ids each, the
  endpoint's cap.
- `restrict([])` resolves to `[]` without sending a request.
- A `viewer_required` error from any of its requests calls the app's `onViewerRejected`,
  as the watch shelves do today, and then rejects. Any other error only rejects.

Each provider call gets its own `restrict` and its own set of accepted ids, holding the
`ShelfItem` of every id that this `restrict` returned. Ids accepted for one shelf never count
for another. The provider may call its `restrict` as many times as it needs to.

When a provider resolves, its shelf is built in this order:

1. Take the provider's ids in order.
2. Drop duplicates, and drop every id that is not in this call's accepted set.
3. Keep the first `limit` (12).
4. Draw the matching `ShelfItem`s.

**When the catalogue counts as loaded.** The catalogue counts as loaded for a drive when
`useAddonSlots()` reports `loading` false and `catalogueDrive` equal to the app's drive.
Until then no provider is called, and no entry of the previous drive is used.

**When the providers run again.** The providers are asked again exactly when today's
Discover shelves are, which is when the drive, the target parameters or `hasProfile`
changes. They are also asked again when the catalogue's entries for the two slots change.
Entries are compared by content (the list of `addonName`, `id`, `priority`, `href` and
`i18n_key`), not by array reference. A result whose inputs have since changed is dropped
(`useLoad` does this by load identity). During a re-run, a provider shelf is not drawn until
its new answer settles, so the previous target's videos are never shown under the new
target.

**Recommended (SPEC-CORE-068).** With a profile, once the catalogue has loaded:

1. Take the first `video-discover-recommended` entry by `priority` whose module exports a
   function under its id. Later entries are never tried, not even when this one rejects.
2. Call it with a `restrict` that adds `watch=unwatched` to the target.
3. Recommended is the built shelf: the provider's items in its order, at most 12, and
   nothing else.

The core sends no random request for Recommended any more. Recommended is not drawn without
a profile, without an entry that has a function, when the provider rejects, or when it
yields no item. The title stays the core's **Recommended**. **See all** follows the entry's
`href` as for addon shelves (below). The core unwatched shelf is no longer linked from
Discover.

**Addon shelves (SPEC-CORE-068).** For each `video-discover-shelves` entry in `priority`
order, Discover calls its provider, with or without a profile. Its `restrict` adds no watch
condition, so the target alone applies. The shelf's title is the entry's label (`i18n_key`
translated, or `label` as the fallback). **See all** appears when the entry declares `href`
and links to `/drive/${encodeURIComponent(drive)}/${href}`, with `href` inserted verbatim.
Otherwise there is none.

The shelves are drawn in this order:

> Continue · Recommended · addon shelves (by priority) · New

**Pickup provider (SPEC-ADDON-087).** Intelligence registers entry `pickup` under
`video-discover-recommended`, with no `href`, and the provider `slotProviders.pickup`:

1. Read the viewer's feed in rank order, 60 ids per request (`/pickup?limit=60&offset=…`),
   and pass each page through `restrict`.
2. Stop once 40 ids have matched, a page comes back shorter than 60, or `offset` reaches
   `total`. The feed holds at most 300 rows, so this is at most 5 page requests.
3. The pool is the first 40 matched ids in feed rank order. Ids past 40 on the last page
   are not used.
4. Shuffle the pool with a seeded PRNG whose seed is derived from the drive and the
   viewer's local date (`localDateStamp()`), and return the first `limit`. Any seeded
   shuffle will do; only the determinism in I8 is required.

This is the same "sample 12 from the top 40" rule as the home carousel, applied after the
target filter rather than before it. A shuffle of the unfiltered window would leave few or
no videos in a drive of mixed kinds.

**Media Import providers (SPEC-ADDON-088).** Media Import registers two entries under
`video-discover-shelves`:

| Entry id | Lane | Priority | `i18n_key` | ja / en label | `href` |
|---|---|---|---|---|---|
| `media-import-regular` | `regular` | 10 | `mediaImport.slots.videoRegular` | よく見るソース / Regular sources | `addons/media_import` |
| `media-import-feed` | `feed` | 20 | `mediaImport.slots.videoFeed` | 購読の新着 / New from subscriptions | `addons/media_import` |

Each provider calls the existing `listWatch(drive, lane, { limit: 60 })`, which sends the
`drive` query parameter and the matching `X-Lit-Drive` header that `/watch` requires. It
passes the ids through `restrict` once and returns them in lane order. The feed label
differs from the addon page's 新着 so that it cannot be mistaken for the core **New** shelf
on the same screen.

### 2. Failure cases

- **The catalogue is still loading.** No provider is called, and the provider shelves are
  not drawn.
- **The module or function is missing.** The `slots.ts` module fails to load, has no
  `slotProviders`, or has no function under the entry id. The entry counts as absent.
  Recommended is not drawn when it was the only one, and the addon shelf is not drawn.
- **The provider throws or rejects**, including when `restrict` fails inside it. Its shelf
  is not drawn, and the other shelves are unaffected.
- **The provider returns ids that `restrict` never returned.** Those ids are dropped (I3).
- **The Pickup endpoint answers non-2xx**, which includes the drive's `index` feature turned
  off (404). `fetchPickup` already returns an empty page, so the provider returns `[]` and
  Recommended is not drawn.
- **The viewer has no Pickup feed yet.** This happens with no history, or before the first
  worker run. Same as above: `[]`, and Recommended is not drawn.
- **No video of the feed survives the target.** For example, the feed is mostly images and
  documents, or the smart folder is narrow. Recommended has fewer than 12 items, down to
  none, and is not filled from anywhere else.
- **The Pickup feed is up to an hour stale** (hourly sweep). A video watched since the last
  run is still in the feed, but `restrict` with `watch=unwatched` removes it once its
  history row reaches the unwatched boundary. A video only opened stays.
- **The Media Import watch request fails.** The provider rejects, and the shelf is not
  drawn.
- **`restrict` receives more than 60 ids.** It splits them into requests of at most 60, so
  a provider never sees the 422 limit.

### 3. States

Each provider shelf (Recommended and every addon shelf) goes through
`idle` → `loading` → `loaded` | `failed`.

- `idle`: no provider applies. This covers no profile (Recommended only), no entry or
  function, and a catalogue not yet loaded.
- `loading`: the provider has been called and has not settled.
- `loaded`: the built shelf, possibly empty.
- `failed`: the provider or its `restrict` rejected.

A provider shelf is drawn only in `loaded` with at least one item. It has no skeleton and no
**Retry**. A shelf that comes to nothing never appears, so the shelves below it move at most
once. A change of inputs returns it to `loading`, and it is not drawn until it settles again.

Continue and New keep their own states and **Retry** unchanged. The Discover empty state
(no video under the target) keeps its rule, but only Continue and New count towards it. A
provider shelf can hold items only when New does, because every item passed `restrict`
under the same target.

The result is kept above the faces as today: switching to Library and back draws nothing
new, and a reload asks again. Pickup's part stays the same while the feed and the viewer's
watch state are unchanged on the same day. Watching one of the videos, or the hourly
re-rank, changes the pool and therefore the twelve.

### 4. Data read and written

- Read: `files`, `file_tags`, `tags`, `collections`, `watch_history` in the core DB, through
  the existing shelves query.
- Read: the Intelligence addon DB tables `pickup_item` and `pickup_profile`, through the
  existing `/pickup` endpoint.
- Read: the Media Import tables `subscriptions`, `subscription_videos` and `loft_metadata`,
  plus core `files`, through the existing `/watch` endpoint.
- Written: nothing. No table, file or cache changes. Discover keeps the results in React
  state only.

### 5. External services

None. Every call stays inside the stack: the browser calls the core, and the core proxies
to the addons, Intelligence over the Docker network and Media Import in-process. No outside
service is contacted. A slow or hung addon only leaves its own shelf undrawn. No other shelf
waits for it, so there is no timeout.

### 6. Authorization

- `ids` is one more filter on an endpoint that already checks the drive (`_validate_drive`,
  404 for a locked or unknown drive). An id from another drive, a locked drive, trash or
  missing matches nothing (I1).
- Providers run in the browser with the viewer's own cookies. `/pickup` is gated by the
  proxy's `addon_feature` pre-check, and the viewer id is computed by the host. `/watch`
  checks `X-Lit-Drive` against the unlocked groups.
- A provider cannot widen what the viewer sees, because every drawn item comes from the
  core's own shelves response for that viewer (I3).

### 7. Effect on existing features

- `filtered_drive_files` is shared with the file listing. `ids` is added to the **shelves
  endpoint only**, after the shared helper, so the listing is unchanged.
- Recommended changes from a random sample to the provider's list. Without Intelligence, a
  profile or a feed, it disappears from Discover (SPEC-CORE-057 I8 is revised below).
- Home's Pickup carousel and Media Import's Watch page are unchanged. Their endpoints are
  read with their existing parameters.
- `AddonSlot` and `SlotEntryRenderer` render as before. The provider loader shares their
  module cache.
- The Library face, the shelf page (including the unwatched shelf, still reachable from
  Library's watch-state classification), Continue and New are unchanged.

### 8. Error behavior

There is no new message. A provider shelf that fails is not drawn, and the failure is not
logged in the browser (frontend conventions forbid `console.log`). On the backend, a
malformed `ids` (more than 60, or an empty string) is 422, and the shelves endpoint's
existing exception log is unchanged.

### 9. User-visible behavior

- **Recommended with Intelligence.** When Intelligence indexes the drive and a profile is
  set, Recommended shows up to 12 unwatched videos ranked by the viewer's history. When
  fewer match the target, it shows fewer, and when none match, the shelf is absent. It is
  never filled at random.
- **Recommended without Intelligence**, a profile or a feed: the shelf is absent.
- **Media Import shelves.** For subscriptions set to *regular* or *feed* that have videos
  under the target, Discover shows **よく見るソース** and/or **購読の新着** between Recommended
  and New, with or without a profile. Each holds at most 12 videos and has **See all** to
  the Media Import page.
- A video can appear in more than one shelf (see Checked, no action: duplicates across
  shelves).
- The cards are the core's video cards, so they look like the other shelves. Provider
  shelves have no progress bar (see Checked, no action).
- **Order of shelves:** Continue · Recommended · よく見るソース · 購読の新着 · New.

### 10. Non-functional

- **Requests per Discover load:** at most 5 Pickup pages and 5 restrict calls for
  Recommended, plus 1 watch read and exactly 1 restrict call per Media Import shelf. Each
  restrict call carries at most 60 ids, about 1 KB of query string, inside the URL limits
  of Next.js and uvicorn. The random request for Recommended is gone.
- **The `ids` cap:** at most 60 per request (422 above), so that the query cannot grow
  without bound.
- **Privacy:** no data leaves the stack. The Pickup provider uses the viewer's local date
  only as a shuffle seed in the browser. It is not sent anywhere.
- **Drive boundary:** every call is scoped to one drive.

Measured on local test data (2026-11-09), counting the unwatched, active videos in each
viewer's Pickup feed under the default target:

| Drive | Feed | Videos | Drive's videos |
|---|---|---|---|
| 動画, viewer A | 271 | 215 | 508 |
| 動画, viewer B | 300 | 218 | 508 |
| テスト画像, viewer A | 300 | 45 | 134 |
| テスト画像, viewer B | 238 | 3 | 134 |

A video-centred drive fills 12 easily. A mixed drive can leave only a few, and the shelf
then shows only those.

## Touch points

- `backend/app/routers/shelves.py`: new `ids: list[str]` query parameter, max 60, applied as
  `File.id IN ids` to the shelves base query after `filtered_drive_files`.
- `backend/tests/` (shelves tests): new cases for `ids`.
- `frontend/src/lib/api.ts`: `ShelvesParams.ids`.
- `frontend/src/lib/addons.ts`: `SlotEntry.href?`, and a loader for `slotProviders`.
- `frontend/src/components/AddonSlot.tsx`: share the module cache with the provider loader.
  No change to how components render.
- `frontend/src/components/videoapp/useDiscover.ts`: reads `useAddonSlots()`, runs the
  providers with `restrict`, and drops the random Recommended request.
- `frontend/src/components/videoapp/DiscoverFace.tsx`: draw Recommended and the addon
  shelves only when loaded and non-empty, in order. The empty state counts Continue and New
  only.
- `frontend/src/components/videoapp/VideoApp.tsx`: pass the addon shelves from
  `useDiscover` to `DiscoverFace`.
- `frontend/src/components/videoapp/__tests__/`: tests for the above.
- `addons/intelligence/frontend/slots.ts`, a new provider module, `manifest.json` (the
  `video-discover-recommended` entry), and
  `addons/intelligence/frontend/__tests__/pickupShelfProvider.test.ts` (I8, I12). This is a
  separate repository; the submodule pointer is bumped in core.
- `addons/media_import/backend/router.py` (`ADDON_META.slots`): two entries under
  `video-discover-shelves`. Also `addons/media_import/frontend/slots.ts`, a new provider
  module, `frontend/messages/{ja,en}.json` for the two labels, and
  `addons/media_import/frontend/__tests__/watchShelfProviders.test.ts` (I9). This is a
  separate repository; the submodule pointer is bumped in core.
- Docs:
  - `docs/reference/api.md`: shelves `ids`.
  - `docs/ADDON-DEVELOPMENT.md`: slot providers, Available slots, UI slots provided.
  - `docs/user-guide/video.md`: Recommended is no longer random and can be absent; the
    addon shelves.
  - `docs/addons/intelligence.md`: Pickup feeds Recommended.
  - `docs/addons/media-import.md`: the lanes appear in the video app.
- Rules passed through:
  - `design-decisions.md`: "No core-to-addon dependencies", "When no addon is installed,
    the slot is hidden", and "A drive is a security boundary".
  - `frontend-conventions.md`: i18n, with addon labels only in the addon's messages.
  - This is not an Internal API change, so `internal-api-policy.md` is not engaged.
- No protected path is edited.

## Invariants

I1. A shelves request with `ids` returns and counts only files that are in `ids` **and**
satisfy every other filter of the request, from the requested drive only. An id of another
drive, of trash or of a missing file is never returned. More than 60 ids, or an empty value,
is 422.

I2. A shelves request without `ids` returns the same response as before this change.

I3. Discover draws a provider-shelf item only if its id was returned by the `restrict`
given to that same shelf's provider call, and never by another shelf's. So a provider can
never make Discover show a file outside the app's target, outside `type=video`, or of
another drive. For Recommended, it also cannot show one the viewer has started or finished.

I4. Recommended consists only of the provider's restricted items, in the provider's order,
at most 12, with no duplicate. No random request is sent for it. It is not drawn without a
profile, without a `video-discover-recommended` entry whose function exists, when that
provider rejects, or when it yields no item. A second entry is never tried.

I5. A provider shelf is drawn only when its provider has resolved for the current inputs
with at least one item, and never while loading. A missing module, a missing function or a
rejection hides that shelf alone, and the other shelves load and draw as if it did not
exist.

I6. With no addon declaring either slot, Discover draws Continue and New exactly as before,
sends no request for Recommended or for any addon shelf, and shows the empty state under the
same conditions as before.

I7. The shelves are drawn in the order Continue, Recommended, the addon shelves by entry
`priority` ascending, then New. An addon shelf's title is the entry's translated label.
**See all** appears on a provider shelf exactly when its entry declares `href`, and links to
`/drive/${encodeURIComponent(drive)}/${href}`.

I8. The Pickup provider returns at most `limit` ids, all from the viewer's feed for that
drive and all accepted by `restrict`. For the same drive, accepted pool and local date, it
returns the same ids in the same order.

I9. Each Media Import provider returns only ids from its own lane (`regular` or `feed`) for
that drive, in that lane's order, after `restrict`. The provider is called with or without
a profile.

I10. Every `AddonSlot` renders the same entries as before this change. A provider whose
addon module `SlotEntryRenderer` or the catalogue preload already loaded resolves from that
module without failing.

I11. Recommended and the addon shelves never use a catalogue entry fetched for another
drive. A provider result whose drive, target or profile has since changed is never drawn.

I12. The Pickup provider samples only from the first 40 restricted ids in feed rank order.
It reads pages of 60 in rank order and stops at 40 matches, at a page shorter than 60, or at
`offset ≥ total`, so it never reads more than 5 pages.

## Revises

SPEC-CORE-057 I8. Discover's shelves are:

- Continue: the viewer's `in_progress` videos, most recently played first. Not drawn
  without a profile.
- Recommended: only with a profile, the `video-discover-recommended` provider's restricted
  items in its order. Never a random sample. Not drawn when no provider yields an item.
- Each `video-discover-shelves` addon shelf.
- New: videos by `created_at` descending.

Each shelf holds at most 12, and a shelf with no videos is not drawn.

## Checked, no action

- **Random fill when Pickup yields fewer than 12.** Rejected by the human: a random sample
  under the title Recommended claims a recommendation it does not make. The measured
  shortfall (above) is accepted. A short shelf is honest, and an absent one is too.
- **A renamed random shelf (e.g. "From your unwatched").** Rejected with the fill. The
  unwatched list stays reachable from Library's watch-state classification.
- **The core calling the addon APIs directly.** Rejected by "No core-to-addon
  dependencies". The provider lives in the addon's own `slots.ts`, and the core knows only
  the slot ids.
- **The addon rendering the whole shelf as a slot component.** Rejected, because the core
  could not apply the target or watch filter to it, and the cards would drift from the core
  shelves.
- **Filtering inside the addon** (via Internal API `POST /files/matching`). Rejected,
  because that endpoint has no `search` condition, so a smart folder with free text would
  silently show the wrong videos. The core's shelves query is the only place that knows the
  target's full meaning.
- **`ids` on the file listing too.** Not needed. The listing stays unchanged.
- **Keeping the old items while a provider re-runs after a target change.** Rejected, since
  it would show videos of the previous target under the new one. The shelf is hidden until
  the new answer settles.
- **A See all for Recommended.** Intelligence declares no `href`, because its own Pickup
  page lists every kind of file, not only the target's videos. The core unwatched shelf is
  not linked, because it is not the recommendation.
- **Duplicates across shelves.** A video may appear both in an addon shelf and in New or
  Recommended, because each shelf answers a different question. The Media Import page and
  the home already overlap in this way. A file in both a *regular* and a *feed* subscription
  can appear in both Media Import shelves, which matches the Media Import page.
- **Progress bars on provider shelves.** `restrict` uses `by=all`, which carries no
  `watch_progress`, so these cards draw no bar. Recommended holds only unwatched videos
  anyway, and the Media Import page keeps its own badges.
- **Pickup's seed per viewer.** The browser does not know the host-computed viewer id, so
  the seed is drive + date. Two profiles have different feeds, so their pools and results
  still differ.
- **Stability for the whole day regardless of watching.** Not attempted. It would need the
  day's pick stored somewhere. The pick changes only when the pool does.
- **The reading app's Discover.** It has the same Recommended shape, but it is not changed
  here. The slot ids name the video app, so a reading slot would be separate.
- **Home.** Untouched. The earlier decision to keep the Media Import feed off the drive
  home stands, because the home shows every kind of file and the video app shows only
  videos.
