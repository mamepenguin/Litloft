# Discover shelves never move after they are drawn

SPEC-ID: SPEC-CORE-076
SPEC-ID: SPEC-CORE-077

Approval:

## Summary

On the video app's Discover face, Recommended and the addon shelves come from addon
providers, which answer later than Continue and New. Today a provider shelf is not drawn
until it has an item, so New, already on screen, is pushed down once per provider shelf
that appears, up to three times, and again every time the viewer comes back from a
video. The viewer has found this unacceptable in use.

This change makes a shelf that is drawn stay where it is while Discover loads. Shelves are
drawn from the top down: a shelf appears only once every shelf above it has settled, and a
single skeleton shelf stands where the next shelf will go. A provider shelf that has not
settled within a fixed time is left out for this visit (SPEC-CORE-076). Each provider's
last list of ids is kept for the rest of the browser tab's life, so on the next visit the
shelf is built from that list with one `restrict` call under the current target and
profile, without waiting for the provider (SPEC-CORE-077). No animation is added.

## Terms

- **Positions.** The shelves and their order are unchanged: Continue (with a profile),
  Recommended (with a profile), the `video-discover-shelves` addon shelves by entry
  `priority`, then New. These are positions 1 to n. Until the catalogue is ready, the addon
  shelves are one placeholder position after Recommended; when the catalogue becomes ready
  it is replaced by one position per entry (possibly none), each unsettled until it
  settles. If the deadline fires first, the placeholder is `dropped` (settled, nothing
  drawn) and no addon position is added for the rest of the visit.
- **Visit inputs.** drive, target params, and profile (whether one applies, and its
  nickname), compared by value: target params by their JSON serialization with keys sorted.
  A new params object with equal values is not a change. The addon slot entries are **not**
  a visit input: they are read from the catalogue when it becomes ready for the drive
  (`loading` false and `catalogueDrive` equal to the drive), and an entry change after that
  is ignored until the next visit.
- **Visit.** It starts when `useDiscover`'s `active` (`asked && params !== null`) becomes
  true, including after it was false because the target was empty, and starts again
  whenever a visit input changes while `active`. It ends when
  `VideoApp` unmounts. Switching between the Discover and Library tabs does not end it:
  `useDiscover` lives in `VideoApp`, and the visit's state (deadline, which positions have
  settled, drops) lives in `useDiscover`.
- **Settled.** A position is settled once it has reached a settled state at least once in
  the visit. `useDiscover` keeps one "settled once" flag per position for the visit; a flag
  only goes from false to true, and all flags reset when a visit starts. A Retry that puts
  Continue or New back into `loading` does not reset its flag.

## Required items

### 1. Normal flow

**The drawn prefix (SPEC-CORE-076).** Discover draws positions 1..k, where k is the
largest number such that every position up to k is settled. Settled states:

- Continue or New: `loaded`, `failed`, or `idle` (does not apply, e.g. Continue without a
  profile).
- Recommended or an addon shelf: `loaded`, `failed`, `absent` (no entry, no module or no
  function), `dropped`, or `idle` (Recommended without a profile).

A settled position with nothing to draw (zero items, `failed` provider, `absent`,
`dropped`, `idle`) takes no space and does not stop the positions below it. While k < n,
exactly one skeleton shelf is drawn after the drawn positions: the existing `ShelfBlock`
with `view={{ status: "loading" }}` and an empty title, the block `VideoApp` already shows
while the app is not ready. Nothing is drawn below it. When k = n it is gone.

k never decreases during a visit, and k may grow past a position that is reloading after
Retry. Once k = n, the trailing skeleton does not come back in the visit.

k is computed by a pure function (`discoverPrefix.ts`) from the ordered "settled once"
flags; because the flags only turn true, k cannot decrease. `useDiscover` applies it and
returns to `VideoApp`, which passes to `DiscoverFace`:

- `shelves`: the drawn positions in order, each `{ id, title, href?, state, retry }`,
  leaving out settled positions with nothing to draw;
- `pending`: true while k < n (draw the trailing skeleton);
- `empty` and `hasProfile` as today.

`DiscoverFace` holds no state; it draws `shelves`, then one skeleton if `pending`. So the
e2e check can drive it through a scripted sequence of these props.

