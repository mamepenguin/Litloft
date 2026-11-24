# PDF Pages tab: a thumbnail grid that fills the panel and reaches every page

SPEC-ID: SPEC-CORE-173
SPEC-ID: SPEC-CORE-174

Approval:

## Summary

The inspector's **Pages** tab for a PDF draws its page thumbnails as a single 72px
column centred in a panel about 384px wide. Most of the panel is empty, a thumbnail is
too small to recognise a page by, and in the light theme a white page has no edge
against the white panel. Separately, after the reader jumps to a distant page (page
input, search hit, outline row), the rail re-seats its window on that page and the pages
before it can no longer be reached by scrolling the rail: jumping to page 100 of a
225-page book leaves pages 99–106 and nothing above. This change, for the person reading
PDFs in Litloft, replaces the column with a grid whose column count follows the panel's
width (SPEC-CORE-173) and makes every page of the document reachable by scrolling the
rail, wherever the reader is (SPEC-CORE-174). The outline above the thumbnails is not
changed.

The agreed design is https://claude.ai/artifact/UuG7RJ1Mmq4svFpgwqhP7i, artboard
**A** (`Main`, `Jump`, `Phone`); its files are saved in
`docs/process/reviews/feature-pdf-pages-grid/design/`. `Wide` draws the same rule at
512px, a width the Pages tab never has (the inspector is 512px only while a wide
`document-side` tab is selected); it shows only that the column count follows the width.
`Current` draws today's rail for comparison and `TwoCol` is the rejected option B.

## Required items

### 1. Normal flow

1. The reader opens a PDF with more than one page (or with an outline) on the file page
   and selects the inspector's **Pages** tab, or raises it in the phone sheet.
2. The outline, when the document has one, is drawn first, unchanged, 16px above the grid
   (the panel's existing `gap-4`).
3. Below it, the rail is a grid of every page of the document, in page order, left to
   right then top to bottom. The column count is the largest n, at least 1, such that n
   cells of at least 96px and (n − 1) gaps of 8px fit the rail's content width; cells
   share the width equally (CSS `repeat(auto-fill, minmax(96px, 1fr))`). Rows are 12px
   apart. The rail adds no padding of its own: its content width is what the existing
   tabpanel `p-4` and the panel's `p-2` leave, 335px in the 383px inspector (measured),
   which gives 3 columns, and 3 columns also when a classic scrollbar takes 15px of it.
   In a 390px phone sheet it is 3 columns.
4. Each cell is a button with 4px padding and an 8px radius, holding the page's picture
   over its page number, 6px apart. The picture fills the button's inner width at the
   page's proportion (§1.6), with a 1px border (`warm-silver` at 40%), a 3px radius and a
   white face. The number is 12px monospace on a 16px line, `text-muted`.
5. The page the viewer is on has a 2px accent outline, offset 2px, around the picture
   only, and its number is accent and semibold. `aria-current="true"` stays on that
   button. Keyboard focus shows the app's `focus-visible` ring on the button, as today.
6. A cell's proportion is the page's own once that page has been drawn, kept for the
   document even after the page is dropped (§3). Before that it is the first page's
   proportion. The grid is not shown until the first page's size has been read (the
   existing `pdfLoading` text stays until then); if it cannot be read, A4 portrait
   (1 : 1.414) is used.
7. Only the pages whose cells are in or near the visible part of the rail are rasterised
   (§10). A page not drawn shows the white face and the border at its cell's proportion.
8. Pressing a cell moves the viewer to that page (as today). When the viewer's page
   changes by any route, the rail scrolls the matching cell into view with the least
   movement (as today). The same scroll happens each time the rail becomes visible: when
   the tab is first shown, when it is selected again after the page changed while another
   tab was selected, and when the phone sheet is raised to show it.
9. Scrolling the rail in either direction draws the pages that come into view. After a
   jump to page 100, scrolling up draws 99, 98, … down to page 1.
10. Hovering a cell (mouse) gives the button the `bg-elevated` surface; nothing else
    changes on hover.

### 2. Failure cases

- A page fails to render: its cell keeps the white face, the border and its number, at
  its cell's proportion; no error text is drawn in the cell (react-pdf's page `error`
  and `loading` slots are empty). Pressing it still moves the viewer. It is tried again
  the next time it enters the drawing margin.
- The document fails to load: the tab shows the existing `pdfLoadFailed` message,
  unchanged.
- The first page's size cannot be read: A4 portrait, as §1.6.
- No `IntersectionObserver` (jsdom, very old browsers): the rail draws the current page
  and the three pages before and after it, so the tab is never empty and never draws
  every page.

### 3. States

