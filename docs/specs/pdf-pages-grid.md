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
2. The outline, when the document has one, is drawn first, unchanged (§7), 16px above
   the grid (the panel's existing `gap-4`). It is drawn as soon as the controller has
   it, before the grid.
3. Below it, the rail is a grid of every page of the document, in page order, left to
   right then top to bottom. The column count is the largest n, at least 1, such that n
   cells of at least 96px and (n − 1) gaps of 8px fit the rail's content width; cells
   share the width equally (CSS `repeat(auto-fill, minmax(96px, 1fr))`). Rows are 12px
   apart. The rail adds no padding of its own: its content width is what the existing
   tabpanel `p-4` and the panel's `p-2` leave, 335px in the 383px inspector (measured),
   which gives 3 columns, and 3 columns also when a classic scrollbar takes 15px of it.
   In a 390px phone sheet it is 3 columns.
4. Each cell is a button with 4px padding and an 8px radius, holding the page's picture
   over its page number, 6px apart. The picture fills the button's inner width, with a
   1px border (`warm-silver` at 40%), a 3px radius and a white face. The number is 12px
   monospace on a 16px line, `text-muted`.
5. The page the viewer is on has a 2px accent outline, offset 2px, around the picture
   only, and its number is accent and semibold. `aria-current="true"` stays on that
   button. Keyboard focus shows the app's `focus-visible` ring on the button, as today.
6. **Proportions.** The first page's proportion is read once per mount from
   `pdf.getPage(1)`'s viewport at scale 1 (rotation applied). Until it is known, the
   panel draws the existing `pdfLoading` text in place of the grid; if the read rejects,
   A4 portrait (1 : 1.414) is used. Every cell's picture box has that proportion, except
   a page whose drawn proportion differs from it by more than 2%: that cell takes the
   page's own proportion once it has been drawn. A page within 2% is drawn inside the
   first page's box (scaled to fit, centred on the white face), so a scan whose pages
   differ by a few pixels never moves a row.
7. **Drawing.** A page is drawn when its cell first comes within the drawing margin
   (§10) and stays drawn for as long as the panel is mounted; it is not dropped when it
   leaves the margin or when the tab is hidden. A page not yet drawn shows the white
   face and the border. Each page is rasterised at a fixed 128 CSS px width (react-pdf's
   `width`, times the device pixel ratio) and scaled by CSS to its cell, so a change of
   cell width (a scrollbar appearing, the sheet resized) redraws nothing.
8. Pressing a cell moves the viewer to that page (as today).
9. **Following the viewer.** While the rail is shown, when the viewer's page changes, the
   rail scrolls only if the current cell is not wholly visible: it then puts that cell in
   the middle of the scroller's visible box (`block: "center"`), so the rows before it
   are in view (the `Jump` artboard). A cell that is wholly visible causes no scroll, so
   turning page by page through a visible row does not move the rail. On the phone, the
   visible box starts below the sticky tab strip (`--inspector-sticky-top`).
10. **Becoming visible.** When the rail becomes shown (the panel mounts with Pages
    selected, or Pages is selected again; tracked through
    `InspectorActiveTabContext`), it applies step 9 if, and only if, the viewer's page
    is not the one it last followed. A reader who scrolled the rail and came back to the
    same page finds the rail where they left it. While Pages is not the selected tab the
    rail writes no scroll position.
11. Scrolling the rail in either direction draws the pages that come into the margin.
    After a jump to page 100, scrolling up draws 99, 98, … down to page 1.
12. Hovering a cell (mouse) gives the button the `bg-elevated` surface; nothing else
    changes on hover.

### 2. Failure cases

- A page fails to render: its cell keeps the white face, the border and its number, at
  its box's proportion; no error or loading text is drawn in the cell (react-pdf's page
  `error` and `loading` slots are empty). Pressing it still moves the viewer. It is not
  retried until the panel mounts again.
- The document fails to load: the tab shows the existing `pdfLoadFailed` message,
  unchanged.
- The first page's size cannot be read: A4 portrait, as §1.6.
- No `IntersectionObserver` (jsdom, very old browsers): the rail draws the current page
  and the three pages before and after it, so the tab is never empty and never draws
  every page.

### 3. States

**Mount.** The panel is mounted while the inspector shell holding it is mounted. Lowering
the phone sheet to its peek, closing the desktop inspector and moving to another file
unmount it; the next mount starts again from loading, with no drawn pages and no kept
proportions. Within a mount, the document is opened only once the tab has been on screen
and stays open while the tab is hidden (`useHasBeenVisible`, unchanged).

