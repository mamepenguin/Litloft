# Video app: See all for Recommended

SPEC-ID: SPEC-CORE-081
SPEC-ID: SPEC-ADDON-094

Approval: sha256:7e88fa758b58027379adb1347d85b48163f7fb358890fa3ac8ade95161f45cda Yuichi Senga 2026-11-12

## Summary

The video app's Discover face draws **Recommended** from Intelligence's Pickup feed
(SPEC-CORE-068, SPEC-ADDON-087). The Pickup list provider returns up to 12 videos, but
`ShelfBlock` draws only as many cards as fit its rows (`capacityOf`), so at a common window
width a viewer sees three or four and cannot reach the rest. Recommended was left without
**See all** because the only page available then, Intelligence's Pickup page, lists every
kind of file. The core shelf page for page providers (SPEC-CORE-078) has since made a
better destination: it keeps the app's target and draws only what `restrict` accepted.

- **SPEC-CORE-081**: Recommended gets **See all** when the entry that supplies it also
  exports a page provider. It opens the core shelf page in a Recommended mode, which pages
  through that provider with the same `restrict` Discover gives Recommended (the target
  plus `watch=unwatched`). Discover keeps drawing Recommended from the list provider.
- **SPEC-ADDON-094**: Intelligence exports a page provider for its `pickup` entry. It
  returns the restricted feed in one answer: first the same sample of the top 40 that
  Discover draws from, in the same order, then the rest of the feed in rank order.

The viewer is one person on a PC browser. The phone layout and the iOS app run the same
web UI.

## Required items

### 1. Normal flow

**Discover (SPEC-CORE-081).** Recommended is chosen and drawn as today: the first
`video-discover-recommended` entry by `priority` whose `slotProviders` has a function under
its `id`, called with `limit: 12` and a `restrict` that adds `watch=unwatched`, only with a
profile. New: when that chosen entry's module also exports `slotPageProviders[entry.id]`
(looked up with `loadSlotPageProvider`, the same module cache), the drawn Recommended shelf
carries **See all** to

`/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}&slot=recommended`

The page provider is not called on Discover. The lookup does not delay the shelf: the list
provider is called without awaiting it, and if it has not settled when the shelf is drawn,
the shelf is drawn without **See all** and the link appears once it settles. A Recommended
shelf drawn from the stored cache (SPEC-CORE-076) follows the same rule. The result is held
for Recommended alone, not in `pageEntries`, so an id that also appears in
`video-discover-shelves` does not change that shelf's link.

**The shelf page in Recommended mode (SPEC-CORE-081).** `/drive/{drive}/apps/video/shelf`
with `entry` and `slot=recommended` runs the provider page of SPEC-CORE-078 with these
differences:

1. The entry is looked up among `video-discover-recommended` entries (first by `priority`
   whose `id` equals `entry`), not `video-discover-shelves`.
2. The `restrict` adds `watch=unwatched`, exactly as Discover's Recommended `restrict`.
3. The title is always the core's **Recommended** label (`videoApp.shelves.recommended`),
   matching Discover: while waiting, without a profile, for an empty target, for an
   unknown entry or one without a page provider, as well as when items are drawn.
4. The page resets (empty grid, new accepted set, first call again) on a change of drive,
   target, entry, UI locale, **nickname**, **`hasProfile`**, or of the
   `video-discover-recommended` entries as `useDiscover`'s `entriesKey` compares them. A
   change of `video-discover-shelves` entries does not reset it. These extra keys exist
   only in Recommended mode; plain entry mode keeps today's key. A switch between
   Recommended mode and plain entry mode, in either direction and with the same `entry`,
   also resets the page, so no item accepted without `watch=unwatched`, and no entry
   resolved from the other slot, survives it.

The profile is checked after the waits of SPEC-CORE-078 (catalogue for the drive loaded,
target ready, module import settled), so a reload with a profile shows the skeleton and
never a frame of the empty state. Then, with `hasProfile` false, the page shows the empty
state and calls nothing, because Discover never draws Recommended without one.

