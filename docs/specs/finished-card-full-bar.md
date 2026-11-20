# A finished video's card shows a full bar

SPEC-ID: SPEC-CORE-152

Approval:

## Summary

Since SPEC-CORE-141, a media card's progress bar fills only the ranges the viewer watched. A
video the viewer finished after deliberately skipping parts (an opening, a sponsor segment)
keeps those gaps on its card for good, so the card reads as unfinished work. This change draws
a **finished** video's card bar as one full bar with no resume tick. A video that is not
finished keeps the watched ranges and the tick exactly as SPEC-CORE-141 draws them. "Finished"
is the rule the video app already uses for its **Finished** watch state: the position is at
least 90 % of the duration. The seek bar band (SPEC-CORE-140) is not changed.

## Required items

### 1. Normal flow

1. `FileCard` (Continue and Recently viewed on the drive home, through
   `ContinueWatchingSection`) and `VideoCard` (video app shelves) draw `CardProgress` with
   `position`, `duration` and `ranges` from `watch_progress` and `watched_ranges`, as today.
   No API, prop or caller changes.
2. `CardProgress` decides the bar in this order:
   - `duration > 0` is false: no bar, as today.
   - **finished**, meaning `position * 10 >= duration * 9`: the bar is drawn as today's
     no-ranges bar at full length, that is the single `[data-testid="progress-fill"]` element
     with inline `width: 100%`, whatever `ranges` holds (non-empty, empty or absent). No
     `[data-testid="watched-range"]` element and no `[data-testid="resume-tick"]` element is
     rendered.
   - otherwise, `ranges` non-empty: fill exactly the ranges, and draw the tick when
     `5 < position < duration − 5` (SPEC-CORE-141, unchanged).
   - otherwise: the fill from 0 to `position / duration`, no tick (unchanged).
3. The multiplied form is the one `_watch_bucket` in `backend/app/routers/shelves.py` uses for
   the `finished` watch state, so a card the shelf groups under **Finished** is a card with a
   full bar, including at the exact 90 % boundary.

Worked examples, duration 100 s:

| position | ranges | Bar |
|---|---|---|
| 95 | `[{0,10},{30,100}]` | full, no tick |
| 90 | `[{0,40}]` | full, no tick |
| 89.9 | `[{0,40},{60,90}]` | the two ranges, tick at 89.9 % |
| 92 | `[]` | full, no tick |
| 50 | `[]` | 0–50 %, no tick |

Boundary cases the comparison must get right:

| duration | position | Finished | Note |
|---|---|---|---|
| 1.1 | 0.99 | yes | `p * 10 >= d * 9` holds; `p / d >= 0.9` and `p >= d * 0.9` do not, in IEEE doubles |
| 40 | 35.5 | no | 355 < 360; ranges drawn, and no tick because 35.5 > 40 − 5 |
| 40 | 34.9 | no | ranges drawn and a tick at 34.9 / 40 |
| 0 | 10 | — | no bar, no tick |

### Visible decision

- D6 (replaces SPEC-CORE-141 D4's "the watched ranges are filled and nothing else is" for a
  finished card only). A finished card's bar is filled across its whole width in the card's
  existing fill colour, on its existing track and height, with no resume tick. For a card that
  is not finished, D4 and D5 stand as written.

### 2. Failure cases

None new. The card computes from values it already receives. A `duration` that is 0,
negative or not a number draws no bar, as today. A `position` above `duration` (a stale
duration) counts as finished and draws a full bar, as today's 0-to-position fill already
clamps to full.

### 3. States

Per card, from `(position, duration, ranges)`: no bar; finished (full bar); in progress with
ranges (ranges, optional tick); in progress without ranges (fill to position). A card moves
between them only when the watch-history data it is drawn from changes (a new page load or
refetch); nothing on the card itself changes state.

### 4. Data read and written

None changed. The card reads `watch_progress` and `watched_ranges` that the watch-history and
shelf responses already carry. Nothing is written.

### 5. External services

None.

### 6. Authorization

None changed. The data on the card is the requesting viewer's own, as today.

### 7. Effect on existing features

- `CardProgress` has exactly two callers, `FileCard` and `VideoCard`; both change the same way.
- Continue never shows a finished row (`continue_desk_filter` requires
  `position * 10 < duration * 9`), so its cards look the same. The cards that change are
  finished ones on Recently viewed and on video app shelves (including the **Finished** group
  under **Watch State**).
- The seek bar band, the played-segments data, watch-history filters, the shelf watch state,
  Pickup's notion of watched, and resume behaviour are not touched. Opening a finished card
  still resumes where it did (the tick no longer marks it).

### 8. Error behavior

None; no new failure path, nothing logged.

### 9. User-visible behavior

- A finished video's card on Recently viewed or a video shelf shows a full bar in the card's
  existing fill colour (`FileCard`: accent on a 3px white 20 % track; `VideoCard`: white on a
  4px black 50 % track), with no resume tick, in both themes.
