# The Scenes section takes the width it is given

SPEC-ID: SPEC-ADDON-093

Approval:

## Summary

The Scenes section (SPEC-ADDON-089 and 090, `docs/specs/scene-timeline.md`) is capped at `24rem` and always draws three columns. The cap was there to stop three columns from growing huge on a wide host, such as the collection surface.

The cap also applies where the host is wider than the inspector, and there it leaves a blank band beside the section. On a real device the reader found this in the Bottom Sheet, which takes the full screen width below 768px: at 720px the right 300px are empty.

This change removes the cap. The section fills its host. The number of columns comes from the section's own width, so tiles never shrink below their size in the 384px inspector, and a wider host shows more frames in the same three rows. The ruler and the scene card already span the section, so they follow it.

Agreed design: <https://claude.ai/artifact/4iG5xfmYq3ZXUTuLXFRaFP>. The boards are copied to `docs/process/reviews/feature-scene-timeline-width/design/`:

- `Wide.dc.html` is the new board: a 720px host and five columns.
- `Main.dc.html` remains the board for the 384px inspector, with three columns.

Everything else in `docs/specs/scene-timeline.md` (its revision I11 included) stays as approved.

## Required items

### 1. Normal flow

1. The section is expanded, as SPEC-ADDON-089 describes.
2. The section reads its own content width `W` from the drawn ruler. The ruler spans the section, and its width is already measured with a `ResizeObserver` for the time labels.
3. The column count is `c = max(3, floor((W + 0.5rem) / 7.5rem))`.
   - 7rem is the narrowest a tile may be, its width at three columns in the 384px inspector.
   - 0.5rem is the column gap.
   - rem is read from the root element's computed font size when `c` is worked out, so scaled text keeps the same layout. A value that is not a positive number counts as 16px.
   - `c` is worked out again whenever `W` is measured again.
4. The grid shows three rows of `c` tiles. That is the frames from `s` to `s + 3c − 1`, where `s = clamp(c × floor(i / c) − c, 0, max(0, n − 3c))`.
   - `i` is the frame holding the point being looked at, as in SPEC-ADDON-089.
   - `n` is the number of frames.
   - With fewer than `3c` frames, the grid shows them all.
5. During playback the grid steps one row of `c` frames at a time. The playing frame stays in the middle row, except in the first and the last row.
6. When `W` changes (rotation, opening a sidebar, resizing the window):
   - `c` and the window are derived again from the same point being looked at.
   - The grid snaps to the new layout with no travel animation, as DESIGN.md §7 says for a listing whose own width changed.
   - A window that changes this way is like any other new window. Its pictures are requested once it has stayed 150 ms, and until then its new tiles are the empty `bg-bg-elevated` box with their time, as SPEC-ADDON-089 §9 already draws a tile whose picture has not been requested. A tile kept from the previous window keeps its picture.

### 2. Failure cases

- **The width is not known yet.** Before the ruler has been measured (`W` is 0, for example on the first paint), the grid uses three columns.
- **The root font size cannot be read.** A value that is not a positive number counts as 16px (step 3).
- **A width too narrow for three columns.** Three columns are kept. Tiles narrower than 7rem are allowed rather than dropping below three columns, which SPEC-ADDON-089 never did.

### 3. States

Unchanged from SPEC-ADDON-089. The loading skeleton draws `3c` placeholder blocks in `c` columns.

### 4. Data read and written

None new.

- The requests are those of SPEC-ADDON-089.
- The number of pictures requested per window becomes `3c` instead of 9.

### 5. External services

None.

### 6. Authorization

Unchanged.

### 7. Effect on existing features

- **Only the Scenes section changes.** Every row of the section spans its full width, the collapsed header included. On a host wider than 24rem, the header's chevron, the action row's buttons and the stale line therefore reach the host's right edge rather than 384px, as the `Wide.dc.html` board draws them.
- **The collection surface.** Here `file-detail-sections` is drawn in the canvas. The section now fills that width too, for example seven columns at 900px.
- **The core real-browser case.** `frontend/e2e-components/scenes-section*` asserts a 24rem maximum width. That assertion is replaced by the column count and the full width.

### 8. Error behavior

None. Nothing new can fail.

### 9. User-visible behavior

- The section is as wide as its host's content box. There is no `max-width`.
- The number of columns depends on the width:

  | `W`, the section's own width | Where it occurs | Columns | Frames in the window |
  |---|---|---|---|
  | 352px | the 384px inspector (16px padding each side) | 3 | 9 |
  | 358px | a 390px Bottom Sheet | 3 | 9 |
  | 688px | a 720px Bottom Sheet | 5 | 15 |
  | 900px | a 900px collection canvas with no padding | 7 | 21 |

- The tile, the outline, the scene dot and the time label are as in SPEC-ADDON-089. The gap is 8px between columns and 12px between rows.
- Every row spans the full width: the header (its chevron at the right edge), the ruler and its labels, the grid, the scene card, the stale line and the action row (its buttons at the right edge).
- The window band on the ruler runs from the first drawn tile's start to the start of the frame after the last drawn tile, or to `L` when there is none.
- No user-guide change: this is layout (CLAUDE.md).

### 10. Non-functional

