# Excel viewer: cell text at the size the workbook sets

SPEC-ID: SPEC-CORE-167

Approval:

## Summary

The Excel viewer (SPEC-CORE-155, `docs/specs/office-viewer.md`) draws small cell text far
smaller than its cells: the 6 pt and 8 pt text of a requirements template comes out at
5 px and 6 px, which cannot be read. The owner noticed it on production files.

The cause is two steps in `@js-preview/excel` 1.7.14, read in its bundle:

1. When it loads a cell style it divides the workbook's font size, in points, by
   1.333333 and rounds: `style.font.size = Math.round(size / 1.333333)`.
2. When x-data-spreadsheet draws a cell it looks the stored size up in a points-to-pixels
   table (7.5 → 10, 8 → 11, 9 → 12, 10 → 13, 10.5 → 14, 11 → 15, 12 → 16, 14 → 18.7,
   15 → 20, 16 → 21.3, 18 → 24, 22 → 29.3, 24 → 32, 26 → 34.7, 36 → 48, 42 → 56) and
   draws the result as CSS pixels. A size that is not in the table is drawn as that
   many pixels unchanged.

Row heights and column widths come out at about 3/4 of Excel's. What each workbook size
is drawn at today:

| Workbook | Stored | Drawn today | After this change |
|---|---|---|---|
| 6 pt | 5 | 5 px (not in table) | 6.7 px |
| 7 pt | 5 | 5 px | 6.7 px |
| 8 pt | 6 | 6 px | 8.0 px |
| 9 pt | 7 | 7 px | 9.3 px |
| 10 pt | 8 | 11 px (table) | 10.7 px |
| 11 pt | 8 | 11 px | 10.7 px |
| 12 pt | 9 | 12 px | 12.0 px |
| 14 pt | 11 | 15 px | 14.7 px |

Text of 9 pt and below falls off the table and is drawn at well under its cells' scale;
10 pt and above is rescued by the table, unevenly. This change multiplies every stored
size by the literal 1.333333 once, after the library has loaded the workbook. The
product is never exactly a table value (6 × 1.333333 = 7.999998, not 8), so it is drawn
as-is: about the workbook's point size, in pixels. That matches the cells, which are at
3/4 of Excel's pixels, so the whole sheet looks like Excel at about 75 % zoom. Small
text grows by a third; 10 pt to 11 pt text changes by under half a pixel.

The literal matters: with 4/3, 6 × 4/3 = 8 exactly, which the table would turn into
11 px.

This is the one place Litloft corrects the library's drawing, an exception to
SPEC-CORE-155's "what is shown is what the library draws".

Tried before this spec on copies of three production workbooks: with the correction the
requirements template's wrapped descriptions break onto the lines the row heights were
made for, and the time sheet's dates fit their cells. Multiplying by 1.78 instead (Excel
at 100 %) clipped text at the row edges, because rows stay at 3/4.

## Required items

### 1. Normal flow

1. The Excel adapter (`frontend/src/components/office/excelAdapter.ts`) calls
   `preview(bytes)` as today.
2. When `preview` resolves, inside the adapter's existing `try`, the adapter walks every
   sheet the library loaded (`xs.datas`, one per sheet) and each sheet's `styles` list,
   and multiplies `font.size` by 1.333333 for each distinct `font` object whose `size` is
   a number. A `font` object reached from more than one style or sheet is corrected once.
3. It then calls the `reload` it already calls on the grid's sheet, so the first frame
   the viewer shows has the corrected sizes, and only then marks the drawing drawn.
4. Switching to another sheet tab shows that sheet with its sizes already corrected,
   because every sheet was corrected in step 2.

### 2. Failure cases

| Where | What happens |
|---|---|
| `xs` or `xs.datas` is missing, or `datas` is not an array (a different library build) | Nothing is corrected; the workbook is shown as the library draws it. No error, no fallback, no log |
| A sheet has no `styles` array, a style is not an object, it has no `font`, or `font.size` is not a number | That entry is skipped; the rest are corrected |
| The correction throws for any other reason | It is caught inside the correction; the sizes corrected so far stay, the rest stay as loaded, and the workbook is shown. No fallback, no log |
| `preview` rejects | Today's fallback (SPEC-CORE-155 I3); no correction runs |

