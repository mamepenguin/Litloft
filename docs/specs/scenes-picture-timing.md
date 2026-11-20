# Scenes: pictures appear as rows come into view

SPEC-ID: SPEC-ADDON-155

Approval:

## Summary

The Scenes list (SPEC-ADDON-152, 153) asks for a tile's picture only after its row has
stayed near the visible area for 150 ms with no scroll of the scroller in between. Two
things follow from that rule. Opening the panel waits 150 ms before any picture is asked
for, on top of the time the server takes. And while the list keeps moving, nothing is
asked for at all: a slow scroll shows empty tiles until the reader stops, and on a touch
device a fling decelerates for a second or more before the scroller is still. Apps the
household's one user knows fill in pictures as rows come into view.

This change asks for pictures sooner, in the browser only:

- While the panel is opening (until the reader or playback first moves the list), the
  tiles near the visible area are asked for at once.
- After that, each tile is judged on its own: a tile that has stayed near the visible
  area for a dwell time is asked for, whether or not the list is still moving. A tile
  that passes through faster is not asked for, so a fast fling does not queue pictures
  for rows nobody saw.
- The tile's `<img>` no longer carries `loading="lazy"`: the section already decides
  which pictures to ask for, and the browser's own deferral only adds delay.

The server is not changed. A native video's picture is cut by ffmpeg the first time it is
asked for (on the production machine 73–421 ms per frame, median about 160 ms) and kept
in the frame cache; a YouTube `.loft` tile is a stored file. Cutting every frame ahead of
time was considered and rejected (`## Checked, no action`).

## Terms

As in SPEC-ADDON-152 and 153 (`docs/specs/scenes-scroll-list.md`, Terms): list,
scroller, visible area, row step, visible row, shown, place a row, reader's scroll input
(§1.6), flow form, bounded form. In addition:

- **Near tile**: a tile in a visible row, or in the row directly before the first visible
  row or directly after the last one. While the visible area or the row step is not
  measured (no drawn tile, or a visible area of zero height), the tiles of rows 0, 1 and
  2 are near.
- **Active**: shown, the section's body expanded and the frames drawn (not the loading
  skeleton, including the reload of a hosted native panel). While not active, this rule
  asks for nothing and keeps no dwell.
- **Start events**: the section becoming active, a file change, and the frames arriving
  (a `.loft` reads them on mount and can be shown before they arrive).
- **Start placement**: the placement SPEC-ADDON-152 §1.3 makes after a start event (the
  playing row placed with a `mediaController`, the list's top otherwise), done before
  the first paint of the shown list.
- **Opening**: from a start event until the first of: a reader's scroll input, ruler
  input, the chip, a tile or the card being played, or a placement made because the
  playback time changed. Re-placements during opening because `c`, the row step or the
  visible area's size changed (for example the first picture's ratio, §1.15) do not end
  it.
- **Reading**: the near set the section computes when it observes the list: after the
  start placement, on each scroll event of the scroller, on each resize observation and
  on each commit that changes `c` or the row step. A reading taken before the start
  placement's own measurement (the commit that first draws the list) is not a reading.
- **Dwell time** `D`: 200 ms.
- **Dwell**: kept per tile, keyed by its frame's start time. It starts at the first
  reading in which the tile is near and ends at the first reading in which it is not. A
  tile is **dwelt** when one dwell has lasted `D`, measured from the reading that
  started it.

## Required items

### 1. Normal flow

1. The reader shows the Scenes panel. During opening, every tile that is near in a
   reading is asked for with no timer, in the reading's own update. So the rows the
   start placement shows, and rows that come into view when the first picture's ratio
   changes the row step, load at once. Tiles near only in the first commit, before the
   start placement (rows 0–2 when a playing row further down is placed, or the place a
   previous showing left), are not asked for.
