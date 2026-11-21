# Excel viewer: text runs on into empty neighbour cells

SPEC-ID: SPEC-CORE-170

Approval: sha256:2011aaf4ffa87f09e871fe06a3155b1ff55bfeedd87625aca031a54e29fa84dd Yuichi Senga 2026-11-21

## Summary

In Excel, text wider than its cell runs on over the empty cells to its right. The Excel
viewer (SPEC-CORE-155, SPEC-CORE-168) cuts it at the cell's edge instead, so sheet titles
and labels written in one narrow cell of a grid-paper sheet show only their first
characters: "2022年6月 EnglishCore 工数実績表" shows as "2022年6月", "19_書き込みエンコード画面"
as "19". The owner noticed it on production files.

The cause, read in `@js-preview/excel` 1.7.14 (x-data-spreadsheet inside it): every cell
is drawn inside a clip of its own rectangle (`ctx.rect(...); ctx.clip()`), and there is
no option to turn that off. A merged cell is drawn inside the clip of the merged range.

This change makes such a cell a merged cell, in the grid's data only, across the empty
cells its text needs. It is done in the adapter's existing `transformData` function
(SPEC-CORE-168), after the sizes are final, by measuring the text with the same font the
grid will draw it in. The library's drawing is not changed, and the file is not changed.

Tried on copies of production workbooks: the titles above, "画面項目" and the cover page's
company lines show in full; text in cells that already belong to a merge, and every
other cell, draw as before.

This adds to the one place Litloft corrects the library's drawing (SPEC-CORE-155's
"what is shown is what the library draws", already excepted by SPEC-CORE-168).

## Required items

### 1. Normal flow

1. `transformData` (in `frontend/src/components/office/excelAdapter.ts`) runs as in
   SPEC-CORE-168: the +0.01 on font sizes and the column fill, for every sheet. Only
   after that, in a separate pass with its own `try`, it looks for run-on cells in each
   sheet, so a failure in this pass cannot affect the sizing.
2. A cell of a sheet is a *run-on candidate* when all of these hold:
   - its `text` is a non-empty string that does not start with `=`;
   - its row is not hidden (a row whose `height` is a number below 1, or whose `hidden`
     is true; the library gives a hidden row height 0.1 and no cells) and its column is
     not hidden (a `cols[k]` entry with a numeric `width` below 1; the library's hidden
     value is 0.1);
   - it has no `merge` of its own and lies inside no range listed in the sheet's `merges`;
   - its style (the sheet's `styles[cell.style]`, or none) has no `textwrap`, an `align`
     that is missing or `"left"`, no border (a `border` with a truthy `top`, `right`,
     `bottom` or `left`; the grid draws only those four), no `bgcolor`, and a `font.size`
     that is either absent or a number.
3. The candidate's text width is measured with a 2D context of a canvas made with
   `document.createElement("canvas")`, created on the first measurement of the
   `transformData` call and reused for the rest of it. Its `font` is the one the grid
   will use: `[italic ][bold ]<px>px <name>`, where `<px>` is the style's numeric
   `font.size` truncated to a whole number (13 when the size is absent: the grid's
   default 10 pt through its table) and `<name>` the style's `font.name` or `Arial`. The
   grid draws each line of a text split at `\n` on its own, so the width is that of the
   widest line. The text needs `5 + width + 1` px: the grid draws left-aligned text 5 px
   inside the cell and clips 1 px inside each edge. A text whose every line is so short
   that `6 + characters × 2 × px` fits the cell is not measured (no glyph is two em
   wide).
4. If the cell's own width (the sheet's `cols[k].width`, or 80, the grid's default, when
   the key has no entry or its `width` is not a positive number) is enough, nothing changes. Otherwise the cell takes the
   next cells to its right, one at a time, while the running width is still short, and
   stops before a cell that:
   - has a `text` that is anything but `undefined`, `null` or `""` (a number, `0` and a
     date included), or a `merge`, or lies inside a range in `merges`;
   - has a style with a border (as in §1.2) or a `bgcolor`;
   - is at or past the sheet's `cols.len`.
   Cells that do not exist in the row count as empty. A hidden column is passed over like
   any other cell, as in Excel; its 0.1 px adds nothing to the width.
