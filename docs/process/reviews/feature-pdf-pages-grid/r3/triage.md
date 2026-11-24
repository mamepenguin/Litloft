# Triage: r3

## Trajectory

This run:
- claude-read: There have been two fix rounds since r1. The first (6c2df3e38, with docs 5053f4bbb, reviewed in r2) removed a branch: the eviction effect stopped deleting `pageRatios`. The round since r2 is 8e358b827, which only changes the status in docs/specs/INDEX.md, and 85e72d6cc, which only changes a test. 85e72d6cc adds the `intersectPages` helper (PdfPagesPanel.test.tsx:238-259) and uses it in the two cap tests (527, 542) in place of 125 single-entry callbacks. Neither round adds a branch, state or prediction to the product code. PdfPagesPanel.tsx is unchanged since r2. The design is not being patched. The latest round only changes how the test delivers intersections.

Earlier runs:
- r2 / claude-read: There has been one fix round since r1: 6c2df3e38, followed by the docs-only commit 5053f4bbb. The round removed a branch and added no branch, state or prediction. It deleted the `setPageRatios` deletion from the eviction effect (PdfPagesPanel.tsx:197-219 now calls only `setDrawn` and `setEntered`), so a page's kept proportion now lives for the whole mount, as spec §4 says. It also added one unit test that pins the behaviour. With only one round there is nothing to compare it to, and the round simplifies the design rather than patching it.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — full: Read lines 1-170 at HEAD, which hold both changed hunks (the import at 26 and the PDF_BYTES selection at 140-146), with their context.
- frontend/e2e-components/fixtures/pdfPagesGrid.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-scrollbar-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid.measure.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/projects.ts — full: Read the whole file at HEAD.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read only the changed hunk (the AT_THE_DESKTOP_WIDTH additions near line 157) from the diff; the rest of the file was not opened this round.
- frontend/src/components/FileDetail/pdf/PdfPagesPanel.tsx — full: Read the whole file, lines 1-457, at HEAD.

Test files:
- frontend/src/components/FileDetail/pdf/__tests__/PdfPagesPanel.test.tsx — full: Read the whole file, lines 1-740, at HEAD, including the new intersectPages helper and the two cap tests that use it.

## Unspecified behavior, recorded

- claude-read: The drawing margin (half the scroller's visible height) is computed once, when the IntersectionObserver is created (dependencies `[firstRatio, state.numPages]`, PdfPagesPanel.tsx:134-157), and is never recomputed when the window is resized or the phone sheet changes height.
  - F2 × I2 = 4, claude-read: After a resize or a sheet height change, thumbnails start drawing earlier or later than the half-height rule says, so white faces show briefly while scrolling.
  - F3 × I1 = 3, claude-verify: Confirmed at PdfPagesPanel.tsx:139-151: `half` is taken from the scroller rect once per observer creation (deps `[firstRatio, state.numPages]`), so resizing the browser window or changing the phone sheet's height leaves the pre-draw margin sized for the old height, and the user only sees thumbnails start drawing slightly earlier or later than intended; the cells inside the visible box are still drawn.
- claude-read: Cells in `drawing` do not count toward the 120-page cap (PdfPagesPanel.tsx:198 reads only `drawn.size`), so a fast scroll can mount more than 120 `<Page>` renders before eviction trims `drawn`.
  - F2 × I1 = 2, claude-read: Flinging through a long PDF briefly holds more rasters in memory than the cap. Nothing visible changes.
  - F3 × I2 = 6, claude-verify: Confirmed at PdfPagesPanel.tsx:198 and :319: the cap counts only `drawn`, and every `entered` (drawing) cell mounts a `<Page>`, so quickly flinging through a 200+ page PDF can start a render of nearly every page before eviction trims `drawn` back to 120; the user sees at most a brief CPU and memory spike from small 128px canvases, and nothing is displayed wrongly.
- claude-verify: A cell in `drawing` that is scrolled far away before its render finishes is not cancelled. It stays in `entered` and keeps its `<Page>` mounted until the render finishes, and only then becomes eligible for eviction (PdfPagesPanel.tsx:216-218 evicts only members of `drawn`).
  - F3 × I1 = 3, claude-verify: Fast scrolling through a long PDF finishes renders for pages that are already off screen, which costs some background work and nothing visible.
  - single-scored

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: Nothing was executed: the vitest suite and the Playwright specs were not run. The claim that the batched cap tests finish within the CI timeout is not verified.
- claude-read: I did not check how React batches 125 setState calls from one observer callback inside act() beyond reading the code. My trace of eviction order relies on effect order following mount order.
- claude-read: The e2e files were read from the diff rather than reopened at HEAD. spec-viewport.spec.ts was read only at its changed hunk.
- claude-read: I did not open the design artboards or pdfController.ts.
- claude-verify: I did not run the code. Every behavior was judged by reading PdfPagesPanel.tsx alone.
- claude-verify: I did not check whether the phone sheet can change height while mounted (MobileInspectorSheet.tsx not read), which affects how often entry 0 triggers.
- claude-verify: I did not measure the peak number of concurrent `<Page>` renders during a fast scroll.

TOTAL: 0 findings
