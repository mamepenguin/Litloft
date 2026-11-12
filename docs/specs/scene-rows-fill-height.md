# Scenes: rows follow the height the host gives

SPEC-ID: SPEC-ADDON-104

Approval:

## Summary

The intelligence Scenes section draws its frame grid as a window of 3 rows × `c`
columns, where `c` follows the section's width (SPEC-ADDON-093). Since the player
workbench (SPEC-CORE-085, SPEC-ADDON-099) the section sits in a panel under the player,
or in an inspector or sheet tab, and those boxes can be taller than 3 rows need, so the
section leaves empty space under itself. This change takes the row count `R` from the
height available to the section, the way the column count already comes from its width:
as many rows as fit, never fewer than 3. The window becomes `R × c` frames and moves as
it does today. It is for the viewer working with scenes beside the player on a tall
screen; on a screen where 3 rows do not fit (a 1440×900 laptop) nothing changes.

Agreed design: https://claude.ai/artifact/MAr572eiMVvXALsohEKZ3U, saved in
`docs/process/reviews/feature-scene-rows-fill-height/design/` (`Main.dc.html` with its
`vh`, `panels` and `cardpos` tweaks, `Two.dc.html`, `Short.dc.html`, `CardPos.dc.html`,
`Tablet.dc.html`, and the shared `Panel.dc.html`). Decisions recorded in hako
`VoRnnkS7IB7EiHyNESkab`.

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
- D6. The tiles, ruler, card and action row look as they do today. Only the number of
  rows changes.

## Terms

- **Scroller**: the section's nearest ancestor whose computed `overflow-y` is `auto` or
  `scroll`, other than the document's root scroller. Today that is the workbench panel
  body (`.media-detail-workbench-body`), the selected inspector tab panel in its `panel`
  form, or the phone sheet's drawer.
- **Available height `H`**: the distance from the top of the section's own box to the
  bottom of the scroller's content box (the scroller's visible height minus its bottom
  padding), measured with the scroller scrolled to the top. In the phone sheet it is
  measured at the drawer's current height. When there is no scroller, or it has not been
  measured yet, `H` is unknown.
- **`c`**: the column count of SPEC-ADDON-093 I1, unchanged.
- **`R`**: the number of grid rows.

## Required items

### 1. Normal flow

1. The section is shown (`active`, or with no `active` prop) and its body is drawn in the
   expanded view.
2. It measures `c` from its width, as today, and `H` from its scroller.
3. `R` is the largest whole number of at least 3 for which the section, drawn with `R`
   grid rows and everything else it draws in its current state (its header when drawn,
   the ruler with its labels, the grid, the Visual Index placeholder or the scene card,
   the stale note, the action row, and the gaps between them), is no taller than `H`.
   When `H` is unknown, or 3 rows do not fit, `R` is 3.
4. The grid shows the window of `R × c` frames starting at
   `s = clamp(c × floor(i / c) − c, 0, max(0, n − R·c))`, with `i` and `n` as
   SPEC-ADDON-089 I1 defines them. The frame being looked at stays in the second row
   until the window reaches the end, and the window moves one row (`c` frames) at a time,
   as today.
5. The ruler's band covers the drawn tiles (SPEC-ADDON-093 I4, unchanged in wording).
6. The pictures of the drawn tiles are requested once the window has stayed 150 ms
   (SPEC-ADDON-093 I3, unchanged in wording).
7. When `H` changes (window resize, the second panel turned on or off, the workbench
   switching between side by side and stacked, the phone sheet moved, the inspector
   resized) and that changes `R`, the grid is redrawn with the new `R` around the same
   point being looked at, without a travel animation.

### 2. Failure cases

- **No scroller, or not measured yet** (first render, a host that does not bound the
  height, a test environment without layout): `R` is 3, which is today's grid.
- **`ResizeObserver` missing**: `H` is measured once on mount and not again; `R` keeps
  that value until the section remounts.
- **The picture ratio is not known yet**: the tile height is computed from the 16:9
  default the tiles already use, and recomputed once the first picture reports its
  ratio. `R` may change at that moment.
