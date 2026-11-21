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

The library reads two options that `init` accepts and `preview` calls. Neither is in its type declarations or README; the exact version pin (SPEC-CORE-155) is what keeps them:

- `beforeTransformData(workbook)`, called with the ExcelJS workbook before the library
  converts it; what it returns is converted.
- `transformData(sheets)`, called with the converted sheets before the grid receives
  them (SPEC-CORE-167 already uses it).

The change scales the workbook in `beforeTransformData`, so the library's own conversion
and its picture placement both read the scaled values, and uses `transformData` only to
keep text sizes off the points-to-pixels table:

- every row's height becomes `(its height, or the sheet's default row height, or 15) ×
  4/3`, for rows 1 to 100 and every existing row after them; a height or default that is
  not a positive number counts as missing;
- every column the library can draw (1 to the largest cell count of any row) gets the
  width `px / 6`, where `px` is `Math.round(its width × 7)` when that is positive, or
  otherwise (no width, or a width that is not positive or rounds to 0) `Math.round(sheet default width × 7)`, or 64 when the sheet has no positive
  default width; the library then draws it at `6 × px / 6`, which is `px` up to
  floating-point error;
- the library drops the columns to the right of the last cell column before the grid
  gets them, and the grid draws those at its own 80 px; so `beforeTransformData` also
  records, per worksheet, the pixel width every column would get by the rule above (or
  that it is hidden), and `transformData` gives each column of the grid's sheet that has
  no entry, up to the sheet's `cols.len`, that recorded width (0.1 when hidden, as the
  library draws a hidden column), or the sheet's default when the column was not
  defined;
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
| Column 10.29 characters right of the last cell column | 80 | 72 |
| Text 8 pt | 8 | 11 |
| Text 10 pt | 11 | 13 |
| Text 11 pt | 11 | 15 |
| Text 14 pt | 15 | 19 |

Tried on five workbooks, copies of three production workbooks and two others with pictures: wrapped
text broke at the row heights the workbook set except where noted under *Checked, no
action*, a sequence-diagram picture stayed on the cells it covers
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
   - `worksheet.rowCount`; `worksheet.getRow(i)` for `i` from 1 to 100 (creating rows
     that do not exist, so the grid's first 100 rows all have a height) and
     `worksheet.findRow(i)` for `i` from 101 to `rowCount` (existing rows only, so a
     stray row far down creates nothing); each row's `height` and `cellCount`;
   - each row's cells with `row.eachCell(cb)`, without `includeEmpty`, which visits only
     cells with a value and creates none, and each cell's `style.font.size`; an empty
     cell draws no text, so its font does not matter;
   - `worksheet.getColumn(i)` for `i` from 1 to the largest `cellCount` of the rows
     visited, hidden rows included, and each column's `width`. The library keeps the
     columns up to the largest cell index of its non-hidden rows, so this covers every
     column it draws; any extra column it drops;
   - `worksheet.columns` (read before the library trims it), each column's `width` and
     `hidden`, to record the width of every column the worksheet defines;
   - `worksheet.getImages()`, and each image's `range.tl`, `range.br` (`nativeColOff`,
     `nativeRowOff`) and `range.ext` (`width`, `height`), any of which may be missing;

   sets every value as *Summary* lists. A font object reached from more than one cell,
   row or sheet is scaled once; a hidden row or column keeps its hidden flag (the
   library draws it at 0.1 px whatever its size). It returns the workbook it was given.
3. The library converts the workbook and calls `transformData` with the sheets. The
   function adds 0.01 to each distinct numeric `font.size` in each sheet's `styles`, and
   fills the columns with no entry as *Summary* says; the n-th sheet in the list is the
   n-th worksheet `eachSheet` visited (the library converts them in that order, one sheet
   each). The records live only for the one `preview` (one pair of functions per
   drawing). It returns the list it was given.
4. Everything after `preview` is as on `develop`: the adapter marks the drawing drawn and
   calls the grid sheet's `reload` once.
5. A sheet reached by its tab is already scaled: every worksheet was scaled in step 2,
   and the tab switch hands the grid an already converted sheet.

### 2. Failure cases

| Where | What happens |
|---|---|
| `beforeTransformData` receives something without `eachSheet`, or a worksheet, row, cell, column or picture lacks one of the members in §1.2 | That item is skipped; the rest are scaled |
| `worksheet.properties` is missing, or its `defaultRowHeight` / `defaultColWidth` is missing, zero or not a number (ExcelJS reads a missing attribute as 0) | The fallback: 15 pt rows, 64 px columns |
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
  converts it, calls `transformData`, and hands the result to a mocked grid. The fake's
  conversion reproduces what the library does: rows and cells that do not exist are
  skipped; a row's height is used as px, 24 when missing, 0.1 when hidden; a column's
  width is `6 × width` px, 80 when missing, 0.1 when hidden, and columns past the
  largest cell index of the non-hidden rows are dropped; each cell's style is deep-cloned
  and its numeric `font.size` becomes `Math.round(size / 1.333333)`. The tests assert the
  values the functions set (row heights and column widths to within 1e-9 of the
  formulas; fractional heights stay fractional) and what the fake conversion hands the
  grid, including the picture values of I4 (each member ×4/3 once, a missing member
  skipped). Where a picture lands on screen, and drawn pixels, are R-5's.
- `docs/specs/INDEX.md`: the SPEC-CORE-168 row, and SPEC-CORE-167 set to `superseded`.
- R-5, at a 1280 px window, on the copies in the local 「動画」 drive's `Inbox` (test data,
  not committed): `EnglishCore工数実績表.xlsx`, `要件定義署のサンプル.xlsx`,
  `19_書き込みエンコード画面_r2.xlsx`, plus one workbook with a picture anchored to cells
  (a copy of a design document with a sequence-diagram picture, added there for R-5).
  Sizes are read by wrapping `CanvasRenderingContext2D.prototype.fillText` and recording
  `ctx.font` (device pixels; CSS px = value / `window.devicePixelRatio`), and row heights
  and column widths from the grid's sheet data (`xs.datas[i].rows` / `.cols`), at
  devicePixelRatio 1 and 2. A drawn size may differ from the formula by one device pixel,
  because the grid truncates positions. Time to show is from the file's click in the
  list to the first `fillText` of a cell's text, the median of three runs, on this
  branch and on `develop`.
- No other file. No protected path.

## Invariants

I1. For every worksheet the library loads, rows 1 to 100 and every existing row after them are drawn at `(its height, else the sheet's positive default row height, else 15) × 4/3` px, except hidden rows; no row past 100 is created.
I2. For every worksheet, every column from 1 to the grid sheet's `cols.len` is drawn at `Math.round(its width × 7)` px when that is positive, else `Math.round(the sheet's positive default width × 7)`, else 64, except hidden columns, including the columns right of the last cell column that the library drops.
I3. Cell text whose font has a numeric size of `p` points is drawn at `Math.round(p × 4/3)` CSS px at a whole-number devicePixelRatio; every numeric `size` the grid receives is a whole number plus 0.01.
I4. Every picture's anchor offsets (`nativeColOff`, `nativeRowOff` of `tl` and `br`) and one-cell-anchor size (`ext.width`, `ext.height`) are 4/3 of the values the library loaded, so a picture that lies over the columns the library keeps and the rows that exist stays on the same cells as the scaled grid.
I5. Each font object, row, column and picture is scaled exactly once per drawing; a `reload`, the frame's `ResizeObserver`, a window `resize` and a sheet switch scale nothing again.
I6. The grid's first render after `preview` already uses the scaled rows, columns and sizes.
I7. A workbook of unexpected shape, or a scaling that throws, is still shown, with no fallback panel, no `dispose`, and no `console` output of any kind from the scaling.
I8. Every style property other than `font.size`, cell text, merges and hidden flags are the values the library would have loaded, and no cell is created: the grid receives no cell that it would not have received without the scaling.

## Revises

SPEC-CORE-167 I1. Superseded by SPEC-CORE-168 I3: every numeric font size the grid receives is a whole number plus 0.01, the pixel size Excel uses at 100 %.
SPEC-CORE-167 I3. Superseded by SPEC-CORE-168 I1, I2 and I4: row heights, column widths and picture placement are scaled to Excel's 100 %.
SPEC-CORE-167 I6. Superseded by SPEC-CORE-168 I3: 8 pt text is drawn at 11 CSS px, and 10, 12 and 14 pt at 13, 16 and 19.

## Checked, no action

- **Wrapped text can need more lines than in Excel.** The library breaks lines with the
  browser's fonts. Japanese text in a Latin-font cell falls back to a font wider than
  Excel's MS P Gothic, so a line holds fewer characters; at Excel's size a cell can need
  a line more than its row holds and is clipped (R-5: E8 on the セキュリティ要件 tab of
  `要件定義署のサンプル`, four lines in a 42 px row). Accepted by the owner: changing it
  means changing the library's text layout.

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
  the workbook's default font size (Excel writes a cell in the Normal style without a
  style id, and ExcelJS then gives it no font). In the five workbooks above and one more
  without pictures, 0 of 8,692
  cells with a value had no style id, so no case was seen.
- **A picture past the columns the library keeps, or over rows past 100 that do not
  exist.** The library drops columns after the last cell column before its picture code
  runs, and that code then counts 80 px per missing column and 24 px per missing row.
  Such a picture is drawn wider than in Excel (80 against 64 px per column), more than
  today relative to the now-exact rows. Changing it would mean adding cells or columns
  the library does not keep.
- **`baseColWidth`.** ExcelJS does not read it, so a sheet that sets it (Mac Excel often
  writes 10) without `defaultColWidth` gets 64 px columns where Excel draws them wider.
- **A `<col>` without a `width` attribute** gets ExcelJS's default of 9 characters, so
  63 px rather than the sheet's default. Excel does not write one; other tools may.
- **A picture past a hidden row or column** is placed as if the row or column had its
  size: the library's picture code ignores the hidden flag. That offset exists today and
  grows by 4/3 with this change.
- **Rows past 100 that do not exist** are drawn at the library's 24 px. The grid shows
  100 rows unless the sheet has more, and the rows of such a sheet are only created up to
  100, so a stray row far down costs no more than today.
- **A future library version that changes the conversion** would change the result. The
  version is pinned exactly (SPEC-CORE-155); an upgrade is re-checked in R-5.
- **Tests.** One test file with the library mocked covers I1 to I8 at the level of the
  values the functions set. The real library's drawing is R-5's: on `EnglishCore工数実績表`
  10 pt dates at 13 px and column A at 89 px; on `要件定義署のサンプル` wrapped lines inside
  their rows on the first sheet and one tab, and "セキュリティ要件" not clipped; on
  `19_書き込みエンコード画面_r2` 9 pt at 12 px and 14 pt at 19 px; on the picture workbook
  the picture over the same cells as in LibreOffice's rendering; sizes unchanged after
  an inspector close and reopen; and the time-to-show of §10.
