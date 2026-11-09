# Video Discover: addon-ranked Recommended and addon shelves

SPEC-ID: SPEC-CORE-067
SPEC-ID: SPEC-CORE-068
SPEC-ID: SPEC-ADDON-087
SPEC-ID: SPEC-ADDON-088

Approval:

## Summary

The video app's **Discover** face (SPEC-CORE-057) draws three core shelves: Continue,
Recommended and New. Recommended is a random sample of the viewer's unwatched videos.
Two addons already compute better lists for someone looking for something to watch, but
Discover cannot reach them, because the core never names an addon:

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
- **SPEC-CORE-068**: two slots in Discover. `video-discover-recommended` supplies the order
  of Recommended. `video-discover-shelves` adds one shelf per entry. Each has a fallback
  when no addon answers.
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

`restrict` accepts any number of ids. It sends them in requests of at most 60 ids each,
the endpoint's cap. `restrict([])` resolves to `[]` without sending a request. A
`viewer_required` error from any of its requests calls the app's `onViewerRejected`, as the
watch shelves do today, and then rejects.

The provider is found the same way as a slot component, by slot id → catalogue entries
(sorted by `priority`) → `addonName` → that addon's `slots.ts` → `slotProviders[entry.id]`.
An entry may declare an optional `href`, a path relative to `/drive/{drive}/`, and an
optional `i18n_key` for the label, as other slots do.

`restrict(ids)` calls `GET /api/drives/{drive}/shelves?by=all&key=all&per_shelf=60&ids=…`
with the app's target parameters, plus the shelf's own condition (below). It returns the
subset of `ids` that matched, in the order the provider passed them. Each provider call
gets its own `restrict` and its own set of accepted ids, holding the `ShelfItem` of every id
that this `restrict` returned. Ids accepted for one shelf never count for another. The
provider may call its `restrict` as many times as it needs to.

When a provider resolves, the core's shelf is built in this order:

1. Take the provider's ids in order.
2. Drop duplicates, and drop every id that is not in this call's accepted set.
3. Keep the first `limit`.
4. Draw the matching `ShelfItem`s.

**When the catalogue counts as loaded.** The catalogue counts as loaded for a drive when
`useAddonSlots()` reports `loading` false and `catalogueDrive` equal to the app's drive.
Until then, no entry of the previous drive is used.

**When the providers run again.** Recommended and the addon shelves are asked again exactly
when today's Discover shelves are: the drive, the target parameters or `hasProfile`
changes, and when the catalogue's entries for the two slots change. A result whose inputs
have since changed is dropped (`useLoad` already does this by load identity).

**Recommended (SPEC-CORE-068).** With a profile, and once the catalogue has loaded:

1. Take the first `video-discover-recommended` entry by `priority` whose module exports a
   function under its id. Later entries are never tried, not even when this one rejects.
   This provider's `restrict` adds `watch=unwatched` to the target.
2. At the same time, request the random unwatched shelf as today, but with `per_shelf` 24
   instead of 12. The random sample then still covers 12 after removing up to 12
   duplicates.
3. Recommended is the provider's items followed by random items not already shown, up to 12.
   When the provider rejects or returns nothing, Recommended is the first 12 of the random
   response.
4. If the random request has answered and the provider has not settled 3 seconds later,
   Recommended is drawn from the random response alone, and the provider's late answer is
   discarded for this load.

With no entry that has a function, Recommended sends exactly SPEC-CORE-057's request
(`per_shelf` 12) and does not wait for the provider. Without a profile it is also
SPEC-CORE-057's request, and it does not wait for the catalogue either. **See all** still
opens the core unwatched shelf.

**Addon shelves (SPEC-CORE-068).** For each `video-discover-shelves` entry in `priority`
order, Discover calls its provider. `restrict` adds no watch condition, so the target alone
applies. The shelf's title is the entry's label (`i18n_key`, or `label` as the fallback).
**See all** links to `/drive/{drive}/{href}` when the entry declares `href`, and is absent
otherwise. The shelves are drawn after Recommended and before New:

> Continue · Recommended · addon shelves (priority) · New

**Pickup provider (SPEC-ADDON-087).** Intelligence registers entry `pickup` under
`video-discover-recommended`, with provider `slotProviders.pickup`:

1. Read the viewer's feed in rank order, 60 ids per request (`/pickup?limit=60&offset=…`),
   and pass each page through `restrict`.
2. Stop once 40 ids have matched, a page comes back shorter than 60, or `offset` reaches
   `total`. The feed holds at most 300 rows, so this is at most 5 page requests.
3. The pool is the first 40 matched ids in feed rank order. Ids past 40 on the last page
   are not used.