- **Requests.** Only the `3c` pictures of the current window are requested, once the window has stayed 150 ms, as before. A playback step changes one row, so it adds `c` new pictures. A frame the cache already holds costs no ffmpeg run.
- **Measurement.** The `frontend/e2e-components` Scenes case measures, in Chromium:
  - **Widths.** The fixture's host has no padding, so its width is `W`. The hosts are 384px with a mouse (3 columns), 390px with a coarse pointer (3), 688px with a coarse pointer (5) and 900px with a mouse (7). The 351px time-label case stays and keeps 3.
  - **Window moves.** Each width's scripted window move crosses a row boundary at that width's `c`, and is checked by the first drawn tile's time.
  - **Fill.** The section's width equals its host's content width.
  - **Columns.** The column count, from the tiles' distinct left edges, matches the table in §9.
  - **Tile width.** No tile is narrower than 7rem when `c` > 3.
  - **Scrolling.** No element in the section scrolls on either axis.
  - **Height.** The section's height is unchanged across a window move and a browse point move at each width.

## Touch points

**`addons/intelligence`**

- `frontend/ScenesSection/scenesModel.ts`: the window function takes the column count.
- `frontend/ScenesSection/ScenesSectionContainer.tsx`: the window and the pictures requested.
- `frontend/ScenesSection/ScenesSectionPresenter.tsx`:
  - the grid's column count;
  - the removal of `max-w-96`;
  - the loading skeleton;
  - the window band.
- `frontend/ScenesSection/hooks/useRulerWidth.ts`: read only; its width becomes the input for `c`.
- `frontend/ScenesSection/__tests__/`.

**Core**

- `frontend/e2e-components/scenes-section.cases.ts`.
- `frontend/e2e-components/scenes-section-desktop.spec.ts` and `scenes-section.spec.ts`.
- `frontend/e2e-components/fixtures/scenesSection.tsx` and `fixtures/app.tsx`: a 688px host arrangement.
- `frontend/e2e-components/spec-viewport.spec.ts`, if a new spec file is added.
- The `addons/intelligence` gitlink.

**Rules passed through**

- `DESIGN.md` §7 ("A listing whose own width changed snaps") and §8.5 ("Measure against the container, not the viewport": media is in the subtree, so the width is measured in script).
- `.claude/rules/frontend-conventions.md`: the Presenter stays free of state and effects, and the Container passes `c`.

**Design**

- `docs/process/reviews/feature-scene-timeline-width/design/`.

No protected path is edited.

## Invariants

The window formula, the requests, the fill, the scrolling and the height are stated once, in the Revises lines for SPEC-ADDON-089 I1, I5 and I8. The lines below are only what this spec adds. Tests of the revised properties cite SPEC-ADDON-089, and tests of these lines cite SPEC-ADDON-093.

I1. The grid has `c = max(3, floor((W + 0.5rem) / 7.5rem))` columns, where `W` is the section's measured width and rem is the root font size (16px when it is not a positive number). With `W` unknown, it has 3.
I2. When `c` is greater than 3, no tile is narrower than 7rem.
I3. Once a window has stayed 150 ms, the picture of every drawn tile is requested. The pictures requested are exactly those of the drawn tiles.
I4. The ruler's window band runs from the first drawn tile's start to the start of the frame after the last drawn tile, or to `L`.
I5. A change of `W` that changes `c` redraws the grid in the new column count around the same point being looked at, without a travel animation.
I6. The loading skeleton draws `3c` blocks in `c` columns.
I7. The header, the ruler, the grid, the scene card and the action row each span the section's full width.

## Revises

SPEC-ADDON-089 I1. The ruler draws exactly one tick per `clip-timestamps` row, at `min(start, L) / L` of its width, with `L` as §2 of docs/specs/scene-timeline.md defines it. The grid shows the frames from `s = clamp(c × floor(i / c) − c, 0, max(0, n − 3c))` to `s + 3c − 1`, or every frame when there are fewer than `3c`. `c` is the column count of docs/specs/scene-timeline-width.md I1, and `i` is the last frame whose start is at or before the point being looked at, or frame 0 before the first.
SPEC-ADDON-089 I5. The Info tab draws at most one Scenes section for a video, and only in the states §3 does not hide, and nothing for any other file type. The intelligence manifest has exactly one `scenes` entry and no `visual-index` or `clip-frames` entry. No element inside the section scrolls on either axis, with either pointer. While the section is expanded at a fixed width, its height does not change when the window moves or the browse point changes. The section is as wide as its host's content box.
SPEC-ADDON-089 I8. Only the pictures of the current window (`3c` of them) are requested. While the browse point moves, a window's pictures are requested only after that window has stayed 150 ms.

## Checked, no action

- **A maximum column count.** A very wide host gets many columns, for example 11 at 1400px. The window then covers more time, which is what a wide host is for, and every picture is still the size it is in the inspector. The cost of more columns is more pictures per window: 33 at 1400px instead of 9. Each one is a single ffmpeg run on its first request, and then cached. A playback step adds one row of `c` pictures. No cap is set until a host shows that one is needed (the human's decision, recorded at approval).
- **Recomputing `c` when only the font size changes.** `c` is worked out again on the next width measurement. A text-size change that leaves the section's pixel width unchanged keeps the old column count until then.
- **Growing the tiles instead of adding columns.** The reader rejected this. Three columns at 720px make a 220px tile and a section nearly 900px tall.
- **A container query instead of script measurement.** DESIGN.md §8.5 forbids a containment context around media because of iOS Safari, and the width is already measured for the time labels.
- **Changing the number of rows with the height.** Three rows stay. The reader did not raise height, and a fixed row count keeps I5.
