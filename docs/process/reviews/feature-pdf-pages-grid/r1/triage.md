# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:CR-1 is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — full: Read the changed hunks (the import and the PDF_BYTES selection) together with their context, lines 60-169.
- frontend/e2e-components/fixtures/pdfPagesGrid.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-scrollbar-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid.measure.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/projects.ts — full: Read the whole file.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read the changed hunk (the AT_THE_DESKTOP_WIDTH list additions) and lines 101-190, where the list is checked against DESKTOP_ONLY.
- frontend/src/components/FileDetail/pdf/PdfPagesPanel.tsx — full: Read the whole file, lines 1-462.

Test files:
- frontend/src/components/FileDetail/pdf/__tests__/PdfPagesPanel.test.tsx — full: Every changed hunk read from the diff, plus the unchanged middle section at lines 329-438.

## Unspecified behavior, recorded

- claude-read: The IntersectionObserver's half-height drawing margin is computed once, when the observer is created (dependencies `[firstRatio, numPages]`). It is not recomputed when the window is resized or the phone sheet changes height. If the first page's proportion resolves while the Pages tab is hidden, the margin is 0 for the whole mount.
  - F2 × I2 = 4, claude-read: After the reader resizes the window, raises the sheet from half to full height, or switches tabs while the document is still loading, pages are drawn only on entering the visible box, or with a margin sized for the old height, so more white faces flash while scrolling.
  - F3 × I2 = 6, claude-verify: The margin is not recomputed when the phone sheet changes height, the window is resized, or the reader leaves the tab before the first page's ratio resolves (the hidden scroller measures 0). The only effect is that fewer pages are pre-drawn, so white faces show briefly while scrolling.
- claude-read: On desktop the outline and the grid share one scroller, so following a distant page (step 9) scrolls the outline out of view when the reader presses an outline row or turns the page in the viewer.
  - F3 × I2 = 6, claude-read: A reader with a long outline who presses an outline entry sees the rail scroll to centre the target page's cell, and the outline they were using scrolls away.
  - F2 × I3 = 6, claude-verify: Only PDFs with an outline are affected (none exist in the test drives). On those, pressing an outline row whose page is far down scrolls the shared desktop scroller to centre that cell, and the outline leaves view until the reader scrolls back up.
- claude-read: Pages that enter the margin but have not finished rendering ('drawing') do not count toward the 120-page cap, and `drawn` can hold 121 pages for one painted frame before the eviction effect runs.
  - F1 × I1 = 1, claude-read: Fast scrolling through a long document can briefly hold more than 120 rasters in memory. Nothing visible changes.
  - F2 × I1 = 2, claude-verify: This only happens after scrolling past 120 pages in a long document. One frame may hold 121 drawn canvases, or more while pages are still in 'drawing', before eviction runs (useEffect runs after paint). The user sees nothing.

## Findings

A: 1
B: 0
C: 0

### claude-read:CR-1 — bucket A, LOW, open

Claim: When the 120-page cap evicts a drawn page, the eviction also deletes that page's kept proportion, so a page whose height ÷ width is more than 2% taller than page 1 shrinks its row back to the first page's proportion. When the page is redrawn, the row grows again. Both are height changes at a fixed rail width that do not happen on the page's first drawing.
Impact: Take a long document with an off-proportion page taller than page 1, for example a scan with a slightly taller page. Once the reader has scrolled far enough that more than 120 pages are drawn, the row holding that page changes height while it is off screen. Because the grid uses `items-start`, a row is as tall as its tallest cell. On engines without CSS scroll anchoring (iOS Safari, which the spec names), the visible thumbnails jump by that height difference during scrolling. The jump happens on eviction and again on the redraw.
Evidence: frontend/src/components/FileDetail/pdf/PdfPagesPanel.tsx:219-223: the eviction effect deletes evicted pages from `pageRatios`. `boxRatio` (lines 241-251) then falls back to `firstRatio` for those pages, so their `aspectRatio` style (line 342) changes. Spec §4 says the component keeps 'the proportions of drawn pages' for the mount. I8 permits a row height change only 'when such a page is first drawn'. The e2e cap test (pdf-pages-grid-desktop.spec.ts, the 120-page test) uses the fixture whose only off-proportion page, page 9, is landscape and therefore shorter. A shorter cell never sets its row's height under `items-start`, so the test cannot observe this.
Repro: not_reproduced. To reproduce by reasoning: build the long fixture with page 11 at 1.021× height (`pdf=long-near`), scroll from the first page to the last until page 11 is evicted, and compare the height of page 11's row before and after eviction. It shrinks by about 2% of a cell height. Scrolling back up regrows it.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the `pageRatios` entry when a page is evicted, and remove only its `drawn` and `entered` entries, so the box keeps the page's own proportion through eviction and redraw.

</details>

## Not verified

- claude-read: Nothing was executed. No unit test or Playwright spec was run, and the mutations described were reasoned through, not applied.
- claude-read: react-pdf's Document handling of `onLoadSuccess` and of rendering children when `src` changes (whether the old proxy can leak into the new keyed content) was not checked in its source.
- claude-read: frontend/src/lib/pdfController.ts was not read, including the order in which `src`, `numPages` and `page` update on a document change.
- claude-read: The behaviour of `scrollTop` after `display:none` in Safari and Firefox was not verified.
- claude-read: The design artboards under docs/process/reviews/feature-pdf-pages-grid/design/ were not opened.
- claude-verify: Nothing was run in a browser. CR-1 was traced statically through the code, with no e2e or unit test run.
- claude-verify: Did not read PdfPagesPanel.test.tsx, the e2e fixture builder, or the mobile spec in detail.
- claude-verify: Did not check how react-pdf's onRenderSuccess timing interacts with the eviction effect when many pages render at once.

TOTAL: 1 findings