- Before: the same card showed only the watched ranges, with gaps where parts were skipped,
  and a tick when the position was more than 5 s from the end.
- Cards that are not finished look exactly as they do today.
- `docs/user-guide/video.md` §Watching a video gains that a finished video's card shows a
  full bar. `DESIGN.md` §Cards gains the finished rule next to the watched-ranges rule.

### 10. Non-functional

None. One comparison per card; no request, no re-render path, no storage.

## Touch points

- `frontend/src/components/CardProgress.tsx`: the finished branch.
- `frontend/src/components/FileCard.tsx`, `frontend/src/components/videoapp/VideoCard.tsx`:
  callers, expected unchanged.
- `frontend/src/components/__tests__/watchedRangesCards.test.tsx`: the rows at duration 100
  with ranges `[{0,15}]` and positions 94.75 and 95 assert SPEC-CORE-141 behaviour that this
  spec revises (both positions are now finished). They are rewritten, not deleted: at duration
  100 they now expect the full bar and no tick, and the tick's upper bound moves to the
  duration 40 rows of the boundary table (35.5 no tick, 34.9 tick), where it is still
  reachable without being finished.
- `frontend/e2e-components/fixtures/watchedRanges.tsx` and
  `frontend/e2e-components/watched-range-cards.spec.ts`: a finished case on each card kind
  (`FileCard` and `VideoCard`, position 95 of 100 with gapped ranges), measured in a real
  browser in light and dark themes: one fill spanning the track's full width, track height and
  colour and fill colour equal to the same card kind's in-progress case, and no tick.
  `frontend/e2e-layout/fixtures/video-app.html` draws only an in-progress card and is not
  changed.
- A backend pytest beside the existing shelf watch-state tests, and the vitest above, carry the
  same boundary table (`(duration, position, finished)` rows, including 1.1 / 0.99), so a drift
  between `_watch_bucket` and the card on either side fails (I3).
- `backend/app/routers/shelves.py` `_watch_bucket`: read only, the source of the finished
  rule.
- `DESIGN.md` §Cards: the progress bar and resume tick rules.
- `docs/user-guide/video.md` §Watching a video.
- No protected path.

## Invariants

I1. With `duration > 0` and `position * 10 >= duration * 9`, `FileCard` and `VideoCard` draw exactly one `progress-fill` element with `width: 100%`, no `watched-range` element and no resume tick, whether `watched_ranges` is non-empty, empty or absent.
I2. With `duration > 0` and `position * 10 < duration * 9`, the bar and tick are exactly SPEC-CORE-141's: the ranges and a tick only when `5 < position < duration − 5` if `watched_ranges` is non-empty, otherwise a fill from 0 to `position / duration` and no tick.
I3. The card's finished boundary is the shelf's: for any `(position, duration)` with `duration > 0`, a card draws the full bar exactly when `_watch_bucket` classifies the row as `finished`.
I4. Without `duration > 0`, no bar and no tick are drawn.
I5. The fill colour, track colour and bar height of each card kind are those it uses today; the full bar adds no element other than the one fill.
I6. The watch-history and shelf responses, the seek bar band and the resume position are unchanged by this change.

## Revises

SPEC-CORE-141 I8. With `watch_progress.duration > 0` and `position * 10 < duration * 9`: with non-empty `watched_ranges`, `FileCard` and `VideoCard` fill exactly the ranges and draw the tick at `position / duration` only when `5 < position < duration − 5`; with empty or absent `watched_ranges` they draw the bar from 0 to `position / duration` and no tick. With `position * 10 >= duration * 9` they draw a full bar and no tick (SPEC-CORE-152).

## Checked, no action

- **Finished by coverage.** A later change may judge "finished" by how much was watched, plus
  an explicit "treat as watched" mark. This change uses the existing 90 % position rule so the
  card agrees with the shelf's **Finished** state today; if that rule changes, the card should
  follow it.
- **Keeping the tick on a finished card.** On a long video stopped at, say, 92 %, opening the
  card resumes at 92 % and the tick used to mark that. A tick on a full bar reads as "not
  done", which is what this change removes; the resume itself is unchanged.
- **Shelf sends the finished flag.** The backend could send `finished: true`, but the card
  already has `position` and `duration`, and the same multiplied comparison keeps the two in
  step without an API change. I3 pins the agreement.
- **Seek bar band.** It shows only on hover, scrub and skip, has no track of its own, and
  serves seeking, so its gaps are information. Unchanged.
- **New design artifact.** The full bar reuses each card's agreed track, fill colour and height
  from SPEC-CORE-141's design, with nothing new drawn; no design artifact is made. D6 above
  is the one visible decision that changes, and a design check of SPEC-CORE-141's D4 reads it
  as limited to cards that are not finished.
- **Non-video media.** Audio and other media with `watch_progress` follow the same card rule;
  the 90 % gate is not video-specific in the shelf either.