A `viewer_required` from `restrict` calls `onViewerRejected`, which sets `useVideoApp`'s
`rejectedFor` to the nickname and so turns `hasProfile` false. That change resets the page
(item 4): the load in flight is dropped, its rejection is never drawn, and the page shows
the empty state, never **Retry**. Paging, deduplication, the near-end sentinel and
**Retry** for other failures are those of SPEC-CORE-078.

The core shelf page draws every accepted item of an answer, however many more than `limit`
it holds (as `addPage` does today). Discover is unchanged: it draws at most 12 of a first
page. `ADDON-DEVELOPMENT.md` changes to say so: on the core page `limit` is the least a
page should hold before the source ends ("Fill the page" becomes "at least `limit`"), a
provider may answer with more, and the core page never cuts an answer; Discover cuts to 12.

`slot` is read only together with `entry`. With `entry` and any `slot` other than
`recommended`, or none, the page resolves `video-discover-shelves` exactly as today, with
the same reset key. Without `entry`, `slot` is ignored and the page is in grouping mode as
today.

**Pickup page provider (SPEC-ADDON-094).** `addons/intelligence/frontend/slots.ts` exports
`slotPageProviders.pickup`. Called with `cursor: null`, it:

1. reads the viewer's feed for the drive in rank order, 60 rows per request, until a short
   page or `offset ≥ total`, at most 5 requests (the feed holds at most 300 rows);
2. after the last feed read, passes every id read through `restrict` in rank order (one
   call; `restrict` itself sends 60 ids per request);
3. builds the list: the first 40 accepted ids, taken and shuffled exactly as the list
   provider does (same helper, same seed `${drive}:${localDateStamp()}`), followed by the
   remaining accepted ids in rank order;
4. drops every repeat of an id, keeping its first position (a rebuild between two feed
   reads can repeat a row);
5. returns `{ items: [{ id }...], cursor: null }`, with no byline.

