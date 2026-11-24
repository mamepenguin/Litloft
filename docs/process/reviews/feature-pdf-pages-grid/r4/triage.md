# Triage: r4

## Trajectory

This run:
- claude-read: Read in order, the rounds are: r1→r2, 6c2df3e38 (product): it removed a branch, so the eviction stopped deleting `pageRatios`. r2→r3, 85e72d6cc (test only): it added `intersectPages`, which delivers many intersections in one callback, plus 8e358b827 (INDEX status only). r3→r4, be85848f7 (review docs only; its diff was not shown) and d49bdb3fb. d49bdb3fb changes one hook kind in the product code: the cap-eviction effect at PdfPagesPanel.tsx:199 moves from `useEffect` to `useLayoutEffect`. It adds no branch, no state and no prediction; the body of the effect is the same. In the test, `ready()` (PdfPagesPanel.test.tsx:329-340) adds a wait until a fake observer watches a cell. No product round adds a branch, state or prediction that an earlier round also added, so the product design is not being patched. One pattern is worth recording. Every round since r1 has touched the 120-page cap: its ratio bookkeeping in r1→r2, its test delivery timing in r2→r3, and its commit timing plus the test harness's observer timing now. Twice in a row the test harness's intersection timing has been adjusted (`intersectPages`, then the `ready()` wait). These are changes to the harness, not to the design.

Earlier runs:
- r2 / claude-read: There has been one fix round since r1: 6c2df3e38, followed by the docs-only commit 5053f4bbb. The round removed a branch and added no branch, state or prediction. It deleted the `setPageRatios` deletion from the eviction effect (PdfPagesPanel.tsx:197-219 now calls only `setDrawn` and `setEntered`), so a page's kept proportion now lives for the whole mount, as spec §4 says. It also added one unit test that pins the behaviour. With only one round there is nothing to compare it to, and the round simplifies the design rather than patching it.
- r3 / claude-read: There have been two fix rounds since r1. The first (6c2df3e38, with docs 5053f4bbb, reviewed in r2) removed a branch: the eviction effect stopped deleting `pageRatios`. The round since r2 is 8e358b827, which only changes the status in docs/specs/INDEX.md, and 85e72d6cc, which only changes a test. 85e72d6cc adds the `intersectPages` helper (PdfPagesPanel.test.tsx:238-259) and uses it in the two cap tests (527, 542) in place of 125 single-entry callbacks. Neither round adds a branch, state or prediction to the product code. PdfPagesPanel.tsx is unchanged since r2. The design is not being patched. The latest round only changes how the test delivers intersections.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — full: Read lines 1-160 at HEAD, which hold both changed hunks (the import at 26 and the PDF_BYTES selection at 140-146) with their context.
- frontend/e2e-components/fixtures/pdfPagesGrid.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid-scrollbar-desktop.spec.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/pdf-pages-grid.measure.ts — full: A new file, read in full from the diff.
- frontend/e2e-components/projects.ts — full: Read the whole file at HEAD.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read lines 140-199 at HEAD: the changed AT_THE_DESKTOP_WIDTH additions and the consistency test that checks them against DESKTOP_ONLY.
- frontend/src/components/FileDetail/pdf/PdfPagesPanel.tsx — full: Read lines 95-274 at HEAD, which hold the changed eviction effect (197-221) and all the hooks and helpers around it. The rest (the render body, helpers and PdfPagesTab) was read from the full diff.

Test files:
- frontend/src/components/FileDetail/pdf/__tests__/PdfPagesPanel.test.tsx — partial: Read lines 300-559 at HEAD, which include the changed `ready()` helper (329-340) and the cap tests. The other hunks were read from the full diff.

## Unspecified behavior, recorded

- claude-read: The drawing margin (half the scroller's visible height) is computed once, when the IntersectionObserver is created (dependencies `[firstRatio, state.numPages]`, PdfPagesPanel.tsx:134-157). It is not recomputed when the window is resized or the phone sheet changes height.
  - F2 × I2 = 4, claude-read: After a resize or a change in sheet height, thumbnails start drawing earlier or later than the half-height rule says, so white faces show briefly while scrolling.
  - F3 × I1 = 3, claude-verify: Confirmed at PdfPagesPanel.tsx:139-151: the rootMargin is computed once when the observer is created (deps [firstRatio, state.numPages]), so after the window is resized or the phone sheet changes height, pages start drawing a little earlier or later than half a visible height away; at worst the user sees a brief white placeholder before a thumbnail appears, because cells still draw once they intersect the visible box.
- claude-read: Cells in `drawing` do not count toward the 120-page cap (PdfPagesPanel.tsx:200 reads only `drawn.size`). A fast scroll can therefore mount more than 120 `<Page>` renders before eviction trims `drawn`; the layout-effect change only removes the one-frame overshoot of `drawn` itself.
  - F2 × I1 = 2, claude-read: Flinging through a long PDF briefly holds more rasters in memory than the cap. Nothing visible changes.
  - F3 × I2 = 6, claude-verify: Confirmed at PdfPagesPanel.tsx:200 and 313-321: eviction checks only drawn.size, and cells in `entered` mount a <Page> without counting against the cap, so a fast fling through a long PDF's rail starts renders for every page passed; pdf.js then does wasted work and the rail may lag briefly before eviction brings drawn back to 120, but nothing visible is wrong and I3's cap on `drawn` still holds.
- claude-verify: If firstRatio resolves while the Pages tab has already been switched away (hidden, zero-size scroller rect), the drawing margin computed at PdfPagesPanel.tsx:139-141 is 0 for the rest of the mount, so pages draw only when they actually enter the visible box.
  - F1 × I1 = 1, claude-verify: Switching tabs within the moment between opening Pages and the first page's proportion loading leaves pages popping in on scroll instead of being pre-drawn half a screen ahead; nothing is lost.
  - single-scored

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: Nothing was executed. The vitest suite and the Playwright specs were not run, and the revert mutation was reasoned through, not applied.
- claude-read: I relied on React 19's documented behaviour that updates scheduled in a layout effect are processed synchronously before paint; I did not read the react-dom source.
- claude-read: The diff of be85848f7 (review docs) was not shown and was not inspected.
- claude-read: The design artboards and pdfController.ts were not opened.
- claude-read: The e2e files other than inspectorResponsive.tsx, projects.ts and the hunk of spec-viewport.spec.ts were read from the diff, not reopened at HEAD.
- claude-verify: The e2e-components fixture and spec (column counts, centring, scrollTop preservation) were not read or run.
- claude-verify: Real browser timing of layout-effect eviction compared with paint was not observed; I cannot run commands.
- claude-verify: DESIGN.md, InspectorShell.tsx and MobileInspectorSheet.tsx were not re-read.

TOTAL: 0 findings