### 3. States

The correction has two states per drawing: not applied (between `init` and the end of
`preview`) and applied. It goes from not applied to applied once, never back and never
again: a redraw, a resize, an inspector toggle or a sheet switch does not multiply the
sizes a second time. A new identity (SPEC-CORE-155 §3) is a new drawing, with its own
library instance and its own single correction.

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

- Small text grows: 6 pt from 5 to 6.7 px, 8 pt from 6 to 8 px, 9 pt from 7 to 9.3 px.
  10 pt to 14 pt text changes by under half a pixel either way.
- Wrapped text keeps the line breaks the workbook was laid out with.
- The sheet as a whole still looks smaller than Excel at 100 %, about 75 %.
- `docs/user-guide/viewers-and-players.md` needs no change: it does not describe sizes.

### 10. Non-functional

The walk is over style objects, which a workbook has at most a few hundred of; no
measurable time. No new dependency.

## Touch points

- `frontend/src/components/office/excelAdapter.ts`: the correction after `preview`,
  inside the existing `try`, before the existing `reload` and before `drawn` is set.
- A test under `frontend/src/components/__tests__/` with the library mocked: the mock's
  `xs.datas` carry styles with and without `font.size`, a `font` object shared by two
  styles, and a `reload` that records the sizes it sees.
- The R-5 copies of three production workbooks in the local 「動画」 drive's `Inbox`
  (test data, not committed): `EnglishCore工数実績表.xlsx` (4 sheets, 10 pt to 15 pt),
  `要件定義署のサンプル.xlsx` (11 sheets, 6 pt to 10 pt, wrapped text),
  `19_書き込みエンコード画面_r2.xlsx` (5 sheets, mostly no explicit size).
- No other file. No protected path.

## Invariants

I1. After an Excel file is shown, every distinct `font` object reachable from any sheet's `styles` whose `size` was a number `n` when `preview` resolved has `size` equal to `n × 1.333333`, and every other style and font is unchanged.
I2. The correction is applied exactly once per drawing: a redraw, a frame resize or a sheet switch leaves each `size` as I1 left it.
I3. Row heights, column widths and every style property other than `font.size` are the values the library loaded.
I4. When the first `reload` after `preview` runs, every size I1 names already has its corrected value.
I5. A workbook whose `xs.datas` is missing or not an array, or whose styles hold unexpected shapes, or whose correction throws, is still shown, with no fallback panel and no `console.warn`.

## Checked, no action

- **Excel at 100 %.** Making the sheet as large as Excel would also mean scaling row
  heights and column widths, a zoom of the whole drawing. That is a separate feature (a
  zoom control); this change only removes the uneven conversion.
- **Rounding.** The library rounds `n / 1.333333` to a whole number, so 6 pt and 7 pt
  both become 6.7 px, and 10 pt and 11 pt both 10.7 px. Not compensated: the original
  point size is not kept by the library.
- **10 pt and 11 pt text gets 0.3 px smaller** (11 → 10.7 px), and 14 pt 0.3 px smaller.
  Accepted for one consistent scale.
- **Text that is small in the workbook itself** (6 pt) stays small, as in Excel at 75 %.
- **A future library version that changes either step** would change the result. The
  version is pinned exactly (SPEC-CORE-155); an upgrade is re-checked in R-5.
- **Tests.** One test file with the library mocked covers I1 to I5. The real library's
  drawing is R-5's, at 1280 px, on the three workbooks in *Touch points*: on
  `要件定義署のサンプル` the 6 pt descriptions are larger than before and their wrapped
  lines fit inside their rows on the first sheet and on one other sheet reached by its
  tab; on `EnglishCore工数実績表` the dates fit their cells on two sheets and stay fitting
  after the inspector is closed and reopened (a redraw); on
  `19_書き込みエンコード画面_r2` the text looks as before.