Document level: **loading** (no `numPages` or first page size yet; the `pdfLoading` text)
→ **ready** (the grid of every cell) or **failed** (`pdfLoadFailed`). A change of `src`
returns to loading, drops every raster and every kept proportion of the old document, and
the rail scrolls to the current page when ready.

Per cell: **placeholder** → **rendering** (entered the margin; white face, no text) →
**drawn** or **page-failed** (white face). Drawn, rendering or page-failed → placeholder
when the cell leaves the margin; page-failed → rendering when it enters again. The
current-page mark is independent of these states.

Never: a cell disappears from the grid while the document is ready; a cell inside the
margin goes back to placeholder; a cell changes position; a drawn cell's height changes
when it is dropped.

The tab still opens no document until it has been on screen and keeps it open after the
reader leaves it (`useHasBeenVisible`, unchanged).

### 4. Data read and written

Reads the PDF through react-pdf/pdf.js in the browser (the second `<Document>` the tab
already opens; the first page's size through `pdf.getPage(1)`) and the `PdfController`
state (`numPages`, `page`, `outline`, `src`). Keeps the measured page proportions in the
component's memory for the open document. Writes nothing: no store, no localStorage, no
server call.

### 5. External services

None. The PDF bytes come from the same stream URL the viewer already fetched, served from
the browser cache.

### 6. Authorization

Unchanged. The tab is only reachable on a file page the viewer can already open; the
drive check lives in the existing file endpoints.

### 7. Effect on existing features

- `PdfPagesPanel` is used only by `PdfPagesTab`, which is used only by `ShellLayout`'s
  `pages` tab. The full-screen viewer and the archive's Pages panel do not use it.
- `PdfController.goToPage` and the canvas are unchanged; the rail still follows the
  canvas and never drives it except on a press.
- The outline section, its active-entry rule, its `aria-disabled` rows and its inset are
  unchanged: no padding around the panel changes, and `InspectorShell` is not edited.
- The window (`INITIAL_THUMBNAIL_WINDOW`, the re-seat and the grow sentinel) is replaced
  by drawing what is in view; the tests that pin the window's mechanics are replaced by
  tests of this spec's invariants.

### 8. Error behavior

As §2. Nothing new is logged.

### 9. User-visible behavior

- The grid, the column count, the cell, the page border and the current-page mark of §1.
- A white face is visible briefly while a page draws. Rows do not change height when a
  page with the first page's proportion is drawn; a page of another proportion changes
  its row's height once, the first time it is drawn.
- A landscape page in a portrait document is drawn at its own proportion, shorter than
  its neighbours, aligned to the top of its row.
- Every page is reachable by scrolling, from any current page.
- Dark theme: the same border token (it resolves to the dark `warm-silver`), and the
  white face, the colour the drawn page will have.
- Touch: every cell is far wider than the 44px floor.
- No text or translation key changes.

### 10. Non-functional

- **Bounded drawing.** The drawing margin is measured against the rail's nearest
  scrolling ancestor (the element whose `overflow-y` is `auto` or `scroll` and whose
  height is bounded): the panel's own scroller on desktop (`PdfPagesPanel`'s root,
  measured 777px tall at 1440×900) and the sheet's scroller on the phone. A page is
  rasterised only while its cell intersects that element's visible box extended by half
  its height above and below. The outline counts as part of the visible box like any
  other content.
- **Time.** On the 225-page scanned PDF used for the window's original bound
  (色彩検定2級試験合格テキスト, test drive), R-5 records that the first row of thumbnails
  is drawn within 3 seconds of selecting the tab, and that a `PageDown` pressed in the
  viewer while the rail is drawing turns the page within 1 second.