4. Shuffle the pool with a seeded PRNG whose seed is derived from the drive and the
   viewer's local date (`localDateStamp()`), and return the first `limit`. Any seeded
   shuffle will do; only the determinism in I8 is required.

This is the same "sample 12 from the top 40, once a day" rule as the home carousel, applied
after the target filter rather than before it. A shuffle of the unfiltered window would
leave few or no videos in a drive of mixed kinds.

**Media Import providers (SPEC-ADDON-088).** Media Import registers two entries under
`video-discover-shelves`:

| Entry id | Lane | Priority | `i18n_key` | ja / en label | `href` |
|---|---|---|---|---|---|
| `media-import-regular` | `regular` | 10 | `mediaImport.slots.videoRegular` | よく見るソース / Regular sources | `addons/media_import` |
| `media-import-feed` | `feed` | 20 | `mediaImport.slots.videoFeed` | 購読の新着 / New from subscriptions | `addons/media_import` |

Each provider calls the existing `listWatch(drive, lane, { limit: 60 })`. It sends the
`drive` query parameter and the matching `X-Lit-Drive` header that `/watch` requires. The
provider passes the ids through `restrict` and returns them in lane order. The feed label differs from the addon
page's 新着 so that it cannot be mistaken for the core **New** shelf on the same screen.

### 2. Failure cases

- The catalogue is still loading. Recommended and the addon shelves wait, with Recommended
  shown as loading, so that the fallback is never drawn first and then replaced.
- The `slots.ts` module fails to load, has no `slotProviders`, or has no function under the
  entry id. The entry counts as absent: Recommended falls back to random, and the addon shelf
  is not drawn.
- The provider throws or rejects, including when `restrict` fails inside it. Recommended
  falls back to random, which is the random request already in flight. The addon shelf is
  not drawn.
- The random request fails. If the provider resolved, Recommended draws the provider's
  items alone. Otherwise Recommended shows **Retry**, as today.
- The provider returns ids that `restrict` never returned. Those ids are dropped (I5).
- The Pickup endpoint answers non-2xx, which includes the drive's `index` feature turned
  off (404). `fetchPickup` already returns an empty page, so the provider returns `[]` and
  Recommended is the random sample.
- The viewer has no Pickup feed yet. This happens with no history, or before the first
  worker run. Same as above: `[]`, then random.
- The Pickup feed is up to an hour stale (hourly sweep). A video watched since the last run
  is still in the feed, but `restrict` with `watch=unwatched` removes it once its history
  row reaches the unwatched boundary. A video only opened stays, as it does in the random
  sample.
- The Media Import watch request fails. The provider rejects, and the shelf is not drawn.
- `restrict` receives more than 60 ids. The core splits the call into requests of at most
  60 ids each, so a provider never sees the 422 limit.

### 3. States

Per Discover shelf, with `useLoad`'s states: `idle` → `loading` → `loaded` | `failed`.

- **Recommended:** `loading` lasts until the catalogue has loaded, the random request has
  settled, and the provider (if any) has settled or the 3-second bound after the random
  answer has passed. While loading it is drawn as today's skeleton. `loaded` with zero items
  is not drawn. It is `failed` only when the random request failed and the provider gave
  nothing.
- **Addon shelf:** not drawn at all until its provider settles: no title and no skeleton.
  Then `loaded`, drawn only with at least one item, or `failed`, never drawn and with no
  Retry. A shelf that comes to nothing never appears, so the shelves below it do not jump
  twice.

The existing Discover empty state (no video under the target) is unchanged. It still
depends only on the three core shelves.

The result is kept above the faces as today: switching to Library and back draws nothing
new, and a reload asks again. Pickup's part is the same all day for the same drive and
target, because the seed is the date. The random fill changes on each reload.

### 4. Data read and written

- Read: `files`, `file_tags`, `tags`, `collections`, `watch_history` in the core DB, through
  the existing shelves query.
- Read: the Intelligence addon DB tables `pickup_items` and `pickup_profiles`, through the
  existing `/pickup` endpoint.
- Read: the Media Import tables `subscriptions`, `subscription_videos` and `loft_metadata`,
  plus core `files`, through the existing `/watch` endpoint.
- Written: nothing. No table, file or cache changes. Discover keeps the results in React
  state only.

### 5. External services

None. Every call stays inside the stack: the browser calls the core, and the core proxies
to the addons, Intelligence over the Docker network and Media Import in-process. No outside
service is contacted. A slow addon delays only its own shelf. Recommended waits for its
provider, and there is no timeout in this change (see Checked, no action).

### 6. Authorization

- `ids` is one more filter on an endpoint that already checks the drive (`_validate_drive`,
  404 for a locked or unknown drive). An id from another drive, a locked drive, trash or
  missing matches nothing (I1, I2).