- **A picture request fails**: unchanged (SPEC-ADDON-089 I7 / SPEC-ADDON-080 I6).

### 3. States

The section's states are unchanged (collapsed, loading, expanded; the Visual Index rows
of SPEC-ADDON-089 §3). `R` is a derived value, not a state:

- In the collapsed view no grid is drawn and `R` is not used.
- In the loading view the skeleton keeps `3c` blocks (SPEC-ADDON-093 I6, unchanged).
- In the expanded view `R` is recomputed whenever `H`, `c`, the picture ratio or the set
  of elements drawn around the grid changes. A Visual Index state change that adds or
  removes the card, the placeholder, the stale note or the action row can therefore
  change `R`.

### 4. Data read and written

None. No request, table, file or storage changes. The number of picture requests per
window grows from `3c` to `R × c`.

### 5. External services

None. Pictures come from the intelligence frame route and the `.loft` scene-tile route
as today; only how many are requested per window changes (§10).

### 6. Authorization

None. The section's requests and their drive header are unchanged.

### 7. Effect on existing features

- The Scenes section is the only consumer. The workbench, the inspector and the phone
  sheet are not changed: they already bound their bodies' height and pass
  `fillHeight: true`.
- The keyboard on the ruler, seeking, browse points, the Visual Index states and the
  `.loft` behaviour are unchanged.
- Tests that read the window size as `3c`, or count 9 tiles in a jsdom environment, keep
  passing because jsdom lays nothing out, so `H` is unknown there and `R` is 3.

### 8. Error behavior

Nothing new is shown or logged. Every failure above falls back to 3 rows, today's grid.

### 9. User-visible behavior

- In a panel or tab taller than 3 rows need, the grid has more rows: as many whole rows
  as fit with the ruler, the card and the action row. The leftover (less than one row)
  stays at the bottom, below the action row.
- The ruler's band is wider by the added rows.
- Resizing the window, turning a second panel on or off, or raising the phone sheet
  changes the number of rows at once, without animation.
- Where 3 rows do not fit, nothing changes from today: 3 rows and the panel body scrolls.

### 10. Non-functional

- Picture requests per window are `R × c`. At a 1600px-tall window with the inspector
  closed that is about 17 columns × 6 rows = 102. Native frames are cut by ffmpeg on the
  first request and served from the cache after; the browser's per-origin connection
  limit spreads the first load out. No extra cap is added.
- Measuring `H` must not loop: the measurement reads the scroller and the section's top,
  never the section's own height, so drawing more rows cannot feed back into `R`.
- No layout shift while playing or browsing: `R` depends on sizes, not on the point being
  looked at.

## Touch points

In the intelligence addon repository (`addons/intelligence`, a submodule):

- `frontend/ScenesSection/ScenesSectionContainer.tsx`: measures `H`, computes `R`,
  passes `R` to the presenter and uses `R × c` for the window and the requested
  pictures.
- `frontend/ScenesSection/ScenesSectionPresenter.tsx`: the grid and the ruler band use
  `R × c` instead of `3 × columns`; the section gives the measurement the heights of the
  parts around the grid.
- `frontend/ScenesSection/scenesModel.ts`: `windowStartFor` takes the row count; a pure
  function computes `R` from `H`, the other parts' height, the row height and the row gap.
- `frontend/ScenesSection/hooks/`: a new hook that finds the scroller and measures `H`
  with `ResizeObserver`.
- `frontend/ScenesSection/__tests__/`: unit tests for the `R` function and the window.

In the core repository:

- `frontend/e2e-components/scenes-section*.spec.ts`, `scenes-section.cases.ts` and
  `fixtures/scenesSection.tsx`, `fixtures/scenesSectionData.ts`: a real-browser
  measurement of the section in a height-bounded box (several heights and widths) and
  in an unbounded one.
- The submodule pointer bump for `addons/intelligence`.
- `docs/specs/scene-rows-fill-height.md`, `docs/specs/INDEX.md`,
  `docs/process/reviews/feature-scene-rows-fill-height/`.
- No protected path is edited. No user-guide page changes: the change is a layout
  change, which `CLAUDE.md` keeps out of `docs/user-guide/`.

