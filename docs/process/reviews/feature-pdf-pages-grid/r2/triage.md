# Triage: r2

## Trajectory

This run:
- claude-read: There has been one fix round since r1: 6c2df3e38, followed by the docs-only commit 5053f4bbb. The round removed a branch and added no branch, state or prediction. It deleted the `setPageRatios` deletion from the eviction effect (PdfPagesPanel.tsx:197-219 now calls only `setDrawn` and `setEntered`), so a page's kept proportion now lives for the whole mount, as spec §4 says. It also added one unit test that pins the behaviour. With only one round there is nothing to compare it to, and the round simplifies the design rather than patching it.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — full: Read lines 1-160, which hold both changed hunks (the import at 26 and the PDF_BYTES selection at 140-146), with their context.
- frontend/e2e-components/fixtures/pdfPagesGrid.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-scrollbar-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid.measure.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/projects.ts — full: Read the whole file.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read the changed hunk and the consistency test that uses AT_THE_DESKTOP_WIDTH (lines 103-188) through a grep with context.
- frontend/src/components/FileDetail/pdf/PdfPagesPanel.tsx — full: Read the whole file, lines 1-457, at HEAD.

Test files:
- frontend/src/components/FileDetail/pdf/__tests__/PdfPagesPanel.test.tsx — full: Read every changed hunk from the diff and lines 340-519 at HEAD, including the new eviction test.

## Unspecified behavior, recorded

- claude-read: The drawing margin (half the scroller's height) is computed once, when the IntersectionObserver is created (dependencies `[firstRatio, numPages]`), and is never recomputed when the window is resized or the phone sheet changes height.
  - F2 × I2 = 4, claude-read: After the reader resizes the window or raises the sheet, pages are pre-drawn with a margin sized for the old height, so more white faces flash briefly while scrolling.
  - F3 × I1 = 3, claude-verify: Confirmed at PdfPagesPanel.tsx:139-157. The rootMargin uses the scroller's visible height when the observer is created, and the dependencies are only [firstRatio, state.numPages]. Resizing the window, or a phone sheet that is still moving when the rail mounts, leaves the pre-draw margin too large or too small. The only effect is that thumbnails start drawing a little earlier or later than intended; pages inside the visible box still intersect and are drawn.
- claude-read: Cells in `drawing` (entered the margin but not yet rendered) do not count toward the 120-page cap. Only `drawn` cells are evicted, so a fast scroll can mount more `<Page>` renders than the cap for a while.
  - F2 × I1 = 2, claude-read: Fast scrolling through a long PDF can briefly hold more than 120 rasters in memory. Nothing visible changes.
  - F3 × I2 = 6, claude-verify: Confirmed at PdfPagesPanel.tsx:197-219 and 311-319. The cap check reads only `drawn.size`, and an `entered` page leaves only through eviction or failure. A fast scroll through a 200+ page PDF can therefore mount more than 120 <Page> renders at once. The user may see a short CPU or memory spike and slower drawing, and the effect trims the drawn set back to 120 once those renders finish.
- claude-verify: A page enters `entered` when it intersects the extended box and only leaves through eviction or failure (PdfPagesPanel.tsx:148, 218, 260). Scrolling past a page without stopping still commits it to a full render.
  - F3 × I2 = 6, claude-verify: Flinging the rail of a long PDF queues renders for every page passed over, so the pages the user lands on can be drawn later than they would otherwise be.
  - single-scored

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: Nothing was executed. No unit test or Playwright spec was run, and the mutation against the new test was reasoned through, not applied.
- claude-read: Did not verify that jsdom's CSSStyleDeclaration keeps `aspect-ratio`. The test's exact-string assertion would fail rather than pass vacuously if it did not.
- claude-read: Did not open the design artboards or the R-5 screenshots added in 5053f4bbb.
- claude-read: Did not re-check react-pdf's `onRenderSuccess` payload (`originalHeight`/`originalWidth`) in this round; I relied on r1's reading.
- claude-verify: Rendering behaviour in a real browser: I could not run the code or the tests.
- claude-verify: The e2e fixture and spec under frontend/e2e-components/.
- claude-verify: The details of the MobileInspectorSheet animation and its height when the rail mounts.
- claude-verify: PdfPagesPanel.tsx outside lines 100-339 (the helpers scrollerOf, visibleBox and the visibility hook).

TOTAL: 0 findings
