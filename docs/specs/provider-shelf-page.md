# Video app: a core shelf page for addon shelves, and card bylines

SPEC-ID: SPEC-CORE-078
SPEC-ID: SPEC-CORE-079

Approval:

## Summary

The video app's Discover face draws addon shelves from the `video-discover-shelves` slot
(SPEC-CORE-068). Media Import supplies two of them, **よく見るソース** and **購読の新着**, and
their **See all** goes to the Media Import page. That page ignores the video app's target
(type=video plus the chosen smart folder), and it is the only reason Media Import still has
a page for watching. The plan is to retire that page and make the video app the one place
to watch. This spec is the core half. A later addon spec moves Media Import onto it and
removes the Watch tab.

- **SPEC-CORE-078**: a new provider kind, the **page provider**, which returns one page of
  items and a cursor for the next. When an addon shelf's entry has one, **See all** opens a
  core shelf page, `/drive/{drive}/apps/video/shelf?entry=<id>`. The page keeps the app's
  target and loads further pages as the viewer scrolls.
- **SPEC-CORE-079**: a page provider may give each item a one-line **byline**, such as a
  channel name and a date. The core's video card draws it under the title, on Discover and
  on the shelf page. The core does not know what the line means. Media Import's channel
  and publish date live only in the addon's own database, because a `.loft` file holds
  only `provider` and `url`.

The viewer is one person on a PC browser. The phone layout runs the same pages, and the
iOS app is the same web UI.

## Required items

### 1. Normal flow

**Page provider contract (SPEC-CORE-078).** An addon's `frontend/slots.ts` may export,
beside `slotComponents` and `slotProviders`:

```ts
export const slotPageProviders: Record<string, ShelfPageProvider>;

type ShelfPageProvider = (args: {
  drive: string;
  locale: string;                                   // the viewer's UI locale, e.g. "ja"
  limit: number;                                    // items wanted: 12 on Discover, 60 on the page
  cursor: string | null;                            // null for the first page
  restrict: (ids: string[]) => Promise<string[]>;   // the core's filter, as in SPEC-CORE-068
}) => Promise<{
  items: { id: string; byline?: string }[];         // ordered, best first
  cursor: string | null;                            // null: there is no further page
}>;
```

`cursor` is opaque to the core. The core passes back exactly the string the provider
returned for the previous page. A provider must keep reading its source until it holds
`limit` restricted items or the source ends, so that a page is short only at the end, and a
later page must not repeat items of an earlier one (a keyset cursor rather than an offset
over a list that grows). The core relies on both: a page that adds nothing new ends the
list (step 5 below). `ADDON-DEVELOPMENT.md` states these two requirements.

How the core reads an answer:

- `cursor`: only a non-empty string continues. `null`, `undefined`, an empty string or any
  other value means there is no further page.
- `items` not an array: the call counts as rejected (**Retry**).
- An item whose `id` is not a non-empty string is dropped.

`locale` is passed to page providers only. List providers (`slotProviders`) keep their
arguments as they are.

The page provider is found as the list provider is: entry → `addonName` → that addon's
`slots.ts` (same module cache) → `slotPageProviders[entry.id]`. The page provider is
consulted only for `video-discover-shelves` entries. `video-discover-recommended` keeps
`slotProviders` alone.

`restrict` is the existing `createRestrict` with the app's target and no watch condition.
It moves out of `useDiscover.ts` into its own module so that Discover and the shelf page
share one implementation.
It sends up to 60 ids per request, keeps the order it was given, and calls
`onViewerRejected` on `viewer_required` while its load is current.

**Discover with a page provider.** For each `video-discover-shelves` entry:

1. If the module exports `slotPageProviders[entry.id]`, Discover calls it with
   `cursor: null` and `limit: 12`, and builds the shelf from `items` as today: provider
   order, duplicates dropped, ids not accepted by this call's `restrict` dropped, at most 12.
   The cursor it returns is not used on Discover.
2. Otherwise Discover calls `slotProviders[entry.id]` exactly as today.

The **See all** of an addon shelf is decided when the shelf is drawn:

- the entry has a page provider → `/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}`;
- otherwise the entry declares `href` → `/drive/${encodeURIComponent(drive)}/${href}`, as today;
- otherwise there is no **See all**.

The page provider wins over `href`.

**The provider shelf page.** `/drive/{drive}/apps/video/shelf` with an `entry` query
parameter opens the provider page, and `by`, `key`, `sort` and `from` are ignored.
Without `entry`, the page behaves as today.