2. After opening ends, while active, each reading updates the dwells: a tile that has
   become near starts a dwell, a tile no longer near ends its dwell, and a tile that
   stays near keeps its dwell running, including across a change of `c` or the row step.
   A tile whose dwell reaches `D` has its picture asked for. This holds while the
   scroller is still moving, and for placements the section makes (ruler, keys, chip,
   following during playback).
3. A tile that stops being near before `D` is not asked for; if it becomes near again, a
   new dwell starts from zero. Time from earlier dwells is never added up.
4. A picture is asked for at most once while the section stays active with the same file
   and frames, and once drawn it stays drawn while it stays active.
5. Leaving the active state, a file change and the frames arriving discard every running
   dwell and what has been asked for; a start event then begins a new opening.
6. The tile's `<img>` has no `loading` attribute, so the browser fetches it as soon as
   its `src` is set.

### 2. Failure cases

- A picture fails to load: unchanged (SPEC-ADDON-152 §1.14 and revision I14 of
  `feature-scenes-scroll-list`). The failed tile stays drawn empty for the rest of the
  active period, however it dwells again, and is asked for again after the next start
  event.
- A ruler drag cancelled by the browser puts the scroll position back (SPEC-ADDON-153
  §1.12). Tiles near only during the drag are not near in the next reading, so their
  dwells end; tiles already asked for stay.
- The server is slow (cutting a frame): the tile stays empty until it answers; later
  tiles are still asked for as they are dwelt. The browser queues requests beyond its
  per-host connection limit.

### 3. States

Per tile:

| From | Event | To |
|---|---|---|
| not active | a start event | opening, then per the reading: **asked** if near, **not near** otherwise |
| not near | (opening) near in a reading | **asked** |
| not near | (after opening) near in a reading | **dwelling** |
| dwelling | not near in a reading | **not near** |
| dwelling | `D` since the reading that started it | **asked** |
| asked | the picture fails | **failed** (drawn empty) |
| any | leaving active, a file change, the frames arriving | **not active** (dwell and request discarded; a file change or the frames arriving is itself a start event) |

**Asked** and **failed** change only through the last row. Forbidden: **asked** from
**dwelling** before `D`; **asked** after opening for a tile that has not dwelt; any dwell,
timer or request while **not active**.

### 4. Data read and written

- Read: the frame route (`GET /api/addons/intelligence/files/{id}/frame`) and the scene
  tile route (`.../scene-tile`), unchanged. The frame route writes its cache on a miss,
  as today.
- Written: nothing new. No browser storage.

### 5. External services

None. A `.loft` tile is a stored file; nothing here calls YouTube.

### 6. Authorization

Unchanged: the host proxy's `file_access` pre_check on both picture routes.

### 7. Effect on existing features

- SPEC-ADDON-152 I6 and SPEC-ADDON-089 I8 are revised (`## Revises`). Tests rewritten to
  the new rule cite `SPEC-ADDON-155 I<n>`:
  - `ScenesSectionScrollList.test.tsx`: the two `SPEC-ADDON-152 I6` cases, and the
    failure case that advances 200 ms after each wheel.
  - `ScenesSectionRequests.test.tsx`: the cases that wait for the 150 ms settle. The
    unmeasured cases (jsdom draws no layout) keep passing through the rows 0–2 fallback,
    now asked for at once.
  - `ScenesSectionOneList.test.tsx` and `ScenesSectionLoftVisualIndex.test.tsx`: the
    `.loft` picture cases, where they wait for the settle.
- The e2e cases that wait a fixed time for pictures after the host grows
  (`scenes-section.cases.ts`, the SPEC-ADDON-152 I8 / 153 I6 cases) poll for the request
  instead, so `D` does not make them flaky. The `settled()` helper in
  `scenes-scroll-list.cases.ts` waits for layout readings, not pictures, and stays.
- Following during playback: the rows it places are dwelt and asked for `D` after they
  come near, also while playback keeps placing; the old rule asked for them only once
  the list had been still for 150 ms.