- Providers run in the browser with the viewer's own cookies. `/pickup` is gated by the
  proxy's `addon_feature` pre-check, and the viewer id is computed by the host. `/watch`
  checks `X-Lit-Drive` against the unlocked groups.
- A provider cannot widen what the viewer sees, because every drawn item comes from the
  core's own shelves response for that viewer (I5).

### 7. Effect on existing features

- `filtered_drive_files` is shared with the file listing. `ids` is added to the **shelves
  endpoint only**, after the shared helper, so the listing is unchanged.
- Home's Pickup carousel and Media Import's Watch page are unchanged. Their endpoints are
  read with their existing parameters.
- `AddonSlot` and `SlotEntryRenderer` are unchanged. Providers use a separate loader over
  the same module cache, so `slots.ts` is still imported once.
- The Library face, the shelf page and Continue/New are unchanged.

### 8. Error behavior

There is no new message. An addon shelf that fails is not drawn, and its failure is not
logged in the browser (frontend conventions forbid `console.log`). A Recommended provider
failure is silent too, because the fallback covers it. Recommended **Retry** stays as today.
On the backend, a malformed `ids` (more than 60, or an empty string) is 422, and the shelves
endpoint's existing exception log is unchanged.

### 9. User-visible behavior

- With Intelligence indexing the drive and a profile set, Recommended starts with videos
  ranked by the viewer's history. They are the same for the whole day for the same target,
  and random unwatched videos fill the rest up to 12. Without Intelligence, a profile or a
  feed, Recommended looks exactly as today.
- With Media Import subscriptions set to *regular* or *feed* that have videos under the
  target, Discover shows **よく見るソース** and/or **購読の新着** between Recommended and New,
  each with at most 12 videos and **See all** to the Media Import page. A video can appear
  in more than one shelf (see Checked, no action: duplicates across shelves).
- The cards are the core's video cards, so they look like the other shelves.
- Order of shelves: Continue · Recommended · よく見るソース · 購読の新着 · New.

### 10. Non-functional

- Requests per Discover load: at most 5 Pickup pages and 5 restrict calls for Recommended,
  plus 1 watch read and 1 or 2 restrict calls per Media Import shelf. Each restrict call
  carries at most 60 ids, about 1 KB of query string, inside the URL limits of Next.js and
  uvicorn.
- `ids` is capped at 60 per request (422 above) so that the query cannot grow without
  bound.
- Privacy: no data leaves the stack. The Pickup provider sends the viewer's local date only
  as a shuffle seed in the browser. It is not sent anywhere.
- Drive boundary: every call is scoped to one drive.

## Touch points

- `backend/app/routers/shelves.py`: new `ids: list[str]` query parameter, max 60, applied as
  `File.id IN ids` to the shelves base query.
- `backend/tests/` (shelves tests): new cases for `ids`.
- `frontend/src/lib/api.ts`: `ShelvesParams.ids`.
- `frontend/src/lib/addons.ts`: `SlotEntry.href?`, and a loader for `slotProviders`.
- `frontend/src/components/AddonSlot.tsx`: share the module cache with the provider loader.
  No change to how components render.
- `frontend/src/components/videoapp/useDiscover.ts`: provider-ranked Recommended, addon
  shelves, `restrict`.
- `frontend/src/components/videoapp/DiscoverFace.tsx`: draw the addon shelves in order.
- `frontend/src/components/videoapp/__tests__/`: tests for the above.
- `addons/intelligence/frontend/__tests__/pickupShelfProvider.test.ts` (I8), and
  `addons/media_import/frontend/__tests__/watchShelfProviders.test.ts` (I9).
- `addons/intelligence/frontend/slots.ts`, a new provider module, and `manifest.json`
  (`video-discover-recommended` entry). This is a separate repository; the submodule
  pointer is bumped in core.
- `addons/media_import/backend/router.py` (`ADDON_META.slots`): two entries under
  `video-discover-shelves`. Also `addons/media_import/frontend/slots.ts`, a new provider
  module, and `frontend/messages/{ja,en}.json` for the two labels. This is a separate
  repository; the submodule pointer is bumped in core.
- Docs: `docs/reference/api.md` (shelves `ids`), `docs/ADDON-DEVELOPMENT.md` (slot providers,
  Available slots, UI slots provided), `docs/user-guide/video.md` (Recommended and the addon
  shelves), `docs/addons/intelligence.md` (Pickup feeds Recommended),
  `docs/addons/media-import.md` (the lanes appear in the video app).