5. If it took at least one cell, the candidate gets `merge = [0, n]` (n cells taken)
   and the range `<col><row>:<col+n><row>` (A1 notation, letters past Z as AA, AB, …;
   1-based row) is appended to the sheet's `merges`. Both are computed first and then
   written one after the other with nothing that can throw between them. The cells taken
   are not changed or created.
6. Candidates are handled left to right within a row, so a cell taken by one candidate
   is inside a range when a later candidate is checked.
7. The grid then draws the candidate as a merged cell: its text inside the merged
   range's clip, which covers the cells taken.

### 2. Failure cases

| Where | What happens |
|---|---|
| A sheet without `rows`, `cols`, `merges` or `styles` of the expected shape, a row or cell of an unexpected shape, a `merges` entry that is not a range string | That sheet, row, cell or entry is skipped; the rest are handled |
| No 2D canvas context can be made (`getContext` returns null or throws) | No cell runs on; the workbook is shown as before |
| Anything else throws | Caught inside `transformData`, which returns the list it was given; cells handled so far keep their merge. No log, no fallback |

### 3. States

None new. The run-on is decided once per drawing, inside `transformData`, which the
library calls once per `preview` (SPEC-CORE-168 §3). A redraw, a resize or a sheet switch
does not decide it again; a cell's run-on does not change when the frame is resized.

### 4. Data read and written

Only the grid's in-memory sheets of the drawing on screen. The file is not changed.

### 5. External services

None.

### 6. Authorization

Unchanged.

### 7. Effect on existing features

- A run-on cell behaves as a merged cell in the grid: clicking it, or one of the cells it
  took, selects the whole range, and the arrow keys move over the range in one step, as
  they do over a workbook's own merges.
- Cells that are not candidates draw exactly as before. A merge from the workbook is
  never changed.
- The fonts, row heights and column widths of SPEC-CORE-168 are unchanged; the run-on
  reads them after they are final.
- Word files, the fallback panel, focus handling and the dismiss-scrim behaviour of
  SPEC-CORE-155 are unchanged.

### 8. Error behavior

None new; see §2. Nothing is logged.

### 9. User-visible behavior

- Left-aligned text that Excel lets run on into empty cells to its right shows in full,
  as in Excel, and the grid lines inside the run are covered, as in Excel.
- Selecting such a cell selects the cells its text covers.
- `docs/user-guide/viewers-and-players.md`, *Office files*: the sentence "A cell's text
  that overflows into an empty neighbour is cut at its own cell" becomes "A cell's text
  runs on into empty cells to its right, as in Excel, unless it is centred or
  right-aligned, or the cell or a neighbour has a border or a fill; then it is cut at
  its own cell".

### 10. Non-functional

At most one text measurement per candidate, skipped as §1.3 says. The largest R-5 workbook (286,310 cells) may not take more than 0.5 s longer
to show than on `develop`, measured as SPEC-CORE-168 §10 / Touch points says. No new
dependency.

## Touch points

- `frontend/src/components/office/excelAdapter.ts`: the run-on step in `transformData`.
- `frontend/src/components/__tests__/FilePreview.excelActualSize.test.tsx`: may stub the
  canvas context in its setup, since jsdom's `getContext` logs to the console and those
  tests assert no console output; none of its assertions changes.
- `frontend/src/components/__tests__/FilePreview.excelTextOverflow.test.tsx` (new), with
  the library mocked as in `FilePreview.excelActualSize.test.tsx`: the mocked `preview`
  calls `transformData` with sheets built directly in the grid's shape (`rows` keyed by
  0-based row with `cells` keyed by 0-based column, `cols` with `len`, `merges`,
  `styles`), and `HTMLCanvasElement.prototype.getContext` is stubbed to return a context
  whose `measureText(text).width` is a fixed px per character, and which records the
  `font` it was given.
- `docs/specs/INDEX.md`: the SPEC-CORE-170 row.
- `docs/user-guide/viewers-and-players.md`: the sentence in §9.
- R-5, at a 1280 px window and devicePixelRatio 1 and 2, on the copies in the local
  「動画」 drive's `Inbox` (test data, not committed): `EnglishCore工数実績表.xlsx` (the
  row-3 title in full), `19_書き込みエンコード画面_r2.xlsx` (the row-1 title and
  "画面項目" in full, the 「ボディー上」 band of row 9, a workbook merge, unchanged),
  `要件定義署のサンプル.xlsx` (the first sheet unchanged apart from cells that run on),
  `画面遷移図_画像入り.xlsx` (title rows, picture position unchanged). Clicking a
  run-on cell selects its range; the arrow keys still move the selection. Time to show
  on the largest workbook as §10 says. "In full" is observed as: the run-on range in the
  grid's `xs.datas[i].merges`, the `fillText` call for the text with its font (wrapping
  `CanvasRenderingContext2D.prototype.fillText`), and a screenshot showing the last
  character inside the range, at both ratios.