- Hovering the ruler moves nothing, so it still asks for nothing (SPEC-ADDON-153 I9).
- Dropping the per-scroll `scrollVersion` render: the band, the card's top-row point and
  the chip update from the visible rows (`syncVisible`), not from that render, and must
  keep doing so (SPEC-ADDON-152 I5, I8).
- The first picture arrives sooner, so the row-step change of §1.15 lands closer to the
  first paint; e2e readings taken right after opening already wait with `settled()`.
- The server's picture routes and the frame cache are not changed.

### 8. Error behavior

Unchanged. Nothing new is shown or logged.

### 9. User-visible behavior

- Opening the panel: the pictures of the rows in view (the playing rows, or the top of
  the list) start loading with no added wait.
- Scrolling slowly, or a fling as it slows down: tiles fill in as they come into view,
  each about `D` after it came near, before the list stops.
- A fast fling: tiles that pass by in under `D` stay empty; where the list slows or
  stops they fill in.
- No new text, control or setting.

### 10. Non-functional

- The number of pictures asked for after opening is bounded by the tiles the reader
  dwelt on: a tile crossing the near zone faster than `D` costs nothing. The near zone
  is about the visible height plus two row steps, so a tile is asked for only while the
  list moves slower than about that height per `D` (for example about 2,900 px/s on a
  390 px phone sheet and about 4,500 px/s on a 700 px workbench list).
- Measured in a real browser (`frontend/e2e-components/`, the bounded fixture and the
  flow fixture on the phone project). The test records, from inside the page, the time
  of each scroll event and each tile's near set at that event (the same rule as Terms),
  and judges every tile from those observed durations, not from the nominal schedule:
  - **Slow scroll**: the scroller moves 4 px every animation frame for 2 s. Every tile
    observed near for at least `D` + 100 ms during the scroll has its picture requested
    before the scroll stops.
  - **Fast scroll**: the scroller moves one visible-area height every 50 ms across the
    list, then stops. No tile observed near for less than `D` − 50 ms in total, and
    near only while crossing, is requested; the tiles near where it stops are requested
    within `D` + 300 ms.
- Checked by the human on the iOS app after deploy (PROJECT.md `agent_cannot_verify`:
  real touch momentum): on the phone sheet, a fling's tiles fill in while it slows down,
  before the list stops, and opening the panel shows pictures without a visible pause.

## Touch points

Two repositories, shipped in this order: the intelligence addon PR first, then the core
PR that moves the `addons/intelligence` gitlink to the merged addon commit.

- Addon `addons/intelligence/frontend/ScenesSection/hooks/useScenePictures.ts`: the
  request rule (opening at once, per-tile dwell after).
- Addon `addons/intelligence/frontend/ScenesSection/hooks/useSceneList.ts`: readings
  (after the start placement, scroll, resize, `c` or row-step change) and the end of
  opening; the `scrollVersion` state, its setter in `onScroll` and its field in
  `SceneListState` go (the Container is the only reader).
- Addon `addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx`: the
  near set and the inputs it passes to the hook.
- Addon `addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx`: the
  tile `<img>` loses `loading="lazy"`.
- Addon tests: `__tests__/ScenesSectionScrollList.test.tsx`,
  `__tests__/ScenesSectionRequests.test.tsx`, `__tests__/ScenesSectionOneList.test.tsx`,
  `__tests__/ScenesSectionLoftVisualIndex.test.tsx`.
- Core: the `addons/intelligence` gitlink; `docs/specs/INDEX.md` (the SPEC-ADDON-155
  row: draft, approved, implemented); `docs/process/reviews/feature-scenes-picture-timing/`;
  `frontend/e2e-components/scenes-section.cases.ts` (picture waits); new e2e cases for
  §10 in the Scenes component specs, registered in `projects.ts` and
  `spec-viewport.spec.ts` if a new file is added.
- Rules passed through: `.claude/rules/frontend-conventions.md` (Container/Presenter: the
  Presenter stays props-only).