**Continue and New requests.** Within a visit they are requested once, and again only by
Retry. Their load functions are keyed by the visit inputs' values, so a new params object
with equal values, or a new `onViewerRejected`, does not re-request them.

**Empty state.** The empty state takes precedence over the trailing skeleton: when the
target is empty, or Continue and New have both settled empty, `DiscoverFace` shows the
empty state and nothing else, even if a provider position is still unsettled.

The page therefore only grows downward while Discover loads, and no shelf header moves
except through the viewer's own action (Retry, a target or profile change) or scrolling.

**Retry.** Retry on a failed Continue or New is the viewer's action and behaves as
today: the shelf shows its own skeleton grid while it loads again, then its items, its
Retry, or nothing if it comes back empty. The shelves below it move with its height.

**The deadline (SPEC-CORE-076).** When a visit starts, one timer of
`PROVIDER_DEADLINE_MS` (800 ms, see Questions) starts. It covers the catalogue load, the
module load, the cache rebuild and the provider requests. When it fires, every provider
position not yet settled becomes `dropped` for this visit: settled with nothing to draw,
and not drawn for the rest of the visit whatever arrives later. If the catalogue is not
ready when it fires, every provider position is `dropped`. Continue and New have no
deadline; they keep their own loading, failure and Retry.

**The cache (SPEC-CORE-077).** A module-level map in `discoverCache.ts`, in the browser
tab. It stores provider answers as **ordered id lists**, never shelf items.

- Key: drive; target params serialized as above; slot name; local date `YYYY-MM-DD`; and
  - Recommended: the nickname, and the slot's whole entry list (`addonName`, `id`,
    `priority` of every entry, as `entriesKey` serializes it today).
  - An addon shelf: the entry's `addonName` and `id`. No viewer: the addon shelves are
    asked with or without a profile (SPEC-CORE-067 I9).
- Ask: when the catalogue becomes ready for the drive during a visit, each provider
  position with an entry is asked once: its module is loaded and its provider is called,
  as today. This happens even after the deadline has fired, and the call runs to its end
  even if the visit ends or `VideoApp` unmounts, so the cache can be written. A slot with
  no entry is `absent` and nothing is asked or looked up for it.
- Write: when a provider resolves, the ids of the shelf `buildShelf` built from its answer
  (deduplicated, accepted by its `restrict`, in its order, at most 12; possibly none)
  replace the entry under the key it was asked with. A rejected call and an `absent` position write nothing
  and leave an existing entry in place.
- Rebuild: at the same moment as the ask, a position whose key is in the map is also
  rebuilt from the stored ids: one `restrict` call (one shelves request with `ids`, as
  SPEC-CORE-067 defines it) under the current visit's target, and `watch=unwatched` for
  Recommended. The shelf is the stored order filtered to what this `restrict` returned, at
  most 12, exactly as a provider answer is built today (`buildShelf`).
- Which answer is drawn: the position settles on whichever comes first within the
  deadline of a rebuild with at least one item, or the provider answer. A rebuild with no
  item (every stored video since watched or gone, or an empty stored list, for which no
  request is sent) does not settle the position; it waits for the provider within the
  deadline. Once settled, a later answer is not drawn during the visit. The provider answer
  still writes the cache.
- For provider and rebuild requests, `onViewerRejected` is called for a `viewer_required`
  answer only when it belongs to the current visit and its position is not yet settled. An
  answer for a settled or `dropped` position, a previous visit, or an unmounted `VideoApp`
  calls nothing, and no state is set from it. Continue and New keep today's rule: their
  `viewer_required` always calls it while their load is current.
- A reload or a new tab starts with an empty map. The module exports a function that
  empties the map, for tests.

### 2. Failure cases

- **A provider rejects** before its position settles: `failed`, nothing drawn, unless the
  rebuild settles the position first. The cache keeps whatever it held.
- **No entry, no module or no function:** `absent`, nothing drawn, nothing cached.
- **A provider is slower than the deadline and no cache entry exists:** `dropped` for this
  visit; its late answer is cached, and the next visit with the same key rebuilds from it.
- **A provider never answers:** `dropped` unless the rebuild settled it. Nothing is cached.
- **The rebuild request fails:** the position waits for its provider answer, within the
  deadline.
- **A stored video has since been watched, trashed, gone missing, or moved out of the
  target:** the rebuild's `restrict` does not return it, so it is not drawn.