1. The page waits until the slot catalogue has loaded for this drive (`useAddonSlots()`,
   `loading` false and `catalogueDrive` equal to the drive). It then takes the first
   `video-discover-shelves` entry by `priority` whose `id` equals `entry` and loads its
   page provider.
2. It calls the provider with `cursor: null`, `limit: 60`, the viewer's locale, and a
   `restrict` for the app's current target whose accepted set lives as long as this page's
   load.
3. It draws every returned item in order, after dropping duplicates (also of items already
   drawn on earlier pages) and ids that `restrict` never accepted. A page is not cut at
   `limit`.
4. When the end of the grid comes near and the last returned `cursor` is a string, it
   calls the provider again with that cursor and `limit: 60`, and appends the new items. This uses the same
   near-end sentinel as today's shelf page.
5. The page ends when a call returns `cursor: null`, or when a call adds no new item. In
   the second case the page treats it as the end, whatever cursor came back.

The header is today's `VideoAppHeader` with the target picker and the breadcrumb back to
the video app. Its title is the entry's label (`slotEntryLabel`: `i18n_key` translated,
`label` as the fallback) once the entry is found. While waiting, when the entry is absent
and when the target matches no video, the title is the app's name (`t("title")`), which is
what the grouping page shows today without a grouping. There is no sort menu, because the
provider's order is the page's order.

A change of drive, target, `entry` or UI locale, or a switch between `entry` mode and
grouping mode, starts the page again: an empty grid, a new `restrict` with an empty accepted set, and a
first call with `cursor: null`. A result of the previous load is never drawn.

The provider paging lives in its own hook. `appshell/usePaged.ts` is not changed: it pages
by number and total, and the reading app and both Library faces use it.

**Bylines (SPEC-CORE-079).** `VideoCard` takes an optional `byline` string. When it is a
non-empty string, the card draws it as one line under the title, truncated with an
ellipsis, with the classes `ReadingCard` already uses for its own second line:
`mt-0.5 block truncate text-xs text-text-muted`. The title keeps its `line-clamp-2`.
Discover passes the bylines from a page provider's items, and the provider shelf page
passes the same. Bylines travel beside the items as a map from id to byline (on
`DrawnShelf` and in the page hook's state). `ShelfItem` in `lib/api.ts` is not changed,
because it is the shelves endpoint's response type. Every other shelf (Continue,
Recommended, New, list-provider shelves, the Library and the grouping shelf page) passes
none, and those cards look exactly as today. The core does not parse, translate or format
the byline. The provider formats it with the `locale` it was given.

Discover's stored-ids cache for an addon shelf (the one that draws a shelf straight away on
a repeat visit) stores each item's byline next to its id, so a shelf drawn from the cache
carries the same bylines as the provider's answer. The UI locale becomes part of an addon
shelf's cache key, so bylines formatted for one language are never drawn after a switch to
another.

### 2. Failure cases

- **The catalogue or the target is still loading, or the provider module is still being
  imported** (shelf page): the page shows its skeleton grid and calls nothing. A target is
  loading while `useVideoApp` has not read its preferences or is still resolving a saved
  smart folder (`ready` false, or `params` null without `empty`).
- **No entry with that id, or the entry has no page provider** (a stale bookmark, the addon
  removed or not checked out, a list-only provider): the page shows the empty state.
  Nothing is retried.
- **The module fails to import**: the entry counts as having no page provider. On Discover,
  the list provider path is tried next, as today. On the shelf page, the empty state.
- **The first call rejects**, including a `restrict` failure inside it: the page shows
  **Retry**, which calls the first page again from the start.
- **A later call rejects**: the items already drawn stay, and **Retry** under them retries
  that same cursor.
- **The provider returns ids that `restrict` never accepted, or duplicates**: they are
  dropped, as on Discover.
- **A page adds nothing new while the cursor is not null** (a provider that does not fill
  its page, or that returns the same cursor): the page stops there and treats it as the
  end. This bounds the requests a faulty provider can cause.
- **`viewer_required`** from `restrict`: `onViewerRejected` runs, as on Discover and today's
  shelf page.
- **A byline that is not a string, or an empty string**: no byline line is drawn for that
  card.