- Rules passed through: `design-decisions.md` "No core-to-addon dependencies", "When no
  addon is installed, the slot is hidden", and "A drive is a security boundary";
  `frontend-conventions.md` i18n (addon labels only in the addon's messages). This is not an
  Internal API change, so `internal-api-policy.md` is not engaged.
- No protected path is edited.

## Invariants

I1. A shelves request with `ids` returns and counts only files that are in `ids` **and**
satisfy every other filter of the request, from the requested drive only. An id of another
drive, of trash or of a missing file is never returned, and more than 60 ids is 422.

I2. A shelves request without `ids` returns the same response as before this change.

I3. Discover draws a Recommended or addon-shelf item only if its id was returned by the
`restrict` given to that same shelf's provider call (never by another shelf's), so a provider can never make Discover show a file outside
the app's target, outside `type=video`, of another drive, or (for Recommended) one the
viewer has started or finished.

I4. Recommended shows the provider's items first, in the provider's order, followed by
random unwatched items not already shown, at most 12 in all and with no duplicate. A
provider that rejects, returns nothing, or has not settled 3 seconds after the random
response leaves Recommended as the first 12 random unwatched videos. With no profile, or no
`video-discover-recommended` entry with a function, Recommended sends SPEC-CORE-057's
request unchanged.

I5. An addon shelf is drawn only when its provider resolves with at least one restricted
item. A missing module, a missing function, or a rejection hides that shelf alone, and the
other shelves load and draw as if it did not exist.

I6. With no addon declaring either slot, Discover sends the same requests and draws the
same shelves as before this change.

I7. The shelves are drawn in the order Continue, Recommended, the addon shelves by entry
`priority` ascending, New. An addon shelf's title is the entry's translated label, and
**See all** appears exactly when the entry declares `href`, linking to
`/drive/{drive}/{href}`.

I8. The Pickup provider returns at most `limit` ids, all from the viewer's feed for that
drive and all accepted by `restrict`. For the same drive, target, feed and local date, it
returns the same ids in the same order.

I9. Each Media Import provider returns only ids from its own lane (`regular` or `feed`) for
that drive, in that lane's order, after `restrict`.

I10. An addon's `slots.ts` is imported at most once per page load for components and
providers together, and every `AddonSlot` renders the same entries as before this change.

I11. Recommended and the addon shelves never use a catalogue entry fetched for another
drive, and a provider result whose drive, target or profile has since changed is never
drawn.

## Revises

SPEC-CORE-057 I8. Discover's shelves are: Continue = the viewer's `in_progress` videos,
most recently played first; Recommended = with a profile, the `video-discover-recommended`
provider's restricted items followed by a random sample of the viewer's `unwatched` videos,
or the random sample alone when no provider answers (of all videos under the target when
there is no profile); then each `video-discover-shelves` addon shelf; New = videos by
`created_at` descending; each at most 12; a shelf with no videos is not drawn; Continue is
not drawn without a profile.

## Checked, no action

- **Core calling the addon APIs directly.** This is rejected by "No core-to-addon
  dependencies". The provider lives in the addon's own `slots.ts`, and the core knows only
  slot ids.
- **The addon rendering the whole shelf as a slot component.** Rejected, because the core
  could not apply the target or watch filter to it, and the cards would drift from the core
  shelves.
- **Filtering inside the addon** (via Internal API `POST /files/matching`). Rejected,
  because that endpoint has no `search` condition, so a smart folder with free text would
  silently show the wrong videos. The core's shelves query is the only place that knows the
  target's full meaning.
- **`ids` on the file listing too.** Not needed. The listing stays unchanged (I2's twin for
  the listing is SPEC-CORE-056 I7).
- **A request timeout for addon shelves.** None in this change. An addon shelf is not drawn
  while it loads, so a hung addon shows nothing and blocks nothing. Recommended is the one
  that waits, and it has the 3-second bound.
- **Duplicates across shelves.** A video may appear both in an addon shelf and in New, or in
  Recommended, because each shelf answers a different question. This is accepted, as Home
  and the Media Import page already overlap today. The two Media Import lanes are disjoint
  per file only when no file sits in both a *regular* and a *feed* subscription. A file that
  does can appear in both shelves, which matches the Media Import page.
- **The Pickup feed contains all kinds of files.** This is handled by restricting before
  sampling (step 3 of the Pickup provider). A drive whose feed holds fewer than 12 videos
  gets the random fill.
- **Progress bars on addon shelves.** `restrict` uses `by=all`, which carries no
  `watch_progress`, so addon shelf cards draw no progress bar. The Media Import page keeps
  its own badges.
- **Pickup's seed per viewer.** The browser does not know the host-computed viewer id, so
  the seed is drive + date. Two profiles on the same day and the same target draw from their
  own different feeds, so their results still differ.
- **The reading app's Discover.** It has the same Recommended shape, but no provider is
  added for it here. The slot ids name the video app, so a reading slot would be separate.
- **Home.** Untouched. The earlier decision to keep the Media Import feed off the drive
  home stands, because the home shows every kind of file and the video app shows only
  videos.
