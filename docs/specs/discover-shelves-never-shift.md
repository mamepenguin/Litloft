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
single skeleton shelf stands where the next shelf will go (SPEC-CORE-076). A provider that
has not settled within a fixed time is left out for this visit. Each provider's last answer
is kept for the rest of the browser tab's life, per drive, target, viewer and local date,
so coming back to Discover draws the provider shelves without waiting for the providers
(SPEC-CORE-077). No animation is added.

## Terms

- **Positions.** The shelves and their order are unchanged: Continue (with a profile),
  Recommended (with a profile), the `video-discover-shelves` addon shelves by entry
  `priority`, then New. These are positions 1 to n.
- **Visit inputs.** drive, target params, and profile (whether one applies, and its
  nickname). The addon slot entries are **not** a visit input: they are read from the
  catalogue when it becomes ready for the drive (`loading` false and `catalogueDrive` equal
  to the drive), and an entry change after that is ignored until the next visit.
- **Visit.** It starts when `useDiscover`'s `active` (`asked && params !== null`) becomes
  true, and starts again whenever a visit input changes while `active`. It ends when
  `VideoApp` unmounts. Switching between the Discover and Library tabs does not end it:
  `useDiscover` lives in `VideoApp`, and the visit's state (drawn prefix, deadline, drops,
  which answer each position shows) lives in `useDiscover`, not in `DiscoverFace`.

## Required items

### 1. Normal flow

**The drawn prefix (SPEC-CORE-076).** For the current visit, Discover draws positions
1..k, where k is the largest number such that every position up to k is settled. A
position is settled when:

- Continue or New: its load is `loaded` or `failed`, or it does not apply (`idle`, e.g.
  Continue without a profile).
- Recommended or an addon shelf: it is `loaded`, `cached`, `failed`, `absent` (no module
  or no function), `dropped`, or does not apply (`idle`, e.g. Recommended without a
  profile).

A settled position with nothing to draw (zero items, `failed`, `absent`, `dropped`,
`idle`) takes no space and does not stop the positions below it. While k < n, exactly one
skeleton shelf is drawn after the drawn positions: the existing `ShelfBlock` with
`view={{ status: "loading" }}` and an empty title, the block `VideoApp` already shows while
the app is not ready. Nothing is drawn below it. When k = n it is gone.

k never decreases during a visit. Once k = n, the trailing skeleton does not come back.

The page therefore only grows downward while Discover loads, and no shelf header moves
except through the viewer's own action (Retry, a tab or target change, a profile change)
or scrolling.

**Retry.** Retry on a failed Continue or New is the viewer's action and behaves as
today: the shelf shows its own skeleton grid while it loads again, and then its items, its
Retry, or nothing if it comes back empty. The shelves below it move with its height. This
does not change k and does not bring back the trailing skeleton.

**The deadline (SPEC-CORE-076).** When a visit starts, one timer of
`PROVIDER_DEADLINE_MS` (800 ms, see Questions) starts. It covers the catalogue load, the
provider module load and every provider request. When it fires, every provider position
not yet settled is `dropped` for this visit: settled with nothing to draw, and not drawn
for the rest of the visit even if its answer arrives. If the catalogue is not ready when it
fires, there are no provider positions for this visit: New is drawn once Continue settles,
and a catalogue arriving later draws nothing for this visit. Continue and New have no
deadline; they keep their own loading, failure and Retry.

**The cache (SPEC-CORE-077).** A module-level map, `discoverCache.ts`, in the browser tab.

- Key: drive; target params serialized as JSON with keys sorted; slot name; local date
  `YYYY-MM-DD`; and per slot:
  - Recommended (one shelf per slot, asked only with a profile): the nickname.
  - An addon shelf (asked with or without a profile, SPEC-CORE-067 I9): the entry's
    `addonName` and `id`, and no viewer.
- Lookup: when the catalogue becomes ready during a visit and before the deadline has
  fired, each provider position whose key is present is settled as `cached` with the
  stored items. The deadline does not apply to it afterwards.
- Every provider position is still asked once per visit, cached or not. Its answer, if it
  is a built shelf (zero or more items), replaces the stored entry. It is not drawn during
  this visit when the position is `cached` or `dropped`.
- The write happens whenever the answer arrives, including after the deadline, after the
  visit inputs have changed and after `VideoApp` has unmounted. It goes under the key the
  provider was asked with.
- A rejected provider call and an `absent` position write nothing and leave any existing
  entry as it is.
