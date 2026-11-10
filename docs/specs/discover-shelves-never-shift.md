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

This change makes a drawn shelf never move. Shelves are drawn from the top down: a shelf
appears only once every shelf above it has settled, and a single skeleton shelf stands
where the next shelf will go (SPEC-CORE-076). A provider that has not settled within a
fixed time is left out for this visit. Each provider's last answer is kept for the rest of
the browser session, per drive, target, viewer and local date, so coming back to Discover
draws every shelf from the first frame (SPEC-CORE-077). No animation is added.

## Required items

### 1. Normal flow

The shelves and their order are unchanged: Continue (with a profile), Recommended (with a
profile), the `video-discover-shelves` addon shelves by entry `priority`, then New. Call
these positions 1 to n.

**The drawn prefix (SPEC-CORE-076).** For the current inputs (drive, target params,
profile, slot entries), Discover draws positions 1..k, where k is the largest number such
that every position up to k is settled. A position is settled when:

- Continue or New: its load is `loaded` or `failed`, or it does not apply (`idle`, e.g.
  Continue without a profile).
- Recommended or an addon shelf: its provider answer is `loaded` or `failed`, it does not
  apply, or it has been dropped by the deadline below.

A settled position with nothing to draw (loaded with zero items, failed provider, dropped,
not applying) takes no space; it does not stop the positions below it from being drawn.
While k < n, exactly one skeleton shelf is drawn after the drawn positions: the existing
`ShelfBlock` with `view={{ status: "loading" }}` and an empty title, the same block
`VideoApp` already shows while the app is not ready. Nothing is drawn below the skeleton.
When k = n the skeleton is gone.

For the same inputs, k never decreases. A drawn shelf whose state later goes back to
`loading` (Retry on a failed Continue or New) stays in place and shows its own skeleton
as today; the shelves below it stay drawn.

The page therefore only grows downward while Discover loads, and a shelf header never
changes its vertical position until the viewer scrolls or changes the inputs.

**The deadline (SPEC-CORE-076).** When Discover starts asking for the current inputs, it
starts one timer of `PROVIDER_DEADLINE_MS` (800 ms, see Questions). It covers the
catalogue load, the provider module load and every provider request. When it fires,
every provider position not yet settled is dropped for these inputs: it is treated as
settled with nothing to draw, and it is not drawn for the rest of these inputs even if
its answer arrives. A late answer still goes to the cache (below). Continue and New have
no deadline; they keep their own loading, failure and Retry.

If the catalogue for this drive has not loaded when the timer fires, every provider
position is dropped, and a catalogue that arrives later draws nothing for these inputs.

**The cache (SPEC-CORE-077).** Each provider position's `loaded` answer (the built
shelf, possibly empty) is stored in memory under the key (drive, target params,
viewer nickname, slot name, entry id, local date). When Discover starts asking for some
inputs and the key of a provider position is in the cache, that position is settled at
once from the cache, and the deadline does not apply to it. The provider is still called;
its answer replaces the cache entry but is not drawn during these inputs. The next time
Discover asks for the same key, it draws the newer answer.

The cache lives in a module-level map in the browser tab. It survives leaving the video
app (opening a video, opening a shelf page, going Home) and coming back within the same
tab. A reload or a new tab starts empty. Entries whose local date is not today are
removed on every write.

### 2. Failure cases

- **A provider rejects or its module is missing** before the deadline: settled with
  nothing to draw, as today. Not cached, so the next visit asks again under the deadline.
- **A provider is slower than the deadline:** dropped for this visit, its late answer
  cached. The next visit with the same key draws it from the first frame.
- **A provider never answers:** dropped at the deadline. Nothing is cached.
- **The catalogue never loads:** every provider position is dropped at the deadline,
  Continue and New draw as their loads settle.
- **Continue or New fails:** it is settled, draws its Retry as today, and the positions
  below it may be drawn. Retry does not move anything below it.
- **Continue is slow:** nothing below it is drawn until it settles; one skeleton stands
  at position 1. Continue has no deadline (it is a core request on the LAN).
- **The inputs change** (target, profile, drive, slot entries): Discover starts again
  from k = 0 with a new deadline and its cache lookups. This is the viewer's own action.

### 3. States

Per provider position, for the current inputs:

`idle` (does not apply) | `cached` (settled from the cache) | `loading` → `loaded` |
`failed` | `dropped` (deadline fired first).

`loading` → `loaded` or `failed` before the deadline; `loading` → `dropped` at the
deadline. `dropped` and `cached` do not change for these inputs, whatever the provider
answers. A change of inputs starts every position again.

Continue and New keep `idle` → `loading` → `loaded` | `failed`, with Retry going
`failed` → `loading`.

The drawn prefix k: 0 → … → n, never decreasing for the same inputs.

The Discover empty state keeps its rule: it is shown when the target is empty, or when
Continue and New are both settled and both empty (idle or zero items). A provider shelf
can only hold items when New does, so the rule does not wait for providers.

### 4. Data read and written