**Document**, within a mount: **loading** (no `numPages` or first page proportion yet;
the `pdfLoading` text, the outline when present) → **ready** (the grid of every cell) or
**failed** (`pdfLoadFailed`). A change of `src` returns to loading, drops every drawn page
and kept proportion of the old document, and step 9 applies when ready.

**Cell**, within a ready document: **placeholder** → **drawing** (entered the margin;
white face, no text) → **drawn** or **page-failed** (white face). Drawn and page-failed
are final for the mount. The current-page mark is independent of these states.

Never: a cell leaves the grid or changes its place in page order while the document is
ready; a drawn cell returns to placeholder within a mount; a cell's box changes height
except a page beyond the 2% tolerance when it is first drawn.

### 4. Data read and written

Reads the PDF through react-pdf/pdf.js in the browser (the second `<Document>` the tab
already opens; the first page's viewport through `pdf.getPage(1)`) and the
`PdfController` state (`numPages`, `page`, `outline`, `src`). Keeps the drawn set and the
proportions of drawn pages in the component's memory for the mount. Writes nothing: no
store, no localStorage, no server call.

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
- The outline section is unchanged in markup and classes: rows indented
  `depth × 12 + 8` px, its active-entry rule, its `aria-disabled` rows, and its inset
  from the inspector's edge (the tabpanel's 16px plus the panel's 8px, 24px). No padding
  around the panel changes, and `InspectorShell` is not edited.
- The window (`INITIAL_THUMBNAIL_WINDOW`, the re-seat and the grow sentinel) is replaced
  by drawing what enters the margin. The tests that pin the window's mechanics are
  replaced by tests of this spec's invariants; the tests of `useHasBeenVisible` and of
  the outline are kept.

### 8. Error behavior

As §2. Nothing new is logged.

### 9. User-visible behavior

- The grid, the column count, the cell, the page border and the current-page mark of §1.
- A white face is visible briefly while a page draws. A row changes height only when a
  page more than 2% off the first page's proportion is first drawn (a landscape page in
  a portrait book): it is drawn at its own proportion, shorter than its neighbours,
  aligned to the top of its row.
- Every page is reachable by scrolling, from any current page.
- After a jump, the current page is in the middle of the rail with the rows before it
  above.
- Dark theme: the same border token (it resolves to the dark `warm-silver`) and the white
  face, the colour the drawn page will have.
- Touch: every cell is far wider than the 44px floor.
- No text or translation key changes.

### 10. Non-functional

- **The scroller.** The drawing margin and step 9 are measured against one element: the
  closest ancestor carrying `data-inspector-scroller` (the phone sheet's scroller) when
  there is one, otherwise the panel's own root (`PdfPagesPanel`'s `overflow-y-auto`
  root, 777px tall at 1440×900). In the phone sheet the panel root is not given a bounded
  height and is not the scroller.
- **Bounded drawing.** A page is drawn when its cell intersects the scroller's visible box
  extended by half its height below and above. Opening the tab at page 1 in the
  1440×900 inspector therefore draws the cells in about 1.5 scroller heights: at most 24
  pages (8 rows of 3), against 8 today. Scrolling draws more, as today's window grows.
- **Time.** On the 225-page scanned PDF used for the window's original bound
  (色彩検定2級試験合格テキスト, test drive), R-5 records that the first row of thumbnails
  is drawn within 3 seconds of selecting the tab, and that a `PageDown` pressed in the
  viewer while the rail is drawing turns the page within 1 second. Both are pass/fail for
  shipping.

## Touch points

- `frontend/src/components/FileDetail/pdf/PdfPagesPanel.tsx` (the rail: grid, drawing
  on entry, proportions, current-page mark, following and becoming visible)
- `frontend/src/components/FileDetail/pdf/__tests__/PdfPagesPanel.test.tsx` (window tests
  replaced)