- No other file. No protected path.

## Invariants

I1. A cell that satisfies every condition of §1.2, whose text measured as §1.3 needs more than its own width, gets `merge = [0, n]` with n the fewest cells to its right, all allowed by §1.4, whose widths together with its own reach the needed width, or as many as §1.4 allows when they never do; and its range is in the sheet's `merges`.
I2. A cell that fails any condition of §1.2, or whose text fits its own width, keeps the `merge` it was loaded with (none, for most cells) and adds nothing to `merges`.
I3. A merge or range that the library loaded is never changed or removed, and no cell is created: the cells and their text, styles, row heights and column widths are what the grid would have received without this step.
I4. No range added overlaps another range, added or loaded, and no range added includes a cell with text, a border or a fill other than its first, or a column at or past `cols.len`.
I5. The run-on is decided once per drawing; a `reload`, the frame's `ResizeObserver`, a window `resize` and a sheet switch add or remove no range.
I6. A sheet of unexpected shape, a missing canvas context, or a step that throws still shows the workbook, with no fallback panel, no `dispose`, and no `console` output from the step, and every sheet keeps SPEC-CORE-168's sizing.
I7. When `getContext("2d")` returns null or throws, `merges` and every cell's `merge` are as loaded.

## Revises

SPEC-CORE-168 I8. Every style property other than `font.size`, cell text, merges and hidden flags are the values the library would have loaded (a hidden column the library dropped is drawn at the library's hidden width, 0.1), except that SPEC-CORE-170 appends its run-on ranges to `merges` and sets `merge` on their first cells; and no cell is created: the grid receives no cell that it would not have received without the scaling and the run-on.

## Checked, no action

- **A column edge dragged by the viewer.** The run-on is decided when the sheet is
  drawn; after a column is widened or narrowed by hand, its ranges stay as they were, so
  text can be clipped again or cover a cell it no longer needs, until the file is opened
  again.
- **A formula that shows nothing** (`=IF(…,"")`) reaches the grid as `""`, so text runs
  on over it, where Excel stops. Such cells usually sit in bordered tables, where the
  border stops the run first. Telling them apart would mean carrying the cell types over
  from `beforeTransformData`.
- **A font name the canvas rejects** (not a valid CSS family) leaves the context's
  previous font; the grid's own context ignores the same string, so both measure and
  draw with a font other than the workbook's. Not seen; workbook font names are plain
  family names.
- **Many run-on ranges** make the grid's merge lookups, which scan the list on every
  draw and click, a little longer. A sheet gets at most one range per candidate.
- **Shrink-to-fit cells** run on in full instead of shrinking, as the grid does not
  shrink text.

- **Right-aligned and centred text.** Excel runs right-aligned text on to the left and
  centred text both ways. Not done: a merge can only grow to the right of its top-left
  cell, so these would need the text to move cells. Left and default alignment cover
  titles and labels, the case seen.
- **Cells with a border or a fill, and neighbours with one.** A merged cell draws its
  style over the whole range, so a candidate's border or fill would spread over the cells
  it takes, and a neighbour's would disappear. Such cells keep today's clipping.
- **Numbers.** Excel shows `####` for a number wider than its cell rather than running it
  on. The grid's data does not say whether a text came from a number, so a long
  formatted number also runs on. Not seen in the workbooks tried.
- **Text over a picture.** A run-on merge is drawn with a white fill like every cell; a
  picture over those cells is drawn after the cells and stays on top, as today.
- **Selection over the taken cells.** Clicking a taken cell selects the run-on range
  instead of the empty cell. Accepted: the viewer is read-only.
- **The stray mark at the right end of a merged title row** (a cell inside a workbook
  merge redrawing its copy of the text) is a separate change.
- **Fonts the browser lacks.** The measurement uses the font the grid draws with, so
  the run-on matches what is drawn, even where both differ from Excel.
- **Tests.** One test file with the library and the canvas mocked covers I1 to I6 on
  the grid's data. The real drawing is R-5's.
