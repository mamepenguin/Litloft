# Excel viewer: cell text at the size the workbook sets

SPEC-ID: SPEC-CORE-167

Approval: sha256:4ed8d920a10cbebae7d7f1bc7a16c143bfc77f9969be085c5d10855033059c3b Yuichi Senga 2026-11-21

## Summary

The Excel viewer (SPEC-CORE-155, `docs/specs/office-viewer.md`) draws cell text of 9 pt
and below, and of some large sizes, far smaller than its cells: the 8 pt text of a
requirements template comes out at 6 px. The owner noticed it on production files.

The cause is three steps in `@js-preview/excel` 1.7.14, read in its bundle:

1. When it loads a cell style it divides the workbook's font size, in points, by
   1.333333 and rounds: `style.font.size = Math.round(size / 1.333333)`.
2. When x-data-spreadsheet draws a cell it looks the stored size up in a points-to-pixels
   table by exact match (7.5 → 10, 8 → 11, 9 → 12, 10 → 13, 10.5 → 14, 11 → 15, 12 → 16,
   14 → 18.7, 15 → 20, 16 → 21.3, 18 → 24, 22 → 29.3, 24 → 32, 26 → 34.7, 36 → 48,
   42 → 56). A size that is not in the table is used unchanged.
3. It sets the canvas font to `parseInt(size × devicePixelRatio)` device pixels, so a
   fractional size is truncated (at devicePixelRatio 1, 10.67 is drawn at 10 px).

Row heights and column widths come out at about 3/4 of Excel's. A stored size `s` in the
table is drawn at about `s × 4/3` px, which matches the cells; a size outside it is drawn
at `s` px, a quarter smaller.

This change replaces every stored size `s` with `Math.round(s × 4/3) + 0.01`, once, after
the library has converted the workbook and before it hands the sheets to the grid. `Math.round` gives the whole pixel size the table
would have given, so step 3 has nothing to truncate. The `+ 0.01` keeps the value off
the table, whose keys are whole numbers and halves (without it, stored 6 becomes 8,
which the table would turn into 11 px); 0.01 × devicePixelRatio stays under one device
pixel, so the truncation removes it again. What each workbook size is drawn at, in CSS
px at devicePixelRatio 1 and 2:

| Workbook | Stored | Drawn today | After this change |
|---|---|---|---|
| 6 pt, 7 pt | 5 | 5 px (not in table) | 7 px |
| 8 pt | 6 | 6 px | 8 px |
| 9 pt | 7 | 7 px | 9 px |
| 10 pt, 11 pt | 8 | 11 px (table) | 11 px |
| 12 pt | 9 | 12 px | 12 px |
| 13 pt | 10 | 13 px | 13 px |
| 14 pt, 15 pt | 11 | 15 px | 15 px |
| 16 pt | 12 | 16 px | 16 px |
| 18 pt | 14 | 18 px, 18.5 px at ratio 2 (table 18.7) | 19 px |
| 28 pt | 21 | 21 px (not in table) | 28 px |
| 36 pt | 27 | 27 px | 36 px |

Sizes the table already maps stay as they are drawn today, within 1 px; sizes it
misses are drawn on the same scale as the rest of the sheet.

This is the one place Litloft corrects the library's drawing, an exception to
SPEC-CORE-155's "what is shown is what the library draws".

Tried on copies of three production workbooks with an earlier version of this change
(`size × 1.333333`, no rounding): the requirements template's wrapped descriptions
still broke onto the lines the row heights were made for, and the time sheet's dates fit
their cells; but step 3 truncated every corrected size to the whole pixel below, so 8 pt
was drawn at 7 px and 12 pt at 11 px. Multiplying by 1.78 instead (Excel at 100 %)
clipped text at the row edges, because rows stay at 3/4.

## Required items

### 1. Normal flow

1. The Excel adapter (`frontend/src/components/office/excelAdapter.ts`) passes a
   `transformData` function in the options of `previewExcel.init`, next to the existing
   `showContextmenu: false`. `transformData` is the library's own option: inside
   `preview`, after converting the workbook, it calls the function with the list of
   sheets (one `{ name, styles, rows, cols, merges, media }` per sheet) and gives what
   the function returns to the grid (`xs.loadData`).
