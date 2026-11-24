# Scenes: rows follow the height the host gives

SPEC-ID: SPEC-ADDON-104

Approval: sha256:f6c531b6906b5bbe5e5d8cf035998960347c7f35260260170946f66f517620e1 Yuichi Senga 2026-11-12

## Summary

The intelligence Scenes section draws its frame grid as a window of 3 rows × `c`
columns, where `c` follows the section's width (SPEC-ADDON-093). Since the player
workbench (SPEC-CORE-085, SPEC-ADDON-099) the section sits in a panel under the player,
or in an inspector or sheet tab, and those boxes can be taller than 3 rows need, so the
section leaves empty space under itself. This change takes the row count `R` from the
height available to the section, the way the column count already comes from its width:
as many rows as fit, never fewer than 3. The window becomes `R × c` frames and moves as
it does today. It is for the viewer working with scenes beside the player on a tall
screen; where 3 rows do not fit (a 1440×900 laptop) nothing changes.

Agreed design: https://claude.ai/artifact/MAr572eiMVvXALsohEKZ3U, saved in
`docs/process/reviews/feature-scene-rows-fill-height/design/` (`Main.dc.html` with its
`vh`, `panels` and `cardpos` tweaks, `Two.dc.html`, `Short.dc.html`, `CardPos.dc.html`,
`Tablet.dc.html`, `Phone.dc.html`, and the shared `Panel.dc.html`). Decisions recorded
in hako `VoRnnkS7IB7EiHyNESkab`.

The design's visible decisions:

- D1. One panel, 1024px wide, 1400px window: the player is 1024×576, the Scenes panel
  under it has 8 columns and 4 rows.
- D2. Two panels side by side in the same window: Scenes has 4 columns and 4 rows.
- D3. 900px window: the panel is shorter than 3 rows need. It draws 3 rows and its body
  scrolls, as today.
- D4. From the top, the panel body holds the ruler with its time labels, the grid, the
  scene card directly under the grid, and the action row. The height left over (less
  than one row) is below the action row, at the bottom of the panel. `CardPos.dc.html`
  B and C are the rejected alternatives.
- D5. Tablet portrait, Scenes tab: the same rule; at 768×1024 the tab is shorter than 3
  rows need, so it draws 3 rows and scrolls.
- D6. Phone sheet, Scenes tab, 390px wide: at the half snap it draws 3 rows and the
  sheet scrolls; at the full snap it draws 4 rows of 3 columns.
- D7. The tiles, ruler, card and action row look as they do today. Only the number of
  rows changes.

## Terms

- **Scroller**: the section's nearest ancestor whose computed `overflow-y` is `auto` or
  `scroll`, other than the document's root scroller. Today that is:
  - the workbench panel body (`.media-detail-workbench-body`), on the canonical page and
    on the collection surface;
  - the selected inspector tab panel in its `panel` form;
  - the phone sheet's scroller (`mobile-inspector-content`), which holds the inspector
    in its `column` form.
- **Last part**: the lowest element the section draws in its current state: the action
  row when it is drawn, otherwise the stale note, the scene card or the Visual Index
  placeholder, otherwise the grid.