- Thumbnail resolution follows the cell's CSS width at the device pixel ratio
  (react-pdf's `width`), as today.

## Touch points

- `frontend/src/components/FileDetail/pdf/PdfPagesPanel.tsx` (the rail: grid, drawing
  in view, placeholders, current-page mark, scroll on becoming visible)
- `frontend/src/components/FileDetail/pdf/__tests__/PdfPagesPanel.test.tsx` (window tests
  replaced)
- `frontend/src/components/FileDetail/pdf/PdfPagesTab.tsx` (read only: the dynamic import)
- `frontend/src/components/FileDetail/ShellLayout.tsx` (read only: where the tab is built)
- `frontend/src/components/FileDetail/InspectorShell.tsx` (read only: the tabpanel's
  `p-4` and `hidden`)
- `frontend/src/lib/pdfController.ts` (read only: state and `goToPage`)
- `frontend/e2e-components/` (a new fixture and spec: a PDF built in code the way
  `fixtures/inspectorResponsive.tsx` builds one, 225 pages with page 9 landscape, measured
  in the inspector at 1440×900 and in the phone sheet at 390×844: column count, equal
  cell widths, the number of drawn pages, reaching page 1 after a jump to page 100)
- `DESIGN.md` (a rule under the inspector: "The PDF Pages rail is a grid of every page:
  columns of at least 96px fill the width; each page has a 1px `warm-silver/40` border
  and a white face; the current page has a 2px accent outline on the picture and an
  accent number. Only pages near the visible part are drawn.")
- `docs/process/reviews/feature-pdf-pages-grid/design/` (the agreed design)

## Invariants

SPEC-CORE-173 (the grid): I1, I4, I7, I8, I9. SPEC-CORE-174 (every page reachable, bounded
drawing): I2, I3, I5, I6.

I1. The rail's column count is the largest n ≥ 1 such that n × 96px + (n − 1) × 8px fits
the rail's content width, and the cells of a row are equal in width within 1px: 3 in the
1440×900 inspector and 3 in the 390×844 phone sheet.
I2. Every page of the document has a cell in the rail, in page order, whatever page the
viewer is on; after the viewer moves to page 100 of a 225-page document, page 1's cell is
in the rail and becomes drawn when scrolled into view.
I3. A page is rasterised only while its cell intersects the visible box of the rail's
nearest scrolling ancestor extended by half that box's height above and below, in the
inspector and in the phone sheet; opening the tab on a 225-page document never mounts all
225 pages' rasters.
I4. Exactly one cell carries `aria-current="true"` and the accent outline, and it is the
viewer's current page; the outline is on the page picture, not around the number.
I5. Pressing a cell calls `goToPage` once with that cell's page number, and the rail never
calls `goToPage` on its own: scrolling, drawing, becoming visible or a document change
moves no page.
I6. When the viewer's page changes while the rail is visible, and each time the rail
becomes visible (first show, re-selection of the tab, the phone sheet raised), the current
page's cell is scrolled into view, and it is drawn while it is in the margin.
I7. Every page picture, drawn or not, has a visible 1px border, so a blank white page is
distinguishable from the panel in the light theme.
I8. A cell not yet drawn has the first page's proportion (A4 portrait when unknown), and a
cell keeps the proportion it was drawn at when it is dropped: drawing or dropping a page
changes no row's height by more than 1px, except a page whose proportion differs from the
first page's, the first time it is drawn.
I9. The outline section renders exactly as before this change: same rows, indentation,
inset, active entry and `aria-disabled` rows.

## Checked, no action

- **The outline's place.** Stacking the outline above the grid means a long outline
  pushes the thumbnails down. The human chose to keep it stacked (no PDF with an outline
  exists in the test drives to judge it by).
- **Option B (two large columns).** Rejected by the human: fewer pages per screen, less
  useful for finding a page.
- **Reading each page's own size before drawing it** (so every placeholder is exact).
  Rejected: it asks pdf.js for every page of a 225-page document up front, which is the
  cost the bound exists to avoid. Only pages whose proportion differs from the first
  page's change their row's height when drawn.
- **A virtualised list that removes off-screen cells from the DOM.** Not needed: an empty
  cell is a button and a box; 1,000 of them are cheap next to one raster. Keeping every
  cell is what makes I2 and keyboard order simple.
- **Scroll anchoring when content above changes height.** Placeholders take the first
  page's proportion and drawn cells keep theirs, so rows above the reader move only the
  first time a page of a different proportion is drawn; accepted.
- **The grid's inset differs from the design.** The design draws the grid 12px from the
  inspector's edge; keeping the tabpanel's `p-4` and the panel's `p-2` (so the outline
  and every other tab stay where they are) puts it 24px in. The cell floor is 96px rather
  than the 104px first discussed so that this width still gives 3 columns. Accepted by
  the human with the approval of this spec.
- **One tab stop per cell.** A 225-page document puts 225 buttons in the tab order (the
  window kept it to 8–16). Decided by the human with the approval of this spec.
- **The white face in the dark theme.** Chosen to match the drawn page, so drawing does
  not flash from dark to white; a grey placeholder would flash on every page.
- **A wider inspector.** The Pages tab is never shown at the 512px wide width, so no
  state of this change is drawn there; the rule of I1 would give 4 columns.
- **The full-screen viewer and the archive Pages panel** have their own layouts and are
  not touched.
- **User guide.** `docs/user-guide/viewers-and-players.md` already says the tab holds
  "the contents and page thumbnails"; the layout is not something a reader needs told.
- **Translations.** No new strings; `pdfGoToPage`, `pdfThumbnails`, `pdfOutline` keep
  their text.