- **The target matches no video** (`useVideoApp`'s `empty`): the empty state, and nothing
  is called.
- **A malformed answer**: see "How the core reads an answer" above.

### 3. States

Provider shelf page:

| State | Drawn | Calls the provider |
|---|---|---|
| `waiting` (catalogue, target or module import pending) | skeleton grid | no |
| `no-target` (`empty`) | empty state | no |
| `absent` | empty state | no |
| `loading` | skeleton grid | first page, `cursor: null` |
| `failed` | **Retry** | no |
| `ready` | the grid; under it a skeleton while `more` is `loading`, **Retry** while it is `failed` | next page when `more` goes `idle` → `loading` |
| `ended` | the grid | no |

Allowed transitions:

- `waiting` → `no-target` | `absent` | `loading`, once the catalogue for the drive has
  loaded, the target is ready and the module import has settled.
- `loading` → `ready` (the first page added at least one item and its cursor is not null)
  | `ended` (the first page returned `cursor: null`, or added nothing; with nothing drawn
  this shows the empty state) | `failed`.
- `failed` → `loading` on **Retry**, from `cursor: null`.
- In `ready`, `more`: `idle` → `loading` near the end of the grid; `loading` → `idle`
  (items added, cursor not null) | `ended` (cursor null, or nothing added) | `failed`;
  `failed` → `loading` on **Retry**, with the same cursor.
- From any state, a change of drive, target, `entry` or UI locale, or a catalogue reload for
  the drive that changes the `video-discover-shelves` entries, goes back to `waiting` with
  an empty grid and resolves the entry again. Entries are compared as `useDiscover`'s
  `entriesKey` compares them: `addonName`, `id`, `priority`, `href` and `i18n_key`.

Not allowed: any provider call from `waiting`, `no-target`, `absent`, `failed` or `ended`;
a call with a cursor other than the one the previous call returned; drawing any answer of
a load that has been left.

The states of Discover's provider shelves are unchanged (SPEC-CORE-068 and #553): only the
choice between the page provider and the list provider, the bylines and the **See all**
target are new.

### 4. Data read and written

- Read: the core shelves query (`files`, `file_tags`, `tags`, `collections`,
  `watch_history`) through `GET /api/drives/{drive}/shelves?ids=…`, unchanged.
- Read: whatever the addon's provider reads, through the addon's own endpoints.
- Written: nothing on the server. In the browser, Discover's in-memory stored-ids cache now
  holds `{ id, byline? }` per item instead of an id.

### 5. External services

None. The browser calls the core and the addon routes inside the stack. A slow provider
leaves only its own shelf or page loading. The shelf page has no timeout, as today's shelf
page has none. Discover keeps its 800 ms provider deadline.

### 6. Authorization

Unchanged. Every drawn item comes from the core's shelves response for this viewer and
drive (through `restrict`), so a page provider cannot show a file outside the target, of
another drive, locked, in trash or missing (I2). The byline is text the addon chose, and it
is drawn as text, never as HTML.

### 7. Effect on existing features

- `VideoShelfPage` gains the `entry` mode. The grouping mode (`by`/`key`) is unchanged.
- `VideoCard` gains an optional prop. Callers that do not pass it draw as today.
- `useDiscover` chooses between the two provider kinds for `video-discover-shelves`, and
  changes the **See all** link. Recommended is untouched.
- Discover's stored-ids cache changes shape. It lives in memory only, so no migration is
  needed.
- Media Import today exports only `slotProviders` with `href: addons/media_import`, so its
  shelves and **See all** behave exactly as before until the addon spec moves it.
- Intelligence's Pickup (Recommended) is untouched.
- The reading app is untouched. It has its own shelf page and no addon shelves.

### 8. Error behavior

No new message. The shelf page reuses the existing empty state and **Retry**. Nothing is
logged in the browser.

### 9. User-visible behavior

Before the addon spec ships, nothing changes for the viewer, because no installed addon
exports a page provider. Once an addon does:

- Its Discover shelf's **See all** opens a page in the video app, titled with the shelf's
  name, that lists the shelf's videos under the same target (type and smart folder) as
  Discover. The grid is the same as today's shelf page, 60 at a time as the viewer scrolls,
  with no sort menu.
- The cards on that shelf and on its page show one muted line under the title if the addon
  gives one (for Media Import: the channel name and the publish date).
- Other shelves and cards look as today.

### 10. Non-functional

- Requests per page load: the provider's own reads, plus at most `ceil(n/60)` restrict
  calls for the `n` ids it passes. A page that adds nothing ends the paging, so a faulty
  cursor cannot loop.
- The byline is one line, truncated. It never grows the card's height beyond one text line.
- Drive boundary: every call is scoped to one drive. Privacy: nothing leaves the stack.

## Touch points

- `docs/specs/INDEX.md`: rows for SPEC-CORE-078 and SPEC-CORE-079.

- `frontend/src/lib/addons.ts`: the `ShelfPageProvider` type, `slotPageProviders` on
  `SlotModule`, and `loadSlotPageProvider(entry)`.
- `frontend/src/components/videoapp/useDiscover.ts`: for `video-discover-shelves`, prefer
  the page provider, keep its bylines, build **See all** from it.
- `frontend/src/components/videoapp/discoverCache.ts`: stored items carry the byline, and an
  addon shelf's key carries the UI locale.
- A new module for `createRestrict` in `frontend/src/components/videoapp/` (for example
  `restrict.ts`), moved out of `useDiscover.ts`.
- `frontend/src/components/videoapp/DiscoverFace.tsx`: pass bylines from `DrawnShelf` to
  `VideoCard`.
- `frontend/src/components/videoapp/VideoCard.tsx`: the optional `byline` prop.
- `frontend/src/components/videoapp/VideoShelfPage.tsx` and
  `frontend/src/app/drive/[name]/apps/video/shelf/page.tsx`: the `entry` mode.
- A new hook for the cursor paging, beside them (for example `useProviderShelfPage.ts`).
  `frontend/src/components/appshell/usePaged.ts` is not edited.
- `frontend/src/components/videoapp/shelfLinks.ts`: the provider page href.
- `frontend/src/components/videoapp/__tests__/`: tests for the above.
- `frontend/e2e-components/`: a spec that draws the real `VideoCard` with a long byline and
  measures that the byline stays one line and the card's text block grows by one line
  only, at 375 px and at desktop width. A static fixture is not used, because no parity
  test pins `video-app.html` to `VideoCard`. The desktop spec is registered in
  `DESKTOP_ONLY` in `frontend/e2e-components/projects.ts`.
- Docs:
  - `docs/ADDON-DEVELOPMENT.md`: "Frontend slot providers" gains `slotPageProviders`,
    `locale`, `cursor` and `byline`. The `video-discover-shelves` row states the **See all**
    rule.
  - `docs/user-guide/video.md`: the **See all** paragraph says an addon shelf opens its
    addon page; it gains that a shelf whose addon offers a page provider opens a page in
    the video app under the same target.
- Rules passed through: `design-decisions.md` ("No core-to-addon dependencies", "When no
  addon is installed, the slot is hidden", "A drive is a security boundary"), and
  `frontend-conventions.md` (i18n, `DESIGN.md` for the card line).
- Not an Internal API change. No backend change. No protected path is edited.

## Invariants

I1. Whatever addons are installed, the shelf page without `entry` (grouping, sort menu,
title, paging) behaves exactly as before this change, and a card given no byline renders
the same markup as before. With no addon exporting `slotPageProviders`, Discover and its
**See all** links are also exactly as before.

I2. The provider shelf page draws an item only if its id was accepted by the `restrict`
of that page's own load, under the app's current drive and target. So it never shows a
file outside the target, outside `type=video`, of another drive, in trash or missing.

I3. The provider shelf page never draws the same file id twice, across all of its pages,
and draws the items of each page in the provider's order.

I4. Every call after the first carries `limit: 60` and exactly the string cursor the
previous call returned. No further call is made once a call returned a cursor that is not a
non-empty string, or added no new item.

I5. An addon shelf's **See all** links to
`/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}`
exactly when its entry has a page provider, to the entry's `href` when it has none and
declares `href`, and is absent otherwise.

I6. On Discover, a `video-discover-shelves` entry with a page provider is drawn from that
provider's first page (cursor `null`, limit 12, the UI locale), and its list provider is
not called. Recommended never uses a page provider, and list providers receive no `locale`.

I7. A byline is drawn only for a non-empty string from a page provider's item, on Discover
or the provider shelf page, as text (markup in it is shown literally). It stays on one
truncated line, the title keeps its two-line clamp, and the card is at most one text line
taller than without it.

I8. A result from a superseded load (drive, target, `entry` or locale changed, mode
switched, or the page left) is never drawn, and its `viewer_required` does not call
`onViewerRejected`. The provider page then restarts from `cursor: null` with an empty grid
and an empty accepted set.

I9. An unknown `entry`, an entry without a page provider, or a failed module import shows
the empty state with the app's name as the title. A rejected first page shows **Retry**,
which resends `cursor: null`. A rejected later page keeps the items already drawn, and its
**Retry** resends the same cursor.

I10. The provider page calls no provider while the catalogue, the target or the module
import is pending (the skeleton is drawn, never the empty state), while the target matches
no video, or for an absent entry. Its first call carries `cursor: null` and `limit: 60`.

I11. A Discover addon shelf drawn from the stored cache shows, for each item, the same
byline that the provider's answer stored for that id, and never one stored under another
UI locale.

I12. In `entry` mode, `by`, `key`, `sort` and `from` have no effect, there is no sort menu,
and the title is the entry's label once the entry is found. A load that ends with nothing
drawn shows the empty state.

## Revises

SPEC-CORE-067 I7. The shelves are drawn in the order Continue, Recommended, the addon
shelves by entry `priority` ascending, then New. An addon shelf's title is the entry's
translated label. **See all** on an addon shelf links to
`/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}`
when its entry has a page provider, otherwise to `/drive/${encodeURIComponent(drive)}/${href}`
when the entry declares `href`, and is absent otherwise. Recommended has **See all** only
when its entry declares `href`.

SPEC-CORE-076 I5. A position whose key is stored and whose rebuild yields at least one item
before its provider answers is drawn, within the deadline, from the stored items filtered
by a `restrict` made for the current visit, in the stored order and with each stored
item's byline; a rebuild with no item does not settle it; an answer that arrives after the
position settled is not drawn during the visit.

SPEC-CORE-076 I7. A provider's resolved items (ids, with the byline of each when a page
provider gave one) are stored under the key it was asked with, also when they arrive after
the deadline, after the visit inputs changed or after `VideoApp` unmounted; a lookup never
returns an entry stored under a different drive, target, slot, local date, nickname or
entry list (Recommended) or entry and UI locale (addon shelf); a rejection or an absent provider writes
nothing and leaves an existing entry in place.

## Checked, no action

- **Channel and date from the `.loft` file.** Proposed earlier and dropped: a `.loft` holds
  only `provider` and `url`, and the channel and publish date are only in Media Import's
  `loft_metadata`.
- **Core columns for author and publish date, written through the Internal API.**
  Rejected by the human in favour of bylines. It would put a channel concept into the
  core, and need an Internal API write (R1–R5) and a migration. Bylines show the line only
  where an addon supplies the shelf, which is where a viewer follows subscriptions.
- **Watched dimming or a "watched" badge on the provider page.** Deferred by the human. The
  core shelves endpoint returns progress only for `by=watch`, and Discover's provider
  shelves draw no progress either. It can be raised again after use.
- **Extending `slotProviders` instead of a new export.** A union return type
  (`string[]` or `{items, cursor}`) would make every caller branch on shape, and Pickup has
  no paging to offer. A separate export keeps the list contract unchanged.
- **Dropping list providers from `video-discover-shelves`.** Not done. A simple addon shelf
  without paging remains valid, and Media Import keeps working through the gap between this
  change and the addon spec.
- **A sort menu on the provider page.** Not offered. The provider's order is the point of
  the shelf (a feed is newest-first by publish date, a regular lane is per source), and the
  core cannot re-sort a cursor-paged stream.
- **A total count.** Not shown. A page provider returns no total, and the existing shelf
  page shows none.
- **Entry id collisions across addons.** The page takes the first entry by `priority` with
  that id. Two addons using the same entry id would already collide in the catalogue's
  labels. Not guarded further under the personal-tool premise.
- **Paging through pages of repeats.** Not done. The core stops at a page that adds nothing
  new, and the contract requires cursors that do not repeat items. Continuing while the
  cursor changes would let a faulty provider run requests without bound.
- **Bylines from list providers.** Not added. Only the new contract carries them, which
  keeps `slotProviders` unchanged.
- **A design artifact.** No new screen layout. The page is today's shelf page grid without
  the sort menu, and the byline reuses `ReadingCard`'s second-line classes. The human is
  asked to confirm at approval.
- **Retiring Media Import's Watch tab.** This belongs to the addon spec that follows: page
  providers, bylines, dropping `href`, the page landing on Manage, and moving the empty-state
  guidance.