- **The catalogue never loads, or loads after the deadline:** every provider position is
  `dropped`; if it loads later in the visit, the providers are still asked so the cache is
  written.
- **Continue is slow:** nothing below it is drawn until it settles; one skeleton stands at
  position 1. Continue has no deadline (it is a core request on the LAN).
- **`viewer_required`:** see the cache rules for when it counts. When it counts,
  `rejectViewer` runs as today, the profile stops applying, and that is a visit input
  change: the visit starts again from k = 0 without Continue and Recommended. This is the
  one case where shelves can move without the viewer's action (see Questions); it happens
  only when the server no longer accepts the viewer's profile.
- **The profile appears after the visit started** (`ProfileProvider` reads the nickname
  after mount on a full page load): a visit input change, so the visit restarts once,
  usually before anything below Continue has been drawn.

### 3. States

Per provider position, within a visit:

`idle` | `absent` | `waiting` (catalogue not ready) → `loading` (provider asked, rebuild
possibly running) → `loaded` (from the rebuild or the provider) | `failed`; `waiting` or
`loading` → `dropped` at the deadline.

`loaded`, `failed`, `absent` and `dropped` do not change for the rest of the visit.

Continue and New keep `idle` → `loading` → `loaded` | `failed`, with Retry going
`failed` → `loading`.

The drawn prefix k: 0 → … → n, never decreasing within a visit. A visit restart (a visit
input change, or `active` going false and true again) sets k to 0: every drawn shelf is
removed and the single skeleton is drawn, then the visit proceeds as above.

The Discover empty state keeps its rule: it is shown when the target is empty, or when
Continue and New are both settled and both empty (idle or zero items). A provider shelf
can only hold items when New does, because every item passed `restrict` under the same
target, so the rule does not wait for providers.

### 4. Data read and written

- Read: unchanged, plus one shelves request with `ids` per cached position per visit.
- Written: the in-memory map in `discoverCache.ts` only, holding drive-scoped file ids. No
  table, file, localStorage, sessionStorage or server state.

### 5. External services

None. All calls stay inside the stack, as today.

### 6. Authorization

Unchanged. Every drawn item still comes from a `restrict` made for the current visit's
drive, target and viewer (SPEC-CORE-067 I3), so a stored id can never show a file the
current request would not. Keys are built only after the catalogue is ready for the
current drive (`catalogueDrive` equal to the drive, SPEC-CORE-067 I11).

### 7. Effect on existing features

- `useDiscover` and `DiscoverFace` change. `useVideoApp` additionally returns the viewer's
  nickname.
- An entry change after the catalogue is ready no longer re-asks the providers within the
  visit (today `entriesKey` does); the next visit uses the new entries.
- Library, shelf pages, Home and `AddonSlot` do not change. Providers and the shelves API
  do not change.
- On a first load, the titled loading skeletons of Continue and New are replaced by the
  single untitled skeleton.
- Existing tests in `VideoApp.discoverProviders.test.tsx`, `VideoApp.states.test.tsx` and
  `VideoApp.test.tsx` that expect New before the providers settle, a provider shelf drawn
  whenever it resolves, or a re-ask on an entry change, are rewritten to the new rule. The
  SPEC-CORE-067/068 properties that still hold (I3, I4, I7, I11, I13, I14) keep their
  tests. Tests empty the cache between cases.

### 8. Error behavior

Unchanged for the viewer: a failed Continue or New shows Retry; a provider shelf that
fails, is absent or is dropped is not shown. Nothing is logged.

### 9. User-visible behavior

- While Discover loads, one skeleton shelf sits below the shelves already drawn, and
  nothing already drawn moves.
- New appears only after Recommended and the addon shelves have appeared, come to nothing
  or run out of time. On a first visit this can delay New by up to `PROVIDER_DEADLINE_MS`.
- A Recommended or addon shelf slower than `PROVIDER_DEADLINE_MS` is absent on that visit
  and appears the next time the video app is opened in the same tab that day, built from
  what the provider answered last time and filtered to what is still unwatched and in the
  target.
- Coming back to the video app in the same tab (from a video, a shelf page or Home), the
  provider shelves appear as soon as Continue, the addon catalogue and one shelves request
  have loaded, without waiting for the providers.
- Changing the target or the profile replaces every shelf with the single untitled
  skeleton, then draws from the top again (today Continue and New show titled skeletons).