- **Slack**: the scroller's client height minus the distance, in the scroller's content
  coordinates (independent of its `scrollTop`), from the top of its content box to the
  bottom of the last part, minus the bottom padding, border and margin of every element
  between the last part and the scroller (the section's own root included). Slack is
  negative when the scroller overflows. It is evaluated at the **full width**: the width
  the scroller's content box has without a classic scrollbar (its client width plus the
  scrollbar's width, `offsetWidth − clientWidth − borders`). When a scrollbar is showing,
  the tile heights in the measurement are scaled to the tile width at the full width.
- **Row step**: the height of one drawn tile (picture and time label) plus the grid's
  row gap, measured from a drawn tile rather than computed from constants, so it follows
  the presenter's classes and the picture ratio, and scaled to the full width as above.
- **Measurable**: the section's own box is displayed with a width and height above zero,
  a tile is drawn with a height above zero, and the scroller exists and has a client
  height above zero. A section inside a `hidden` panel or tab panel is not measurable,
  even when its scroller (the phone sheet's) is displayed. A scroller that is sized to
  its content (no bound on its height) is measurable but gives a slack of 0, so `R`
  stays at the value it starts with, 3.
- **`c`**: the column count of SPEC-ADDON-093 I1, unchanged.
- **`R`**: the number of grid rows.

## Required items

### 1. Normal flow

1. The section's expanded body is drawn (the section is `active`, or has no `active`
   prop, and its view is `expanded`).
2. It measures `c` from its width, as today. For the row measurement `c` is taken at the
   full width.
3. If the scroller is measurable, `R` is the largest whole number of at least 3 for
   which the slack would be at least 0 with `R` rows drawn. With `r` rows drawn and a
   slack of `S`, that is `R = max(3, r + floor(S / step))` where `step` is the row step.
   If the scroller is not measurable, or `step` is not above 0, or `S` is not finite,
   `R` keeps its last value, or 3 when it has none.
4. `R` is measured after the DOM commits and before the browser paints (a layout
   effect), so a shown body never paints a row count that the parts drawn in that same
   frame would replace. Opening a panel or a tab, or changing the file, paints the `R`
   measured from what that frame draws.
5. The grid shows the window of `R × c` frames starting at
   `s = clamp(c × floor(i / c) − c, 0, max(0, n − R·c))`, with `i` and `n` as
   SPEC-ADDON-089 I1 defines them. The frame being looked at stays in the second row
   until the window reaches the end, and the window moves one row (`c` frames) at a time,
   as today.
6. The ruler's band covers the drawn tiles (SPEC-ADDON-093 I4, unchanged in wording).
7. The pictures of the drawn tiles are requested once the window has stayed 150 ms
   (SPEC-ADDON-093 I3, unchanged in wording).
8. `R` is measured again after every render of the expanded body, and whenever a
   `ResizeObserver` reports a size change of the scroller, the section's root, the grid,
   or any part drawn around the grid (header, ruler, placeholder, card, stale note,
   action row). Observing the parts, not a list of state changes, covers the policy
   resolving, the Visual Index answer, an action error's text and the first picture's
   ratio alike; the workbench stretches the section's root, so the root alone would not
   report them. If `R` changes, the grid is redrawn with the new `R` around the same
   point being looked at. Size causes: a window resize, the second panel turned on or
   off, the workbench switching between side by side and stacked, the inspector resized,
   the phone sheet settling on a snap.
9. A change of `R` after the first frame is expected when the parts around the grid
   change height after opening, and the section accepts it as one step:
   - the Visual Index placeholder is drawn while the policy and the `visual-index`
     request are pending, and is removed when there is no Visual Index (policy off,
     `eligible: false`, `available: false`, 404 or an error), so `R` can grow by one;
   - the tiles are drawn at 16:9 until the first picture reports its ratio, so a 4:3 or
     portrait video can lose a row;
   - the stale note or an action error appearing can lose a row.

### 2. Failure cases

- **Scroller not measurable** (first render before layout, a host that does not bound
  the height, a hidden panel, jsdom): `R` keeps its last value, or 3.
- **`ResizeObserver` missing**: `R` is measured on each render of the expanded body and
  not on resizes alone.
- **Fewer than `R·c` frames**: every frame is drawn (SPEC-ADDON-089 I1 as revised
  below), in fewer than `R` rows. No empty rows are reserved; the slack is then larger
  than one row step, and I2 does not apply.
- **A picture request fails**: unchanged (SPEC-ADDON-089 I7 / SPEC-ADDON-080 I6). A
  failed tile keeps its tile-sized block, so the row step is unchanged.

### 3. States

The section's states are unchanged (collapsed, loading, expanded; the Visual Index rows
of SPEC-ADDON-089 §3). `R` is a derived value, not a state:

- In the collapsed view no grid is drawn and `R` is not measured.
- In the loading view the skeleton keeps `3c` blocks (SPEC-ADDON-093 I6, unchanged).
- In the expanded view `R` follows §1.8. A Visual Index state change that swaps the
  placeholder for the card, adds the stale note, or adds or removes the action row or its
  error text can change `R`.

### 4. Data read and written

None. No request, table, file or storage changes. The number of picture requests per
window grows from `3c` to `R × c`.

### 5. External services

None. Pictures come from the intelligence frame route and the `.loft` scene-tile route
as today; only how many are requested per window changes (§10).

### 6. Authorization

None. The section's requests and their drive header are unchanged.

### 7. Effect on existing features

- The Scenes section is the only consumer. Every host that bounds the height gets the
  rule, as the human chose: the workbench panel on the canonical page, the workbench
  panel on the collection surface (its panels are a fixed share of the visible height,
  SPEC-CORE-090), the inspector tab in its `panel` form, and the phone sheet. No core
  code changes.
- The keyboard on the ruler, seeking, browse points, the Visual Index states and the
  `.loft` behaviour are unchanged.
- jsdom lays nothing out, so no scroller is measurable there and `R` is 3. Existing unit
  tests that expect `3c` tiles keep passing. The existing e2e arrangements draw the
  section in a host with no scroller and also keep `R = 3`.