- Read: unchanged (the shelves and files endpoints, and the providers' own reads).
- Written: the in-memory cache map only. No table, file, localStorage, sessionStorage or
  server state.

### 5. External services

None. All calls stay inside the stack, as today.

### 6. Authorization

Unchanged. The cache is keyed by drive and viewer nickname, and it only holds answers that
the same viewer received for the same drive and target in the same tab. A locked drive is
not reachable in the video app, so no cache entry is read for it. Locking a drive is
followed by a full page navigation, which clears the cache.

### 7. Effect on existing features

- `useDiscover` and `DiscoverFace` change. `useVideoApp` additionally returns the viewer's
  nickname for the cache key.
- Library, shelf pages, Home and `AddonSlot` do not change.
- Providers and the shelves API do not change.

### 8. Error behavior

Unchanged for the viewer: a failed Continue or New shows Retry; a provider shelf that
fails or is dropped is absent. Nothing is logged.

### 9. User-visible behavior

- While Discover loads, one skeleton shelf sits below the shelves already drawn, and
  nothing below it moves.
- New appears only after Recommended and the addon shelves have appeared, come to
  nothing, or run out of time. On a first visit this can delay New by up to
  `PROVIDER_DEADLINE_MS`.
- A Recommended or addon shelf slower than `PROVIDER_DEADLINE_MS` is absent on that
  visit and appears the next time Discover is opened in the same tab that day.
- Coming back to Discover in the same tab draws Recommended and the addon shelves at once.
  Their content is the answer from the previous visit; a video finished since then can
  still be in Recommended until the next visit.
- No animation is added.

`docs/user-guide/video.md` gains one sentence: a slow Recommended or addon shelf can be
missing on the first visit and appears the next time.

### 10. Non-functional

- No more requests than today: every provider is still called once per inputs.
- The cache holds at most one entry per (drive, target, viewer, slot entry) for today;
  each entry is at most 12 shelf items.
- The longest a first visit waits for New beyond Continue and New's own loads is
  `PROVIDER_DEADLINE_MS`.

## Touch points

- `frontend/src/components/videoapp/useDiscover.ts`: deadline, drop, cache lookup and
  write.
- `frontend/src/components/videoapp/discoverCache.ts` (new): the module-level map, key,
  and date pruning.
- `frontend/src/components/videoapp/DiscoverFace.tsx`: drawn prefix, single skeleton.
- `frontend/src/components/videoapp/useVideoApp.ts`: return the nickname.
- `frontend/src/components/videoapp/VideoApp.tsx`: pass the nickname to `useDiscover`.
- `frontend/src/components/videoapp/__tests__/`: tests for the above.
- `frontend/e2e-layout/` or `frontend/e2e-components/`: a check that a drawn shelf header
  does not move while providers settle, if jsdom cannot show it.
- `docs/user-guide/video.md`: one sentence.
- No protected path is edited.

## Invariants

I1. For the same inputs, a shelf drawn on Discover is never preceded by a shelf that was
not drawn before it: once position j is drawn, no position i < j appears later, and the
number of drawn positions never decreases.

I2. Position j is drawn only when every position before it is settled (loaded, failed,
not applying, cached or dropped).

I3. While some position is not settled, exactly one skeleton shelf is drawn, directly
after the last drawn position, and nothing is drawn after it; when all are settled, no
skeleton is drawn.

I4. A provider position not settled `PROVIDER_DEADLINE_MS` after Discover starts asking
for the current inputs is never drawn for those inputs, whatever it answers later.

I5. A provider position whose key is in the cache when Discover starts asking is drawn
from the cached answer, and a newer answer for it is not drawn until the inputs change
or Discover is mounted again.

I6. A provider's `loaded` answer, including one that arrives after the deadline, is
stored under its own (drive, target, viewer, slot, entry, local date) key, and a lookup
never returns an answer stored under a different drive, target, viewer, entry or date.
A `failed` answer is never stored.

I7. Continue and New are never dropped by the deadline, and Retry on either does not
remove or move any drawn shelf below it.

I8. The empty state is shown under the same conditions as before this change.

## Revises

SPEC-CORE-067 I5. A provider shelf is drawn only when its provider has resolved for the
current inputs with at least one item, or from a cached answer with at least one item; it
is never drawn while loading, but its position holds the single Discover skeleton while it
is the first unsettled position. A missing module, a missing function, a rejection or the
deadline hides that shelf alone.

SPEC-CORE-067 I6. With no addon declaring either slot, Discover draws Continue and New with
the same contents and order as before and sends no request for Recommended or for any
addon shelf; New is drawn once Continue has settled and the catalogue for the drive has
loaded or the deadline has fired.

## Checked, no action

- **Animating the shift.** Rejected: an animated height change still moves New under the
  viewer's eye and finger, and it lasts longer than the jump.
- **Waiting for every shelf before drawing anything.** Rejected: the slowest provider
  would hold back Continue, which is above it and already known.
- **A skeleton per provider shelf from the start.** Rejected: a provider shelf may come to
  nothing (mixed drives, narrow smart folders measured at 0 to 3 videos), and its skeleton
  would then collapse and pull New up, which is the same shift in the other direction.
- **Moving the provider shelves below New.** Would remove the shift without waiting, but
  changes the agreed order (SPEC-CORE-067 I7). Not proposed.
- **Swapping a newer answer into a cached shelf during the visit.** A different item count
  changes the shelf's row count and height, and swapping cards under the viewer's finger
  is the same problem in another form. The newer answer is drawn on the next visit.
- **sessionStorage or localStorage.** A reload already asks again; persisting across
  reloads would show yesterday's Media Import lanes and adds storage failure paths for no
  gain on the path that matters (coming back from a video).
- **Caching Continue and New.** They are one fast request each and must reflect what was
  just watched or added. They draw from a skeleton in place, from the top.
- **A deadline for Continue and New.** They are core requests whose failure already shows
  Retry; dropping them would hide the shelves the viewer uses most.
- **Library face.** Its shelves all come from one core request each and do not shift.

## Questions for the human

1. `PROVIDER_DEADLINE_MS`: proposed 800 ms. Shorter makes New appear sooner on a first
   visit and leaves Recommended out more often on that visit; longer the reverse. Pickup
   can take up to 10 serial requests. It cannot be measured locally (the test viewer's
   feed is empty); R-5 measures it on production.
2. A shelf that misses the deadline is absent for that visit and appears on the next one.
   Accept?