- A reload or a new tab starts with an empty map. The module exports a function that
  empties the map, for tests.

### 2. Failure cases

- **A provider rejects** before the deadline: `failed`, nothing drawn, as today. The cache
  keeps whatever it held.
- **No module or no function for an entry:** `absent`, nothing drawn, nothing cached.
- **A provider is slower than the deadline:** `dropped` for this visit; its late answer is
  cached, and the next visit with the same key draws it once the catalogue is ready.
- **A provider never answers:** `dropped`. Nothing is cached.
- **The catalogue never loads, or loads after the deadline:** no provider position this
  visit; Continue and New draw as their loads settle.
- **Continue is slow:** nothing below it is drawn until it settles; one skeleton stands at
  position 1. Continue has no deadline (it is a core request on the LAN).
- **A request answers `viewer_required`:** `rejectViewer` runs as today, the profile stops
  applying, and that is a visit input change: the visit starts again from k = 0 without
  Continue and Recommended. This is the one case where shelves can move without the
  viewer's action (see Questions); it happens only when the server no longer accepts the
  viewer's profile.
- **The visit inputs change** (target, drive, profile): a new visit, from k = 0, with a new
  deadline and new cache lookups.

### 3. States

Per provider position, within a visit:

`idle` (does not apply) | `waiting` (catalogue not ready) → `loading` → `loaded` |
`failed` | `absent` | `dropped`; or `waiting` → `cached`; or `waiting` | `loading` →
`dropped` at the deadline.

`cached`, `dropped`, `loaded`, `failed` and `absent` do not change for the rest of the
visit, whatever the provider answers later.

Continue and New keep `idle` → `loading` → `loaded` | `failed`, with Retry going
`failed` → `loading`.

The drawn prefix k: 0 → … → n, never decreasing within a visit.

The Discover empty state keeps its rule: it is shown when the target is empty, or when
Continue and New are both settled and both empty (idle or zero items). A provider shelf
can only hold items when New does, so the rule does not wait for providers.

### 4. Data read and written