Rules passed through: `.claude/rules/frontend-conventions.md` (Container/Presenter,
`DESIGN.md`), `.claude/rules/design-decisions.md` (addons: no core-to-addon code).

## Invariants

The window formula, the requested pictures and the height rule are restated in the
Revises lines for SPEC-ADDON-089 I1, I5 and I8. Tests of those cite SPEC-ADDON-089; tests
of the lines below cite SPEC-ADDON-104.

I1. With `H` known, the grid has the largest number of rows `R ≥ 3` for which the
section's own box, drawn with `R` rows, ends no lower than `H` below its top. When 3
rows do not fit, or `H` is unknown, `R` is 3.
I2. When `R` is greater than 3, the space between the bottom of the section's box and the
bottom of the scroller's content box is less than one grid row plus one row gap, and the
scroller does not scroll.
I3. From top to bottom the section draws its header (when drawn), the ruler with its
labels, the grid, then the Visual Index placeholder or the scene card, the stale note and
the action row, in that order, with the gaps they have today. Nothing is placed between
the grid and the card.
I4. While the size of the scroller and of the section stays the same, moving the
playback position or the browse point never changes `R`.
I5. A change of `H` that changes `R` redraws the grid with the new `R` around the same
point being looked at, without a travel animation.
I6. Drawing more rows never changes `H`: `R` computed after the grid has been redrawn
with `R` rows is again `R`.

## Revises

SPEC-ADDON-089 I1. The ruler draws exactly one tick per `clip-timestamps` row, at `min(start, L) / L` of its width, with `L` as §2 of docs/specs/scene-timeline.md defines it. The grid shows the frames from `s = clamp(c × floor(i / c) − c, 0, max(0, n − R·c))` to `s + R·c − 1`, or every frame when there are fewer than `R·c`. `c` is the column count of docs/specs/scene-timeline-width.md I1, `R` the row count of docs/specs/scene-rows-fill-height.md I1, and `i` is the last frame whose start is at or before the point being looked at, or frame 0 before the first.
SPEC-ADDON-089 I5. The file page draws at most one Scenes panel for a video, and only in the states §3 does not hide, and nothing for any other file type. The intelligence manifest has exactly one `scenes` entry, in `player-side`, and no `visual-index` or `clip-frames` entry. No element inside the section scrolls on either axis, with either pointer; the panel body that holds it may. While the section is shown at a fixed width and a fixed available height, its height does not change when the window moves or the browse point changes. The section is as wide as its host's content box.
SPEC-ADDON-089 I8. Only the pictures of the current window (`R·c` of them) are requested. While the browse point moves, a window's pictures are requested only after that window has stayed 150 ms.

## Checked, no action

- **Shrinking below 3 rows to avoid scrolling.** Rejected by the human: the previous,
  current and next rows are the design's point. A 1440×900 window keeps today's scroll.
- **Pinning the card to the bottom, or putting it above the grid.** Rejected by the human
  (design `CardPos.dc.html` B and C).
- **Filling only under the player and keeping 3 rows in tabs.** Rejected by the human: it
  needs a new core prop saying where an entry is placed, and the tab is as bounded as the
  panel.
- **A cap on `R`.** Not added: `R` is bounded by the screen height, and the requests are
  bounded by `R × c` with cached pictures. Revisit if a portrait 4K display makes the
  first load slow.
- **The loading skeleton at `R × c`.** Kept at `3c` (SPEC-ADDON-093 I6): the skeleton
  shows for a moment, and the loaded view has a card and actions the skeleton does not,
  so matching `R` there would change the row count anyway when it loads.
- **Using the `fillHeight` prop to switch the behaviour.** Every host passes `true`
  (workbench, tabs and `file-detail-sections`), so it cannot tell a bounded box from an
  unbounded one. The scroller is measured instead.
- **Making the scene card's height part of a fixed constant.** The heights of the parts
  around the grid are measured, not hard-coded, so a long label or a Visual Index note
  cannot push the section past `H`.
- **Rows recomputed while a phone sheet is dragged.** Accepted: the rows follow the
  drawer's height as it moves, without animation (I5).
- **User guide.** No page: this is a layout change.
