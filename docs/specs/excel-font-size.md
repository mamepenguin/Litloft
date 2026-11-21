# Excel viewer: cell text at the size the workbook sets

SPEC-ID: SPEC-CORE-167

Approval:

## Summary

The Excel viewer (SPEC-CORE-155, `docs/specs/office-viewer.md`) draws cell text much
smaller than the rest of the sheet. A 10 pt cell is drawn at about 8 px, and the 6 pt text
of a requirements template at about 5 px, which cannot be read. The owner noticed it on
production files.

The cause is a unit conversion in `@js-preview/excel` 1.7.14. When it reads a cell
style it divides the workbook's font size, in points, by 1.333333 and rounds
(`style.font.size = Math.round(size / 1.333333)`), and x-data-spreadsheet then draws that
number as CSS pixels (`font: <size × devicePixelRatio>px` on a canvas scaled by the same
ratio). Points to pixels is a multiplication by 4/3, so text ends up at 9/16 of its size,
while row heights and column widths come out at about 3/4 of Excel's. Text is therefore
small against its own cells as well as small on screen.

This change multiplies every cell style's font size by 1.333333 once, after the library
has loaded the workbook and before the viewer shows it, which undoes the library's
division. Text then keeps the proportion to its cells that the workbook was laid out
with: the whole sheet looks like Excel at about 75 % zoom. It is the one place Litloft
corrects the library's drawing, an exception to SPEC-CORE-155's "what is shown is what
the library draws".

Tried before this spec on three production workbooks and a local copy of two of them:

| Factor | 10 pt cell | 6 pt cell | Fit |
|---|---|---|---|
| none (today) | 8 px | 5 px | text small inside its cells |
| × 1.333 | 10.7 px | 8 px | text fits; wrapped lines land exactly on the row heights |
| × 1.78 (Excel at 100 %) | 14 px | 11 px | text clipped by the rows, which stay at 3/4 |

## Required items

### 1. Normal flow

1. The Excel adapter (`frontend/src/components/office/excelAdapter.ts`) calls
   `preview(bytes)` as today.
2. When `preview` resolves, before the viewer reports the drawing as shown, the adapter
   walks every sheet the library loaded (`xs.datas`, one per sheet), and in each sheet's
   `styles` list multiplies `font.size` by 1.333333 wherever it is a number.
3. It then redraws the current sheet (the `reload` it already calls on the grid's sheet
   after preview), so the first frame the viewer sees already has the corrected sizes.
4. Switching to another sheet tab shows that sheet with its sizes already corrected,
   because every sheet was corrected in step 2.

### 2. Failure cases

| Where | What happens |
|---|---|
| `xs` or `xs.datas` is missing (a different library build) | Nothing is corrected; the workbook is shown as the library draws it. No error, no fallback |
| A style has no `font` or a non-numeric `size` | That style is left alone; the library's default size applies, as today |
| `preview` rejects | Today's fallback (SPEC-CORE-155 I3); no correction runs |

### 3. States

The correction has two states per drawing: not applied (between `init` and the end of
`preview`) and applied. It goes from not applied to applied once, and never back or
again: a redraw, a resize, an inspector toggle or a sheet switch does not multiply the
sizes a second time. A new identity (SPEC-CORE-155 §3) is a new drawing with its own
single correction.

### 4. Data read and written

Only the library's in-memory style objects of the drawing on screen. Nothing on disk,
on the server or in storage; the file is not changed.

### 5. External services

None.

### 6. Authorization

Unchanged.

### 7. Effect on existing features

- Every Excel drawing: cell text with an explicit size gets larger by 4/3. Cells without
  a size keep the library's 10 px default.
- Row heights, column widths, borders, fills and pictures are not touched.
- Word files, the fallback panel, the arrow keys, focus handling and the dismiss-scrim
  behaviour of SPEC-CORE-155 are unchanged.

### 8. Error behavior

None new; see §2. Nothing is logged.

### 9. User-visible behavior

- A 10 pt cell is drawn at about 10.7 px instead of 8 px; a 6 pt cell at 8 px instead of
  5 px. Wrapped text keeps the line breaks the workbook was laid out with.
- The sheet as a whole still looks smaller than Excel at 100 %, about 75 %.
- `docs/user-guide/viewers-and-players.md` needs no change: it does not describe sizes.

### 10. Non-functional

The walk is over style objects, which a workbook has hundreds of at most; no measurable
time. No new dependency.

## Touch points

- `frontend/src/components/office/excelAdapter.ts`: the correction after `preview`, before
  the existing `reload`.
- A test under `frontend/src/components/__tests__/` with the library mocked: the mock's
  `xs.datas` carry styles with and without `font.size`.
- No other file. No protected path.

## Invariants

I1. After an Excel file is shown, every cell style in every sheet whose `font.size` was a number `n` when `preview` resolved has `font.size` equal to `n × 1.333333`, and every other style is unchanged.
I2. The correction is applied exactly once per drawing: a redraw, a frame resize or a sheet switch leaves each `font.size` as I1 left it.
I3. Row heights, column widths and every style property other than `font.size` are the values the library loaded.
I4. When the loaded workbook has no `xs.datas`, the file is still shown, with no fallback panel and no warning.

## Checked, no action

- **Excel at 100 %.** Making the sheet as large as Excel would also mean scaling row
  heights and column widths, a zoom of the whole drawing. That is a separate feature (a
  zoom control); this change only removes the inverted conversion.
- **Rounding.** The library rounds `n / 1.333333` to a whole number, so the corrected size
  differs from the workbook's by up to 0.67 px. Not compensated.
- **Text that is small in the workbook itself** (6 pt) stays small, as in Excel.
- **A future library version that fixes the conversion** would make text too large. The
  version is pinned exactly (SPEC-CORE-155); an upgrade is re-checked in R-5.
- **Tests.** One test with the library mocked covers I1 to I4. The real library's
  drawing is checked in R-5 on the production workbooks named above.