2. The function walks that list and each sheet's `styles` list, and replaces
   `font.size` with `Math.round(size × 4/3) + 0.01` for each distinct `font` object whose
   `size` is a number. A `font` object reached from more than one style or sheet is
   corrected once. It returns the same list it was given.
3. Everything after `preview` is as on `develop`: the adapter marks the drawing drawn and
   calls the grid sheet's `reload` once (SPEC-CORE-155's sizing to the frame), and that
   call stays. The grid has the corrected sizes from its
   first render.
4. Switching to another sheet tab shows that sheet with its sizes already corrected: the
   grid keeps the `styles` lists it was given by reference, and the tab switch hands it
   an already-loaded sheet (`sheet.resetData(datas[i])`) without converting styles again.

The library pushes one style, with its own `font` object, per loaded cell, so a large
workbook has one font per cell: the requirements template in *Touch points* has 286,310
cells. A walk over 286,000 fonts took 67 ms in Node on the development Mac; opening that
workbook takes several seconds today. No limit is added.

### 2. Failure cases

| Where | What happens |
|---|---|
| The library passes something that is not an array | The function returns it unchanged; the workbook is shown as the library draws it |
| A sheet is not an object or has no `styles` array, a style is not an object, it has no `font`, `font` is not an object, or `font.size` is not a number | That entry is skipped; the rest are corrected |
| The walk throws for any other reason | The function catches it and returns the list it was given: the sizes corrected so far stay, the rest stay as loaded, and the workbook is shown. Nothing is logged. A throw out of `transformData` would make `preview` reject and show the fallback, so none may escape |
| `preview` rejects for its own reasons | Today's fallback (SPEC-CORE-155 I3) |
| The library never calls `transformData` (a different build) | Nothing is corrected; the workbook is shown as the library draws it |

### 3. States

The correction runs only inside `transformData`, which the library calls once per
`preview`, and the adapter calls `preview` once per drawing. Nothing else corrects a
size, so no redraw of an existing drawing (a `reload` from the frame's `ResizeObserver`,
the library's own window `resize` handler, scrolling, selecting a cell, a sheet switch)
corrects it again. A new identity (SPEC-CORE-155 §3) is a new drawing, with its own
library instance and its own single correction. A drawing disposed while `preview` is
pending is handled as SPEC-CORE-155 already says; the correction only touches that
drawing's own data.

### 4. Data read and written

Only the library's in-memory style objects of the drawing on screen. Nothing on disk,
on the server or in storage; the file is not changed.

### 5. External services

None.

### 6. Authorization

Unchanged.

### 7. Effect on existing features

- Every Excel drawing: cell text with an explicit size is drawn as the table in
  *Summary* says. Cells without an explicit size keep the library's default (stored 10,
  drawn 13 px through the table), because the default lives outside the `styles` list.
- Row heights, column widths, borders, fills and pictures are not touched.
- Word files, the fallback panel, the arrow keys, focus handling and the dismiss-scrim
  behaviour of SPEC-CORE-155 are unchanged.

### 8. Error behavior

None new; see §2. Nothing is logged.

### 9. User-visible behavior

- Small text grows: 6 pt and 7 pt from 5 to 7 px, 8 pt from 6 to 8 px, 9 pt from 7 to
  9 px. Large sizes the library's table misses grow the same way (28 pt from 21 to
  28 px). 10 pt to 16 pt text is drawn as today.
- Wrapped text keeps the line breaks the workbook was laid out with.
- The sheet as a whole still looks smaller than Excel at 100 %, about 75 %.
- `docs/user-guide/viewers-and-players.md` needs no change: it does not describe sizes.

### 10. Non-functional

One font per loaded cell (§1): 286,310 on the largest R-5 workbook, a walk of about
70 ms against a load of several seconds. No limit is added. No new dependency.

## Touch points

- `frontend/src/components/office/excelAdapter.ts`: the `transformData` option and its
  function. The library's `Options` type does not declare `transformData`, so the adapter
  types the options it passes itself, in this file; no declaration file is added. The branch's earlier `multiplyFontSizes`, written for a previous version of
  this spec, and its comment are discarded.
- `docs/specs/INDEX.md`: the SPEC-CORE-167 row's state.
- `frontend/src/components/__tests__/FilePreview.excelFontSize.test.tsx`, rewritten from
  this spec (its current content tests the previous version): the mocked library's
  `init` records the options, and its `preview` calls `transformData` with sheets
  carrying styles with and without `font.size` and a `font` object shared by two styles,
  then hands the result to a mocked grid.