- Switching to Library and back to Discover shows the shelves as they are now: positions
  that settled meanwhile are drawn, and nothing is asked again.
- No animation is added.

`docs/user-guide/video.md` gains one sentence: a slow Recommended or addon shelf can be
missing the first time and appears the next time.

### 10. Non-functional

- Each provider with an entry is asked exactly once per visit once the catalogue is ready,
  as today; a cached position adds one shelves request with at most 12 ids.
- The cache holds at most one entry per key, each at most 12 ids. Entries of an earlier
  date are never read; removing them is not promised.
- On a first visit, New waits at most `PROVIDER_DEADLINE_MS` longer than it does today,
  beyond Continue's own load.

## Touch points

- `frontend/src/components/videoapp/useDiscover.ts`: visit, deadline, states, cache ask,
  rebuild and write.
- `frontend/src/components/videoapp/discoverCache.ts` (new): the map, key, reset.
- `frontend/src/components/videoapp/discoverPrefix.ts` (new): the pure prefix function.
- `frontend/src/components/videoapp/DiscoverFace.tsx`: draws the prefix and the single
  skeleton.
- `frontend/src/components/videoapp/useVideoApp.ts`: return the nickname.
- `frontend/src/components/videoapp/VideoApp.tsx`: pass the nickname; pass the new props to
  `DiscoverFace`.
- `frontend/src/components/videoapp/__tests__/` (`VideoApp.discoverProviders.test.tsx`,
  `VideoApp.states.test.tsx`, `VideoApp.test.tsx`, `VideoApp.navigation.test.tsx`,
  `VideoApp.continueDesk.test.tsx` and new tests). Tests that render `VideoApp` without an
  `AddonSlotsProvider` provide a ready catalogue with no entries, so New is not held to the
  deadline.
- `frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx`,
  `frontend/e2e-layout/fixtures/video-app.html`,
  `frontend/e2e-layout/fixtures/reading-video-faces.html`: follow a markup or props change
  of `DiscoverFace`.
- `frontend/e2e-components/fixtures/app.tsx` (a new entry in `ARRANGEMENTS`),
  `frontend/e2e-components/discover-prefix.spec.ts` (mobile project, Pixel 5, 393 px),
  `frontend/e2e-components/discover-prefix-desktop.spec.ts` and
  `frontend/e2e-components/projects.ts` (`DESKTOP_ONLY`): render the real `DiscoverFace`
  through a scripted sequence of props (Continue drawn and `pending`; then Recommended
  added; then New added and `pending` false) and measure that each drawn shelf header's top
  does not change. No addon alias or API stub is needed because the face is driven by its
  props.
- `docs/specs/INDEX.md`: rows for SPEC-CORE-076 and SPEC-CORE-077.
- `docs/user-guide/video.md`: one sentence.
- No protected path is edited.

## Invariants

I1. Within a visit, the number of drawn positions never decreases, and Retry on Continue
or New does not change it.

I2. Position j is drawn only once every position before it has settled in the visit; so no
shelf ever appears above a shelf already drawn within a visit.

I3. Unless the empty state is shown, while some position has not settled exactly one
empty-title skeleton shelf is drawn, directly after the last drawn position, and nothing
after it; once all have settled, none is drawn for the rest of the visit.

I4. A provider position not settled `PROVIDER_DEADLINE_MS` after its visit starts is
never drawn during that visit, whatever arrives later; if the catalogue is not ready by
then, no provider shelf is drawn during that visit.

I5. A position whose key is stored and whose rebuild yields at least one item before its
provider answers is drawn, within the deadline, from the stored ids filtered by a
`restrict` made for the current visit, in the stored order; a rebuild with no item does not
settle it; an answer that arrives after the position settled is not drawn during the
visit.

I6. Every provider position with an entry is asked exactly once per visit once the
catalogue is ready, whether or not its key is stored and whether or not the deadline has
fired; a position with no entry is never asked and never looked up.

I7. A provider's resolved ids are stored under the key it was asked with, also when they
arrive after the deadline, after the visit inputs changed or after `VideoApp` unmounted; a
lookup never returns an entry stored under a different drive, target, slot, local date,
nickname or entry list (Recommended) or entry (addon shelf); a rejection or an absent
provider writes nothing and leaves an existing entry in place.