### 8. Error behavior

Nothing new is shown or logged. Every failure above falls back to the last `R`, or 3.

### 9. User-visible behavior

- In a panel, tab or sheet taller than 3 rows need, the grid has more rows: as many whole
  rows as fit with the ruler, the card, the note and the action row. The leftover (less
  than one row step) is at the bottom, below the action row.
- The ruler's band is wider by the added rows.
- Resizing the window, turning a second panel on or off, or moving the phone sheet to
  another snap changes the number of rows without animation.
- Just after a panel or tab opens, or the file changes, the row count can change once
  more by about one row: when it turns out the video has no Visual Index (one row more),
  or when the first picture shows the video is not 16:9 (fewer rows for 4:3 or
  portrait). During a drag of the sheet
  the rows may stay as they were until it settles.
- Where 3 rows do not fit, nothing changes from today: 3 rows, and the panel body, tab or
  sheet scrolls.

### 10. Non-functional

- Picture requests per window are `R × c`. At a 1600px-tall window with the inspector
  closed that is about 17 columns × 6 rows = 102. Native frames are cut by ffmpeg on the
  first request and served from the cache after; the browser's per-origin connection
  limit spreads the first load out. No extra cap is added.
- No feedback loop: `R` depends on the scroller's size, the full width and the heights
  of the parts around the grid, none of which depends on `R`. A classic scrollbar cannot
  feed back either, because the slack and the row step are evaluated at the full width:
  an `R` above 3 fits without a scrollbar, so none appears. When `R = 3` and the scroller
  overflows, the drawn `c` follows the width left beside the scrollbar, as it does today,
  and `R` stays 3.
- No layout shift while playing or browsing: `R` depends on sizes, not on the point being
  looked at.

## Touch points

In the intelligence addon repository (`addons/intelligence`, a submodule):

- `frontend/ScenesSection/ScenesSectionContainer.tsx`: holds `R`, uses `R × c` for the
  window and the requested pictures.
- `frontend/ScenesSection/ScenesSectionPresenter.tsx`: the grid and the ruler band use
  `R × c` instead of `3 × columns`; refs for the last part and a tile.
- `frontend/ScenesSection/scenesModel.ts`: `windowStartFor` takes the row count; a pure
  function `sceneRows(drawnRows, slack, step)` returns `R`.
- `frontend/ScenesSection/hooks/`: a new hook that finds the scroller, decides whether it
  is measurable, measures the slack and the row step in a layout effect, and re-measures
  with `ResizeObserver`.
- `frontend/ScenesSection/__tests__/`: unit tests for `sceneRows` and the window.

In the core repository:

- `frontend/e2e-components/fixtures/scenesSection.tsx`, `fixtures/scenesSectionData.ts`
  and the `"scenes-…"` entries of `fixtures/app.tsx`: arrangements that mount the section
  in the real hosts, not in plain bounded boxes:
  - the core `Workbench` with the Scenes entry shown, one panel and two side by side, at
    several heights and widths;
  - the core `InspectorShell` in its `panel` form with the Scenes tab selected;
  - the core `MobileInspectorSheet` at its half and full snaps, holding `InspectorShell`
    in its `column` form with the Scenes tab selected;
  - an existing unbounded arrangement, unchanged;
  - a 16:9 and a 4:3 frame set, and Visual Index states with the placeholder, the card,
    and the stale note with the action row.
- `frontend/e2e-components/scenes-section*.spec.ts` and `scenes-section.cases.ts`: the
  measurements. At least one case styles the scroller's `::-webkit-scrollbar` with a
  width, so headless Chromium draws a classic scrollbar and I5 is measured with one. I7
  is measured with a per-animation-frame record of the drawn tile count, not a final
  state.
- The submodule pointer bump for `addons/intelligence`.
- `docs/specs/scene-rows-fill-height.md`, `docs/specs/INDEX.md`,
  `docs/process/reviews/feature-scene-rows-fill-height/`.
- No protected path is edited. No user-guide page changes: this is a layout change,
  which `CLAUDE.md` keeps out of `docs/user-guide/`.

Rules passed through: `.claude/rules/frontend-conventions.md` (Container/Presenter,
`DESIGN.md`), `.claude/rules/design-decisions.md` (no core-to-addon code).

## Invariants

The window formula, the requested pictures and the height rule are restated in the
Revises lines for SPEC-ADDON-089 I1, I5 and I8. Tests of those cite SPEC-ADDON-089; tests
of the lines below cite SPEC-ADDON-104.