- Read: unchanged (the shelves and files endpoints, and the providers' own reads).
- Written: the in-memory map in `discoverCache.ts` only. No table, file, localStorage,
  sessionStorage or server state.

### 5. External services

None. All calls stay inside the stack, as today.

### 6. Authorization

Unchanged. A cache entry is keyed by drive and viewer and only holds an answer that the
same tab received for that drive and target. The cache cannot reach a drive the tab
cannot: Discover reaches the cache only for the drive the video app was opened on, and its
catalogue readiness requires `catalogueDrive` to equal that drive (SPEC-CORE-067 I11), so
no key is built from another drive's entries. Locking a drive navigates with a full page
load, which empties the map.

### 7. Effect on existing features

- `useDiscover` and `DiscoverFace` change. `useVideoApp` additionally returns the viewer's
  nickname.
- A profile change does not ask the addon shelves again within the visit beyond what the
  new visit needs: the addon shelves' cache key does not include the viewer, so a profile
  change finds their answer in the cache from the earlier visit.
- Library, shelf pages, Home and `AddonSlot` do not change. Providers and the shelves API
  do not change.
- Existing tests in `VideoApp.discoverProviders.test.tsx`, `VideoApp.states.test.tsx` and
  `VideoApp.test.tsx` that expect New before the providers settle, or a shelf drawn as soon
  as its provider resolves late, are rewritten to the new rule; the SPEC-CORE-067/068
  properties that still hold (I3, I4, I7, I11, I13, I14) keep their tests. Tests empty the
  cache between cases.

### 8. Error behavior

Unchanged for the viewer: a failed Continue or New shows Retry; a provider shelf that
fails, is absent or is dropped is not shown. Nothing is logged.

### 9. User-visible behavior

- While Discover loads, one skeleton shelf sits below the shelves already drawn, and
  nothing already drawn moves.
- New appears only after Recommended and the addon shelves have appeared, come to nothing
  or run out of time. On a first visit this can delay New by up to `PROVIDER_DEADLINE_MS`.
- A Recommended or addon shelf slower than `PROVIDER_DEADLINE_MS` is absent on that visit
  and appears the next time the video app is opened in the same tab that day.
- Coming back to the video app in the same tab (from a video, a shelf page or Home), the
  provider shelves appear as soon as Continue and the addon catalogue have loaded, without
  waiting for the providers. Their content is the answer the previous visit received; a
  video finished since then can still be in Recommended until the following visit.
- Switching to Library and back to Discover draws what was drawn before; nothing new
  appears.
- No animation is added.

`docs/user-guide/video.md` gains one sentence: a slow Recommended or addon shelf can be
missing the first time and appears the next time.

### 10. Non-functional

- Each provider position is asked at most once per visit, as today.
- The cache holds at most one entry per key, each at most 12 shelf items. Entries of an
  earlier date are never read; removing them is not promised.
- On a first visit, New waits at most `PROVIDER_DEADLINE_MS` longer than it does today,
  beyond Continue's own load.

## Touch points

- `frontend/src/components/videoapp/useDiscover.ts`: visit, deadline, states, drawn prefix,
  cache lookup and write.
- `frontend/src/components/videoapp/discoverCache.ts` (new): the map, key, reset.
- `frontend/src/components/videoapp/DiscoverFace.tsx`: draws the prefix and the single
  skeleton from what `useDiscover` returns.
- `frontend/src/components/videoapp/useVideoApp.ts`: return the nickname.
- `frontend/src/components/videoapp/VideoApp.tsx`: pass the nickname; pass the new props to
  `DiscoverFace`.
- `frontend/src/components/videoapp/__tests__/` (`VideoApp.discoverProviders.test.tsx`,
  `VideoApp.states.test.tsx`, `VideoApp.test.tsx` and new tests).
- `frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx`,
  `frontend/e2e-layout/fixtures/video-app.html`,
  `frontend/e2e-layout/fixtures/reading-video-faces.html`: follow a markup or props change
  of `DiscoverFace`.
- `frontend/e2e-components/`: a new spec that renders the real Discover with a provider
  that answers late and measures that a drawn shelf header's top does not change until
  every position settles.
- `docs/user-guide/video.md`: one sentence.
- No protected path is edited.

## Invariants

I1. Within a visit, the number of drawn positions never decreases, and Retry on Continue
or New does not change it.

I2. Position j is drawn only when every position before it is settled; so no shelf ever
appears above a shelf already drawn within a visit.

I3. While some position is not settled, exactly one empty-title skeleton shelf is drawn,
directly after the last drawn position, and nothing after it; once all are settled, none
is drawn for the rest of the visit.

I4. A provider position not settled `PROVIDER_DEADLINE_MS` after its visit starts is
never drawn during that visit, whatever it answers later; if the catalogue is not ready
by then, no provider shelf is drawn during that visit.

I5. A provider position found in the cache is drawn from the stored items, and a newer
answer for it is not drawn until the next visit.

I6. Every provider position is asked exactly once per visit, whether or not it was found
in the cache.

I7. A provider's built shelf (zero or more items) is stored under the key it was asked
with, also when it arrives after the deadline, after the visit inputs changed or after
`VideoApp` unmounted; a lookup never returns an entry stored under a different drive,
target, slot, viewer (Recommended), entry (addon shelf) or local date; a rejection or an absent provider writes nothing
and leaves an existing entry in place.

I8. Continue and New are never dropped by the deadline and keep their Retry.

I9. The empty state is shown under the same conditions as before this change.

## Revises

SPEC-CORE-067 I5. A provider shelf is drawn only when its provider has resolved for the
current visit with at least one item, or from a cached answer with at least one item, and
only once every shelf above it has settled; it is never drawn while loading. A missing
module, a missing function, a rejection or the deadline hides that shelf alone.

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
- **Swapping a newer answer into a cached shelf during the visit.** A different item count
  changes the shelf's row count and height, and swapping cards under the viewer's finger
  is the same problem in another form.
- **sessionStorage or localStorage.** A reload already asks again; persisting across
  reloads would show stale Media Import lanes and adds storage failure paths for no gain on
  the path that matters (coming back from a video).
- **Caching the catalogue's slot entries** so a return from Home can look up before the
  catalogue reloads. The catalogue is one request; the provider shelves then wait for it
  and Continue, not for the providers.
- **Caching Continue and New.** They are one fast request each and must reflect what was
  just watched or added.
- **A deadline for Continue and New.** They are core requests whose failure already shows
  Retry; dropping them would hide the shelves the viewer uses most.
- **Library face.** Its shelves each come from one core request and do not shift.
- **Which SPEC-ID the tests cite.** The Discover invariants of `video-discover-addon-shelves.md`
  are shared by SPEC-CORE-067 and 068 in one file; the revisions name 067, and existing
  tests citing 068 stay valid because both IDs attach to the same file.

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