- The R-5 copies of three production workbooks in the local 「動画」 drive's `Inbox`
  (test data, not committed): `EnglishCore工数実績表.xlsx` (4 sheets, 10 pt to 15 pt),
  `要件定義署のサンプル.xlsx` (11 sheets, every cell 8 pt, wrapped text),
  `19_書き込みエンコード画面_r2.xlsx` (5 sheets, explicit sizes from 6 pt to 14 pt).
- R-5 reads the drawn size by wrapping `CanvasRenderingContext2D.prototype.fillText` in
  the page and recording `ctx.font` for each drawn string. `ctx.font` is in device
  pixels; the CSS size is that value divided by `window.devicePixelRatio`. R-5 measures
  in a 1280 px window at the ratio Chrome has at 100 % zoom, then again at 200 % browser
  zoom (twice the ratio; only font sizes are read there, so the narrower CSS width does
  not matter), and records both ratios.
- No other file. No protected path.

## Invariants

I1. When an Excel file is shown and the correction does not throw, every distinct `font` object reachable from any sheet's `styles` in the list the library passes to `transformData`, whose `size` was a number `n` when it was passed, has `size` equal to `Math.round(n × 4/3) + 0.01` in the list the grid receives.
I2. Each size is corrected at most once per drawing: a `reload` of the grid's sheet, the frame's `ResizeObserver` firing, a window `resize` and a sheet switch leave each `size` as I1 left it.
I3. Row heights, column widths, every style property other than `font.size`, and the `size` of any font that was not a number, are the values the library loaded.
I4. The grid's first render after `preview` uses the corrected sizes.
I5. A list that is not an array, styles of unexpected shapes, or a correction that throws, still show the workbook, with no fallback panel, no `dispose`, and no `console` output of any kind from the correction.
I6. In the real library, at a whole-number devicePixelRatio `r`, cell text of 8 pt is drawn with a canvas font of `8 × r` device pixels (8 CSS px), 9 pt with `9 × r`, and 10 pt, 12 pt and 14 pt with `11 × r`, `12 × r` and `15 × r`, the sizes they are drawn with without the correction.

## Checked, no action

- **Excel at 100 %.** Making the sheet as large as Excel would also mean scaling row
  heights and column widths, a zoom of the whole drawing. That is a separate feature (a
  zoom control); this change only removes the uneven conversion.
- **The library's rounding.** It rounds `n / 1.333333` to a whole number, so 6 pt and
  7 pt both become 7 px, and 10 pt and 11 pt both 11 px. Not compensated: the original
  point size is not kept by the library.
- **Other devicePixelRatio values.** At 1, 2 and 3 the drawn size is the whole pixel
  value. At a fractional ratio such as 1.25 the library's truncation still drops part
  of a pixel, as it does today for every size.
- **18 pt and other fractional table values** (18.7, 21.3, 29.3, 34.7) are drawn at the
  rounded whole pixel, up to 1 px from today. Accepted for one scale.
- **Text that is small in the workbook itself** (6 pt) stays small, as in Excel at 75 %.
- **Reading `xs.datas` after `preview` instead of `transformData`.** It reaches the same
  lists, but through a private field, and the grid's first render would use the
  uncorrected sizes until a second `reload`.
- **The shared-font dedup.** This library build gives each style its own `font`, so the
  dedup never triggers today; it stays so a font is never enlarged twice if a build
  shares them.
- **A future library version that changes any of these steps** would change the result. The
  version is pinned exactly (SPEC-CORE-155); an upgrade is re-checked in R-5.
- **Tests.** One test file with the library mocked covers I1 to I5. I6 and the real
  library's drawing are R-5's, measured as *Touch points* says, on the three workbooks
  there: on
  `要件定義署のサンプル` the 8 pt text is drawn at 8 px and its wrapped
  lines fit inside their rows on the first sheet and on one other sheet reached by its
  tab; on `EnglishCore工数実績表` the dates fit their cells on two sheets and stay the same
  size after the inspector is closed and reopened (a frame resize, which calls
  `reload`); on
  `19_書き込みエンコード画面_r2` the 10 pt to 14 pt text is drawn at the size it is
  drawn today (11, 12 and 15 px) and the 9 pt text at 9 px.