I1. With the scroller measurable, `R` is the largest whole number of at least 3 for which
the slack is at least 0. With it not measurable before any measurement, `R` is 3.
I2. When `R` is greater than 3 and at least `R·c` frames exist, the slack is at least 0
and less than one row step, and the scroller does not scroll vertically.
I3. From top to bottom the section draws its header (when drawn), the ruler with its
labels, the grid, then the Visual Index placeholder or the scene card, the stale note and
the action row, in that order, with the gaps they have today. Nothing is placed between
the grid and the card.
I4. While the sizes of the scroller and of the section's parts stay the same, moving the
playback position or the browse point never changes `R`.
I5. After the scroller's size or a part's height changes and the layout has settled,
`R` equals I1's value for the new sizes, and it does not alternate between two values
over the following frames, with overlay or classic scrollbars.
I6. Measuring again after the grid has been redrawn with `R` rows returns `R`.
I7. The first painted frame of a shown expanded body already has the `R` measured from
the parts drawn in that frame: when a panel or tab is opened or the file changes, no
frame paints 3 rows before that `R`.

## Revises

SPEC-ADDON-089 I1. The ruler draws exactly one tick per `clip-timestamps` row, at `min(start, L) / L` of its width, with `L` as §2 of docs/specs/scene-timeline.md defines it. The grid shows the frames from `s = clamp(c × floor(i / c) − c, 0, max(0, n − R·c))` to `s + R·c − 1`, or every frame when there are fewer than `R·c`. `c` is the column count of docs/specs/scene-timeline-width.md I1, `R` the row count of docs/specs/scene-rows-fill-height.md I1, and `i` is the last frame whose start is at or before the point being looked at, or frame 0 before the first.
SPEC-ADDON-089 I5. The file page draws at most one Scenes panel for a video, and only in the states §3 does not hide, and nothing for any other file type. The intelligence manifest has exactly one `scenes` entry, in `player-side`, and no `visual-index` or `clip-frames` entry. No element inside the section scrolls on either axis, with either pointer; the panel body that holds it may. While the section is shown with the same width and the same scroller size, its height does not change when the window moves or the browse point changes. The section is as wide as its host's content box.
SPEC-ADDON-089 I8. Only the pictures of the current window (`R·c` of them, or every frame when there are fewer) are requested. While the browse point moves, a window's pictures are requested only after that window has stayed 150 ms.

## Checked, no action

- **Shrinking below 3 rows to avoid scrolling.** Rejected by the human: the previous,
  current and next rows are the design's point. A 1440×900 window keeps today's scroll.
- **Pinning the card to the bottom, or putting it above the grid.** Rejected by the human
  (design `CardPos.dc.html` B and C).
- **Filling only under the player and keeping 3 rows in tabs.** Rejected by the human: it
  needs a new core prop saying where an entry is placed, and the tab is as bounded as the
  panel.
- **Reserving empty rows for a short video.** Not done: the grid draws the frames it has,
  as today, and the leftover is larger.
- **A cap on `R`.** Not added: `R` is bounded by the screen height, and the requests are
  bounded by `R × c` with cached pictures. Revisit if a portrait 4K display makes the
  first load slow.
- **The loading skeleton at `R × c`.** Kept at `3c` (SPEC-ADDON-093 I6): the skeleton
  shows for a moment, and the loaded view has a card and actions the skeleton does not,
  so matching `R` there would change the row count anyway when it loads.
- **Using the `fillHeight` prop to switch the behaviour.** Every host passes `true`
  (workbench, tabs and `file-detail-sections`), so it cannot tell a bounded box from an
  unbounded one. The scroller is measured instead.
- **Measuring the section's own box.** The workbench stretches its body's child
  (`.media-detail-workbench-body > *`), so the root's bottom always meets the body's and
  says nothing about `R`. The slack is measured from the last part instead.
- **Computing the row step from constants.** Measured from a drawn tile, so the label's
  line box, the tile gap and the picture ratio stay in step with the presenter.
- **Holding `R` until the Visual Index and the picture ratio resolve, or reserving the
  placeholder's height.** Not done: holding would paint 3 rows first and jump anyway, and
  reserving would keep a blank band on every video without a Visual Index. The one-row
  change after opening is accepted (§1.9, §9).
- **Four places read the window size.** The grid, the ruler band, the requested
  pictures and `windowStartFor` all take the same `R × c`; the skeleton alone keeps `3c`.
- **Rows during a phone-sheet drag.** The sheet moves by transform while dragged, so its
  scroller resizes when a snap settles; rows follow then, not frame by frame.
- **User guide.** No page: this is a layout change.