- No protected path, no endpoint, event, table, config key or script changes. No
  `docs/` page changes: timing only, nothing a viewer must know to use the list.

## Invariants

I1. During opening, every tile near in a reading has its picture `src` set in that reading's update with no timer elapsing (with fake timers, before any timer is advanced); a tile near only in the commit before the start placement is not asked for.
I2. After opening, while active, a tile that stays near in every reading for `D` (200 ms) from the reading that started its dwell has its picture asked for at the end of that time, even while scroll events keep arriving; at `D` − 1 ms it has none.
I3. After opening, a tile that is not near in a reading before `D` has elapsed has no picture asked for from that dwell; when it becomes near again its dwell starts from zero.
I4. A change of `c` or the row step neither restarts the dwell of a tile that stays near nor asks for a tile that has not dwelt (after opening).
I5. A picture is asked for at most once while the section stays active with the same file and frames, and a drawn picture is not removed while it stays active.
I6. Leaving the active state, a file change or the frames arriving discards every running dwell: no picture is asked for afterwards because of a dwell begun before it, and while not active no picture is asked for and no timer of this rule is pending.
I7. A tile's `<img>` has no `loading` attribute, for a native video and for a `.loft`.
I8. A failed native frame or `.loft` tile stays drawn empty for the rest of the active period and is asked for again after the next start event; a failure changes no other tile's `<img>`.

## Revises

SPEC-ADDON-152 I6. While the section is shown with its frames drawn, a tile's picture is requested at once when it is in a visible row or the row on either side of them during the opening that follows a show, a file change or the frames arriving, and otherwise once it has stayed there for 200 ms whether or not the scroller is still (SPEC-ADDON-155); it is requested at most once while the section stays so with the same file and frames, and a drawn picture is not removed meanwhile.
SPEC-ADDON-089 I8. Pictures are requested as SPEC-ADDON-152 I6, as revised by SPEC-ADDON-155 (`docs/specs/scenes-picture-timing.md`), states.

## Checked, no action

- **Cutting every native frame ahead of time** (in the CLIP worker for new videos, and a
  backfill for the rest): rejected by the human on 2026-11-20. Production has 8,858
  native videos and 1,191,822 frame rows; 1,857 (0.2%) have ever been shown. A backfill
  would take about 53 CPU hours and about 8 GB in 1.19 million small files, growing with
  the library, for videos that are rarely reopened. The first showing of a native video
  taking about a second is accepted.
- **YouTube `.loft` tiles**: already stored when fetched (528 videos with frames, all
  stored); nothing to change.
- **One contact-sheet image per video**: fewer requests, but it changes the server, the
  cache and the tile drawing; not needed once the first showing is accepted.
- **Cancelling requests for tiles that scrolled away**: a picture is kept once asked for
  (I5), and an `<img>` whose `src` stays set is not cancelled. A tile dwelt and then
  flung away before its fetch started still fetches; the dwell keeps tiles that only
  flash by from being asked for at all, which is the case that matters.
- **Asking at once after opening, for a placement the section makes** (a ruler click,
  the chip, a tile far away): those dwell like a scroll. A ruler drag places a row on
  every move, and asking at once would ask for every row it crossed; a jump shows its
  pictures `D` later.
- **Prefetching the first rows before the panel is shown**: costs requests for readers
  who never open the panel; not done.
- **A shorter dwell (100 ms)**: more tiles of a fling would be asked for (below about
  5,800 px/s on the phone sheet) and would queue ahead of the tiles where it stops.
  200 ms keeps a decelerating fling's tail filling in.
- **Removing `loading="lazy"` asks for the rows one step outside the view on opening**:
  the same set the old rule asked for 150 ms later; the browser's lazy margin was
  already wider than one row.
- **Timer and render counts** (one pending timer for the rule rather than one per tile,
  no tile re-render from a clock tick): design notes for the implementation, not tested.
- **Changing the server's per-request cost** (thread pool size, ffmpeg options): not part
  of this change; the measured cost is the accepted baseline.
