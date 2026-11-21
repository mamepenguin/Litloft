# Excel viewer: sheets at Excel's 100 % size

SPEC-ID: SPEC-CORE-168

Approval:

## Summary

The Excel viewer (SPEC-CORE-155, `docs/specs/office-viewer.md`) draws a workbook smaller
than Excel at 100 %, and not by one factor. The owner wants it at Excel's size. This spec
replaces SPEC-CORE-167 (`docs/specs/excel-font-size.md`), which corrected only the text,
to 3/4 of Excel's size, so that it matched the rows.

What `@js-preview/excel` 1.7.14 does today, read in its bundle (the function that turns
the ExcelJS workbook into the grid's sheets, and the one that draws pictures):

| Part | Workbook unit | Drawn as | Excel at 100 % |
|---|---|---|---|
| Row with a height | points `h` | `h` px | `h × 4/3` px |
| Row without one | (sheet default, points) | 24 px | default `× 4/3` px (15 pt → 20 px) |
| Column with a width | characters `w` | `6 × w` px | about `7 × w` px |
| Column without one | (sheet default, characters) | 80 px | default `× 7` px (no default: 64 px) |
| Text | points `p` | `Math.round(p / 1.333333)`, then a points-to-pixels table, truncated (SPEC-CORE-167) | `p × 4/3` px |
| Picture offset inside a cell | EMU | `EMU / 12700` px (points as pixels) | `EMU / 9525` px |
| Picture size (one-cell anchor) | ExcelJS `ext`, px | `ext / 1.333333` px | `ext` px |

"About `7 × w`": Excel's column width in pixels is the width in characters times the
maximum digit width of the workbook's default font, 7 px for Calibri 11 and Arial 10. The
library does not expose the default font, so this change uses 7 for every workbook.

The library offers two options that `init` accepts and `preview` calls, both public:

- `beforeTransformData(workbook)`, called with the ExcelJS workbook before the library
  converts it; what it returns is converted.
- `transformData(sheets)`, called with the converted sheets before the grid receives
  them (SPEC-CORE-167 already uses it).

The change scales the workbook in `beforeTransformData`, so the library's own conversion
and its picture placement both read the scaled values, and uses `transformData` only to
keep text sizes off the points-to-pixels table:

- every row's height becomes `(its height, or the sheet's default row height, or 15) ×
  4/3`, for rows 1 to `max(row count, 100)`;
- every column from 1 to the sheet's column count gets the width `px / 6`, where `px` is
  `Math.round(its width × 7)`, or for a column without a width `Math.round(sheet default
  width × 7)`, or 64 when the sheet has no default width; the library then draws it at
  `6 × px / 6 = px`;
- every distinct font's numeric `size` (points) is multiplied by 16/9, so the library's
  `Math.round(size / 1.333333)` gives `Math.round(points × 4/3)`, Excel's pixel size;
- every picture's anchor offsets (`nativeColOff`, `nativeRowOff`) and `ext` width and
  height are multiplied by 4/3;
- in `transformData`, every distinct font's numeric `size` gets `+ 0.01`, because the
  whole pixel sizes would otherwise land on the table's keys (8 → 11 px).

What each part is drawn at, in CSS px at devicePixelRatio 1 and 2:

| Workbook | Today (with SPEC-CORE-167) | After this change |
|---|---|---|
| Row 15 pt | 15 | 20 |
| Row without a height, sheet default 15 pt | 24 | 20 |
| Column 12.71 characters | 76 | 89 |
| Column without a width, sheet default 14.43 | 80 | 101 |
| Text 8 pt | 8 | 11 |
| Text 10 pt | 11 | 13 |
| Text 11 pt | 11 | 15 |
| Text 14 pt | 15 | 19 |

Tried on copies of three production workbooks and two others with pictures: wrapped
text broke where it did before, a sequence-diagram picture stayed on the cells it covers
in Excel, and text that the library clipped at a cell edge because its column was
narrower than Excel's ("セキュリティ要件" in a 14.44-character column) fitted.

This remains the one place Litloft corrects the library's drawing, an exception to
SPEC-CORE-155's "what is shown is what the library draws".

## Required items

### 1. Normal flow

1. The Excel adapter (`frontend/src/components/office/excelAdapter.ts`) passes, in the
   options of `previewExcel.init`, next to `showContextmenu: false`, a
   `beforeTransformData` function and a `transformData` function. The adapter types
   these options itself, in this file; the library's `Options` type declares neither.
2. Inside `preview` the library calls `beforeTransformData` with the ExcelJS workbook.
   The function goes through each worksheet (`workbook.eachSheet`) and, using only
   these members:
   - `worksheet.properties.defaultRowHeight` and `.defaultColWidth` (either may be
     missing);
   - `worksheet.rowCount`, `worksheet.getRow(i)` for `i` from 1 to `max(rowCount, 100)`
     (creating rows that do not exist), and each row's `height`;
   - each row's cells with `row.eachCell({ includeEmpty: true }, cb)`, and each cell's
     `style.font.size`;
   - `worksheet.columnCount`, `worksheet.getColumn(i)` for `i` from 1 to it, and each
     column's `width`;
   - `worksheet.getImages()`, and each image's `range.tl`, `range.br` (`nativeColOff`,
     `nativeRowOff`) and `range.ext` (`width`, `height`), any of which may be missing;

   sets every value as *Summary* lists. A font object reached from more than one cell,
   row or sheet is scaled once; a hidden row or column keeps its hidden flag (the
   library draws it at 0.1 px whatever its size). It returns the workbook it was given.
3. The library converts the workbook and calls `transformData` with the sheets. The
   function adds 0.01 to each distinct numeric `font.size` in each sheet's `styles`, and
   returns the list it was given.
4. Everything after `preview` is as on `develop`: the adapter marks the drawing drawn and
   calls the grid sheet's `reload` once.
5. A sheet reached by its tab is already scaled: every worksheet was scaled in step 2,
   and the tab switch hands the grid an already converted sheet.

### 2. Failure cases

| Where | What happens |
|---|---|
| `beforeTransformData` receives something without `eachSheet`, or a worksheet lacks one of the members in §1.2 | That workbook, worksheet or member is skipped; the rest are scaled |
| `beforeTransformData` throws for any other reason | It catches the error and returns the workbook it was given; what was scaled so far stays. No log |
| `transformData` receives something that is not an array, or a sheet or style of an unexpected shape | Returned or skipped unchanged |
| `transformData` throws | It catches the error and returns the list it was given. No log |
| Either function lets an error escape | Must not happen: the library would reject `preview` and the fallback would be shown for a sizing error |
| `preview` rejects for its own reasons | Today's fallback (SPEC-CORE-155 I3) |
| A library build that never calls one of the functions | That part is not scaled; the workbook is shown |

A partial scaling (one function ran, the other did not or stopped partway) can leave text
and cells at different scales. It is shown as it is; nothing marks it.

### 3. States

The scaling runs only inside the two functions, which the library calls once each per
`preview`; the adapter calls `preview` once per drawing. No redraw of a drawing (a
`reload` from the frame's `ResizeObserver`, a window `resize`, scrolling, selecting a
cell, a sheet switch) scales again. A new identity (SPEC-CORE-155 §3) is a new drawing
with its own library instance, workbook and single scaling.

### 4. Data read and written

Only the library's in-memory workbook and sheets of the drawing on screen. The file is
not changed.

### 5. External services

None.

### 6. Authorization

Unchanged.

### 7. Effect on existing features

- Every Excel drawing is larger: about 4/3 for rows, text and pictures, about 7/6 for
  columns with a width. Fewer cells fit in the frame; the grid scrolls as before.
- Rows and columns without a size of their own get the sheet's default instead of the
  library's 24 px and 80 px.
- Cells whose font has no numeric size keep the library's default (stored 10, drawn
  13 px through the table).
- SPEC-CORE-167's correction is replaced: its `transformData` multiplication is removed,
  and its test file is rewritten for this spec.
- Word files, the fallback panel, the arrow keys, focus handling and the dismiss-scrim
  behaviour of SPEC-CORE-155 are unchanged.

### 8. Error behavior

None new; see §2. Nothing is logged.

### 9. User-visible behavior

- An Excel sheet looks the size it does in Excel at 100 %: rows, columns, text and
  pictures.
- No new control. The viewer has no zoom.
- `docs/user-guide/viewers-and-players.md` needs no change: it does not describe sizes.

### 10. Non-functional

The walk visits each row, cell, column and picture once. The largest R-5 workbook has
286,310 cells; R-5 records its time to show against the same file before this change, and
the change may not add more than one second to it. No new dependency.

## Touch points

- `frontend/src/components/office/excelAdapter.ts`: the two options and their
  functions, replacing SPEC-CORE-167's `transformData` function.
- `frontend/src/components/__tests__/FilePreview.excelFontSize.test.tsx`: replaced by
  `frontend/src/components/__tests__/FilePreview.excelActualSize.test.tsx`, written from
  this spec, with the library mocked: `init` records the options; `preview` calls
  `beforeTransformData` with a fake ExcelJS workbook exposing only the members in §1.2,
  converts it the way *Summary* describes the library, calls `transformData`, and hands
  the result to a mocked grid.
- `docs/specs/INDEX.md`: the SPEC-CORE-168 row, and SPEC-CORE-167 set to `superseded`.
- R-5, at a 1280 px window, on the copies in the local 「動画」 drive's `Inbox` (test data,
  not committed): `EnglishCore工数実績表.xlsx`, `要件定義署のサンプル.xlsx`,
  `19_書き込みエンコード画面_r2.xlsx`, plus one workbook with a picture anchored to cells
  (a copy of a design document with a sequence-diagram picture, added there for R-5).
  Sizes are read by wrapping `CanvasRenderingContext2D.prototype.fillText` and recording
  `ctx.font` (device pixels; CSS px = value / `window.devicePixelRatio`), and row heights
  and column widths from the grid's sheet data (`xs.datas[i].rows` / `.cols`), at
  devicePixelRatio 1 and 2.
- No other file. No protected path.

## Invariants

I1. For every worksheet the library loads, every row from 1 to `max(row count, 100)` is drawn at `(its height, else the sheet's default row height, else 15) × 4/3` px, except hidden rows.
I2. For every worksheet, every column from 1 to its column count is drawn at `Math.round(its width × 7)` px, else `Math.round(the sheet's default width × 7)`, else 64, except hidden columns.
I3. Cell text whose font has a numeric size of `p` points is drawn at `Math.round(p × 4/3)` CSS px at a whole-number devicePixelRatio; every numeric `size` the grid receives is a whole number plus 0.01.
I4. A picture's anchor offsets and its one-cell-anchor size are 4/3 of the values the library loaded, so it stays on the same cells as the scaled grid.
I5. Each font object, row, column and picture is scaled exactly once per drawing; a `reload`, the frame's `ResizeObserver`, a window `resize` and a sheet switch scale nothing again.
I6. The grid's first render after `preview` already uses the scaled rows, columns and sizes.
I7. A workbook of unexpected shape, or a scaling that throws, is still shown, with no fallback panel, no `dispose`, and no `console` output of any kind from the scaling.
I8. Every style property other than `font.size`, cell text, merges and hidden flags are the values the library would have loaded.

## Checked, no action

- **The default font's digit width.** Excel uses the maximum digit width of the
  workbook's default font; 7 px is right for Calibri 11 and Arial 10, the defaults of
  most workbooks seen. A workbook whose default font is wider (游ゴシック 11 is about 8 px)
  gets columns about 1/8 narrower than Excel's. Reading the default font would mean
  parsing the workbook's styles ourselves.
- **A zoom control, or 75 %.** The owner chose a fixed 100 %. A control can be added
  later.
- **Text that overflows into empty neighbour cells.** The library clips every cell's
  text to the cell; Excel lets it run on. A separate change.
- **Cells without a numeric font size** draw at the library's default 13 px rather than
  the workbook's default font size. Rare: ExcelJS gives most cells their font.
- **Rows past 100 that do not exist** are drawn at the library's 24 px. The grid shows
  100 rows unless the sheet has more, and those exist.
- **A future library version that changes the conversion** would change the result. The
  version is pinned exactly (SPEC-CORE-155); an upgrade is re-checked in R-5.
- **Tests.** One test file with the library mocked covers I1 to I8 at the level of the
  values the functions set. The real library's drawing is R-5's: on `EnglishCore工数実績表`
  10 pt dates at 13 px and column A at 89 px; on `要件定義署のサンプル` wrapped lines inside
  their rows on the first sheet and one tab, and "セキュリティ要件" not clipped; on
  `19_書き込みエンコード画面_r2` 9 pt at 12 px and 14 pt at 19 px; on the picture workbook
  the picture over the same cells as in LibreOffice's rendering; sizes unchanged after
  an inspector close and reopen; and the time-to-show of §10.