- `frontend/src/components/FileDetail/pdf/PdfPagesTab.tsx` (read only: the dynamic import)
- `frontend/src/components/FileDetail/ShellLayout.tsx` (read only: where the tab is built)
- `frontend/src/components/FileDetail/inspector/InspectorShell.tsx` (read only: the
  tabpanel's `p-4`, `hidden`, `--inspector-sticky-top`)
- `frontend/src/components/FileDetail/inspector/activeTab.ts` (read only:
  `InspectorActiveTabContext`)
- `frontend/src/components/MobileInspectorSheet.tsx` (read only: the
  `data-inspector-scroller` element, unmounting when lowered)
- `frontend/src/lib/pdfController.ts` (read only: state and `goToPage`)
- `frontend/e2e-components/` (a new fixture and spec: a PDF built in code the way
  `fixtures/inspectorResponsive.tsx` builds one, 225 pages with page 9 landscape, measured
  in the inspector at 1440×900 and in the phone sheet at 390×844: column count, equal
  cell widths, the number of drawn pages, reaching page 1 after a jump to page 100, the
  current cell below the sticky strip on the phone)
- `DESIGN.md` (a rule under the inspector: "The PDF Pages rail is a grid of every page:
  columns of at least 96px fill the width; each page has a 1px `warm-silver/40` border
  and a white face; the current page has a 2px accent outline on the picture and an
  accent number. Pages are drawn as they come near the visible part.")
- `docs/process/reviews/feature-pdf-pages-grid/design/` (the agreed design)

## Invariants

SPEC-CORE-173 (the grid): I1, I4, I7, I8, I9. SPEC-CORE-174 (every page reachable,
bounded drawing, following): I2, I3, I5, I6, I10, I11.

I1. The rail's column count is the largest n ≥ 1 such that n × 96px + (n − 1) × 8px fits
the rail's content width, and the cells of a row are equal in width within 1px: 3 in the
1440×900 inspector, with and without a 15px scrollbar, and 3 in the 390×844 phone sheet.
I2. Every page of the document has a cell in the rail, in page order, whatever page the
viewer is on; after the viewer moves to page 100 of a 225-page document, page 1's cell is
in the rail and becomes drawn when scrolled to.
I3. A page is drawn only after its cell has intersected the scroller's visible box
extended by half its height (the scroller being the closest `data-inspector-scroller`
ancestor, else the panel root); opening the tab at page 1 in the 1440×900 inspector draws
at most 24 pages, and in the 390×844 sheet draws no page whose cell has not been within
that margin; without `IntersectionObserver` exactly the current page and the three on each
side are drawn.
I4. Exactly one cell carries `aria-current="true"` and the accent outline, and it is the
viewer's current page; the outline is on the page picture, not around the number.
I5. Pressing a cell calls `goToPage` once with that cell's page number, and the rail never
calls `goToPage` on its own: scrolling, drawing, becoming visible or a document change
moves no page.
I6. While the rail is shown, a change of the viewer's page to a cell not wholly visible
leaves that cell wholly visible, below the sticky strip on the phone; a change to a cell
already wholly visible does not change the scroller's `scrollTop`.
I7. Every page picture, drawn or not, has a visible 1px border, so a blank white page is
distinguishable from the panel in the light theme.
I8. Before the first page's proportion is known no cell is shown; after, every picture
box has that proportion except a page more than 2% off it once drawn; a drawn page stays
drawn for the mount, and no row changes height except when such a page is first drawn.
I9. The outline section renders as before this change: same rows, `depth × 12 + 8` px
indentation, active entry, `aria-disabled` rows, and a 24px inset from the inspector's
edge.
I10. While Pages is not the selected tab the rail changes no scroller's `scrollTop`; on
being shown again it scrolls only when the viewer's page differs from the one it last
followed, and then as I6.
I11. A change of `src` drops every drawn page and kept proportion of the old document; no
document is opened until the tab has first been on screen, and within a mount it stays
open while the tab is hidden.

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
- **Scroll anchoring when content above changes height.** Within 2% a page is drawn in
  the first page's box, so only a page well off that proportion (a landscape page in a
  portrait book) moves the rows below it, once, when first drawn. iOS Safari has no CSS
  scroll anchoring, so there the content can shift by that row's difference while
  scrolling up; accepted.
- **Dropping pages that leave the margin.** Rejected: it would redraw on every return to
  the tab and every scroll back, flashing white faces. The drawn set grows with scrolling,
  as today's window does, and is released when the panel unmounts.
- **In-file find (SPEC-CORE-028 I8).** Its "page and scroll unchanged" on closing the bar
  is about the viewer. When the restored tab is Pages and a hit moved the page, the rail
  following the page (I10) is the rail's own scroll, not the viewer's.
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