I8. For provider and rebuild requests, `onViewerRejected` is called only for an answer of
the current visit whose position has not yet settled; Continue and New call it as today.

I9. Continue and New are never dropped by the deadline and keep their Retry; the empty
state is shown under the same conditions as before this change.

## Revises

SPEC-CORE-067 I3. Discover draws a provider-shelf item only if its id was returned by a
`restrict` made for that same shelf in the current visit, either the one given to its
provider call or its rebuild from the cache, and never by another shelf's. So a provider
can never make Discover show a file outside the app's target, outside `type=video`, or of
another drive. For Recommended, it also cannot show one the viewer has started or finished.

SPEC-CORE-067 I4. Recommended consists only of restricted items in the provider's order,
from its answer in this visit or from its stored order, at most 12, with no duplicate. No
random request is sent for it, and it is never drawn without a profile. The provider is the
first entry by `priority` whose function exists. An entry with no module or no function is
passed over. Once an entry with a function has been chosen, no later entry is tried, even
when the chosen one rejects.

SPEC-CORE-067 I5. A provider shelf is drawn only when, for the current visit, its provider
answer or its rebuild from the cache has produced at least one item before the deadline,
and only once every shelf above it has settled; it is never drawn while loading. A missing
entry, module or function, a rejection, or the deadline hides that shelf alone.

SPEC-CORE-067 I6. With no addon declaring either slot, Discover draws Continue and New with
the same contents and order as before, sends no request for Recommended or for any addon
shelf, and shows the empty state under the same conditions as before; New is drawn once
Continue has settled and the catalogue for the drive is ready or the deadline has fired.

## Checked, no action

- **Animating the shift.** Rejected: an animated height change still moves New under the
  viewer's eye and finger, and it lasts longer than the jump.
- **Waiting for every shelf before drawing anything.** Rejected: the slowest provider
  would hold back Continue, which is above it and already known.
- **A skeleton per provider shelf from the start.** Rejected: a provider shelf may come to
  nothing (mixed drives, narrow smart folders measured at 0 to 3 videos), and its skeleton
  would then collapse and pull New up, the same shift in the other direction.
- **Moving the provider shelves below New.** Would remove the shift without waiting, but
  changes the agreed order (SPEC-CORE-067 I7). Not proposed.
- **Caching built shelf items and drawing them as they are.** Rejected: a video watched,
  trashed or moved since then would be drawn, against SPEC-CORE-067 I3, and an addon shelf
  would carry across a profile change, against I11. The rebuild costs one request.
- **Swapping a newer answer into a settled shelf during the visit.** A different item count
  changes the shelf's height, and swapping cards under the viewer's finger is the same
  problem in another form.
- **sessionStorage or localStorage.** A reload already asks again; persisting across
  reloads adds storage failure paths for no gain on the path that matters (coming back from
  a video).
- **Caching the catalogue's slot entries** so a return from Home can look up before the
  catalogue reloads. The catalogue is one request.
- **Caching Continue and New.** They are one fast request each and must reflect what was
  just watched or added.
- **A deadline for Continue and New.** They are core requests whose failure already shows
  Retry; dropping them would hide the shelves the viewer uses most.
- **Library face.** Its shelves each come from one core request and do not shift.
- **Which SPEC-ID the tests cite.** The Discover invariants of
  `video-discover-addon-shelves.md` are shared by SPEC-CORE-067 and 068 in one file; the
  revisions name 067, and existing tests citing 068 stay valid because both IDs attach to
  the same file.

## Questions for the human

1. `PROVIDER_DEADLINE_MS`: proposed 800 ms. Shorter makes New appear sooner on a first
   visit and leaves Recommended out more often on that visit; longer the reverse. Pickup
   can take up to 10 serial requests. It cannot be measured locally (the test viewer's
   feed is empty); R-5 measures it on production.
2. A shelf that misses the deadline is absent for that visit and appears on the next one.
   Accept?
3. Retry on Continue or New moves the shelves below it, as today, because it is the
   viewer's own action. Accept?
4. When the server stops accepting the viewer's profile (`viewer_required`), Continue and
   Recommended disappear and the visit restarts, which moves shelves without the viewer's
   action. It happens only in that rare case. Accept?
5. When the cached list rebuilds to nothing (every stored video watched or gone since),
   the shelf waits for the provider within the deadline instead of settling empty.
   Proposed: wait. Accept?