Because the 40 are taken before repeats are dropped, and Discover drops repeats from the
list provider's answer the same way (`buildShelf`), the shelf Discover draws is the start of
the page, in the same order, and the viewer can scroll on from what they saw. The answer is one page whatever `limit` is: the feed is rebuilt by
delete-and-insert (hourly sweep, after the viewer's history moves), so an offset cursor
could skip or repeat rows between requests while the viewer scrolls. Reading it in one
burst of a few requests and returning `cursor: null` narrows that window to the burst
itself; a rebuild inside it can still skip a row, which is accepted. Any other `cursor` value returns
`{ items: [], cursor: null }`.

The list provider and the page provider share the code that builds the 40-sample, so the
two cannot drift. The list provider keeps reading only until it holds 40 accepted ids, as
today; the page provider reads to the end. Both use the seed date at the moment they run.

The page provider's feed read rejects on a network error, a non-OK status, or an OK body
whose `file_ids` is not an array or whose `total` is not a number. It is a new function;
`fetchPickup` keeps resolving to `{ file_ids: [], total: 0 }` on every failure, for the Home
widget, the Pickup page and the list provider.

### 2. Failure cases

- **The chosen Recommended entry has no page provider, or its module lookup fails**:
  Recommended is drawn without **See all**, as today.
- **A feed request fails** (network error or a non-OK status) inside the page provider:
  the provider rejects, and the page shows **Retry** (SPEC-CORE-078). The list provider
  keeps today's behaviour, where `fetchPickup` swallows the failure and Recommended comes
  to nothing.
- **`restrict` rejects**: the provider rejects; **Retry**. On `viewer_required`, the empty
  state instead (§1).
- **The feed is empty, or nothing in it passes `restrict`**: the page ends with nothing
  drawn and shows the empty state.
- **A stale link** (the entry is gone, Intelligence is not checked out, the page provider is
  not exported): the empty state, titled **Recommended** (§1 item 3; this departs from
  SPEC-CORE-078 I9, see Revises).
- **No profile** (opened by bookmark, or the profile was cleared): the empty state, and no
  provider call.
- **The feed is rebuilt, or the viewer's local date turns over, between Discover and See
  all**: the page shows the new feed or the new day's sample. Its first items may then
  differ from the shelf the viewer left. Accepted.
- **`viewer_required` from `restrict`**: the profile is cleared and the page shows the
  empty state (§1).

### 3. States

The provider page's states and transitions are those of SPEC-CORE-078. Recommended mode adds
one entry condition: without a profile it goes from `waiting` to `absent` and never to
`loading`, and a profile cleared by `viewer_required` takes it there from any state. With the Pickup page provider, `loading` goes to `ended` (its cursor is always
`null`) or `failed`; `ready` and `more` are not reached.

Discover's Recommended has one new attribute, the **See all** link: absent until the page
provider lookup for the chosen entry settles, then present if it found a function.

### 4. Data read and written

- Read: Intelligence's `pickup_items` and `pickup_profiles` through
  `GET /api/addons/intelligence/pickup?limit=60&offset=…` (no `window`), unchanged.
- Read: the core shelves query through `GET /api/drives/{drive}/shelves?ids=…&watch=unwatched`,
  unchanged.
- Written: nothing. Discover's stored-ids cache for Recommended keeps its shape and key.

### 5. External services

None. Requests stay inside the stack. A slow feed or `restrict` leaves the page on its
skeleton; the page has no timeout, as SPEC-CORE-078.

### 6. Authorization

Unchanged. Every drawn item came back from the core shelves endpoint for this viewer and
drive with `watch=unwatched`, so the page never shows a file outside the target, of another
drive, locked, in trash, missing, or one the viewer has started or finished. The feed is the
viewer's own, selected by the profile header the Intelligence API already uses.

### 7. Effect on existing features

- Discover: only the **See all** link on Recommended is new. Its items, order, cache, deadline
  and the conditions under which it is drawn are unchanged.
- `useProviderShelfPage` gains the slot and the `watch` condition. With `slot` absent its
  behaviour, requests and entry lookup are unchanged.
- `VideoShelfPage` reads `slot` and passes the profile state. Grouping mode is unchanged.
- The Pickup list provider (SPEC-ADDON-087) returns the same ids for the same inputs; its
  code moves into a shared helper.
- The Home Pickup widget and the Pickup page in Intelligence are untouched.
- Media Import's page providers are untouched.

### 8. Error behavior

No new message. The page reuses the empty state and **Retry**. Nothing is logged.

### 9. User-visible behavior

- With Intelligence installed and a profile set, Recommended on Discover shows **See all**,
  like the other shelves.
- **See all** opens a page titled **おすすめ** / **Recommended** under the same target as
  Discover. It lists the viewer's unwatched recommended videos: first the ones the shelf
  showed, in the same order, then the rest of the feed, best first. Up to about 300 videos,
  all at once, with no sort menu.
- Without Intelligence, or without a profile, nothing changes: there is no Recommended
  shelf.

### 10. Non-functional

- One page load: at most 5 feed requests and at most 5 `restrict` requests (300 ids in
  chunks of 60). Discover's request count is unchanged: the page provider lookup is a module
  lookup, not a request.
- At most 300 cards drawn at once, the same order of magnitude as one 60-card page plus a
  few more pages.
- Drive boundary: every request is scoped to one drive. Privacy: nothing leaves the stack.

## Touch points

- `docs/specs/INDEX.md`: rows for SPEC-CORE-081 and SPEC-ADDON-094.
- `frontend/src/components/videoapp/useDiscover.ts`: page provider lookup for the chosen
  Recommended entry and the **See all** href.
- `frontend/src/components/videoapp/shelfLinks.ts`: `providerShelfHref` gains the
  Recommended form.
- `frontend/src/components/videoapp/useProviderShelfPage.ts`: the slot, the
  `watch=unwatched` restrict, the profile condition.
- `frontend/src/components/videoapp/VideoShelfPage.tsx` and
  `frontend/src/app/drive/[name]/apps/video/shelf/page.tsx`: read `slot`, the Recommended
  title.
- `frontend/src/components/videoapp/__tests__/`: tests for the above.
- `addons/intelligence/frontend/pickupShelfProvider.ts` (or a sibling module): the shared
  feed reader and sample, and the page provider.
- `addons/intelligence/frontend/api.ts`: a feed read that rejects on failure, for the page
  provider. `fetchPickup` keeps its behaviour for its current callers.
- `addons/intelligence/frontend/slots.ts`: `slotPageProviders`.
- `addons/intelligence/frontend/__tests__/`: tests for the page provider.
- The `addons/intelligence` submodule pointer in the core repository.
- Docs:
  - `docs/user-guide/video.md`: "**Recommended** has no **See all**" becomes what it opens,
    and "The shelf page shows 60 videos at a time" gains that Recommended's page shows all
    of them at once.
  - `docs/ADDON-DEVELOPMENT.md`: the `video-discover-recommended` row and "Page providers"
    (consulted for Recommended's **See all**, never on Discover; `slot=recommended`; an
    answer may be longer than `limit` and is never cut).
  - `docs/addons/intelligence.md`: the Recommended paragraph gains **See all**.
- Rules passed through: `design-decisions.md` ("No core-to-addon dependencies", "A drive is
  a security boundary", "When no addon is installed, the slot is hidden").
- No backend change, no Internal API change, no protected path.

## Invariants

I1. Recommended on Discover shows **See all** exactly when the entry chosen to supply it
exports `slotPageProviders[entry.id]`, and the link is
`/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}&slot=recommended`.
A failed module import or a missing export gives no link. The link never changes an addon
shelf's **See all**.

I2. Discover never calls a page provider for Recommended. Adding the lookup does not
change Recommended's drawn ids, their order, the stored cache key or value, or when the
shelf is drawn; the list provider is called before the lookup settles.

I3. In Recommended mode the shelf page draws an item only if its id was accepted by a
`restrict` of that page's own load with the app's current drive and target and
`watch=unwatched`. It never shows a file the viewer has started or finished, outside the
target, or of another drive.

I4. In Recommended mode the entry is resolved only among `video-discover-recommended`
entries (a `video-discover-shelves` entry with the same id is ignored), the title is the
core's Recommended label in every state, stale links included. Without a profile the page
shows the empty state and calls no provider; the profile is judged only after the catalogue,
target and module waits, which show the skeleton. After `viewer_required` the load in
flight is dropped and the page shows the empty state, never **Retry**.

I5. Without `slot=recommended` together with `entry`, the shelf page (entry mode and
grouping mode), its requests, its entry lookup, its reset key and every existing **See all**
link behave exactly as before this change.

I6. For the same feed, accepted set, drive and local date, the items Discover draws from
the Pickup list provider's answer are the first items of the Pickup page provider's answer,
in the same order. The page answer holds every accepted id of the feed exactly once, and
after the first 40 accepted ids it follows rank order.

I7. The Pickup page provider answers with `cursor: null`, reads at most 5 feed pages of 60
in rank order (stopping at a short page or `offset ≥ total`), and rejects when any feed
request fails (network, non-OK, or a body without a `file_ids` array and a numeric
`total`), including a later page after earlier ones succeeded, or when `restrict` fails.
Called with a non-null cursor it returns `{ items: [], cursor: null }` without a request.

I8. The Pickup list provider returns the same ids in the same order as before this change
for the same inputs, and makes the same feed and `restrict` requests: it still stops
reading once it holds 40 accepted ids. `fetchPickup` still resolves to
`{ file_ids: [], total: 0 }` on a network error, a non-OK status or a malformed body, for
every option set; only the page provider's own read rejects.

I9. In Recommended mode a change of nickname, `hasProfile`, drive, target, entry, UI
locale or the `video-discover-recommended` entries, or a switch to or from plain entry mode,
drops every answer of the previous load and starts again from `cursor: null` with an empty
grid and a new accepted set. A change of `video-discover-shelves` entries does not.

I10. The core shelf page draws every accepted, not-yet-drawn item of an answer, even when
the answer holds more items than the `limit` it was asked for.
## Revises

SPEC-CORE-067 I7. The shelves are drawn in the order Continue, Recommended, the addon
shelves by entry `priority` ascending, then New. An addon shelf's title is the entry's
translated label. **See all** on an addon shelf links to
`/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}`
when its entry has a page provider, otherwise to `/drive/${encodeURIComponent(drive)}/${href}`
when the entry declares `href`, and is absent otherwise. **See all** on Recommended links to
`/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}&slot=recommended`
when the chosen entry has a page provider, and is absent otherwise.

SPEC-CORE-078 I6. On Discover, a `video-discover-shelves` entry with a page provider is
drawn from that provider's first page (cursor `null`, limit 12, the UI locale), and its list
provider is not called. On Discover, Recommended is drawn from its list provider only; its
page provider is called only by the shelf page in Recommended mode. List providers receive
no `locale`.

SPEC-CORE-078 I9. An unknown `entry`, an entry without a page provider, or a failed module
import shows the empty state, titled with the app's name, or with the Recommended label
when `slot=recommended`. A rejected first page shows **Retry**, which resends
`cursor: null`. A rejected later page keeps the items already drawn, and its **Retry**
resends the same cursor.

SPEC-CORE-078 I12. In `entry` mode, `by`, `key`, `sort` and `from` have no effect and there
is no sort menu. The title is the entry's label once the entry is found, or the Recommended
label in every state when `slot=recommended`. A load that ends with nothing drawn shows the
empty state.

## Checked, no action

- **Recommended's `href`.** The approved text said Recommended has **See all** when its
  entry declares `href`. The code never implemented it (the Recommended position carries no
  `href`) and no addon declares one. This spec drops that rule on purpose: Recommended's
  only **See all** is the core page, which keeps the target; an addon page would not.

- **Showing more of Recommended on Discover itself** (a second row, or a horizontal scroll).
  Not done: every Discover shelf is clipped to its rows, and **See all** is how the others
  reach the rest.
- **Trimming the list provider's 12 to what fits.** Hides the problem instead of fixing it.
- **Paging the Pickup feed with an offset cursor.** Rejected: the feed is replaced by
  delete-and-insert whenever the viewer's history moves, so an offset could skip or repeat
  rows between pages, and the page-provider contract asks for no repeats.
- **Pure rank order on the page.** Rejected in favour of continuity: the viewer opens
  **See all** from cards they just saw, and rank order would put those cards at scattered
  positions.
- **Drawing Discover's Recommended from the page provider** (replacing the list provider).
  Not needed: the list provider already returns what the shelf draws, and keeping it leaves
  Discover's cache and deadline behaviour untouched.
- **A cursor over a list held in the provider's memory** (read the whole feed once, hand out
  60 at a time under a token). Would keep answers within `limit`, but adds state that a
  reload or a second tab loses, to split a list of at most 300 that the page can draw at
  once. Rejected in favour of allowing an answer longer than `limit`.
- **Seeding the page from Discover's visit date.** Not done: a midnight crossover between
  the shelf and **See all** is as rare and as harmless as a feed rebuild.
- **A byline on Pickup items.** Nothing worth a line exists for a recommendation today.
- **Intelligence's Pickup page as the target.** Rejected as before: it lists every kind of
  file and ignores the smart folder.
- **Design artifact.** None: the page is the existing shelf page with another title.
