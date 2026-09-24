# PR #368 invariants (R-0, approved with the design 2026-09-24)

1. Redrawing a page at a new scale or pixel ratio does not call `page.cleanup()` and does not request its operator list again.
2. A page in no viewer's keep set has its canvases released (width/height 0) and `page.cleanup()` called.
3. While a page is re-rastered after a zoom, the page on screen is never blank.
4. When the page on screen fails to render, `pdfRenderTooLarge` is shown, as before this change.
5. No prefetch render starts before the page(s) on screen have rendered (or failed).
6. Turning to a prefetched page shows it without a new render.

## Added after round 1 (approved by the user 2026-09-24)

7. Every page on screen is eventually drawn, or its failure is shown.
8. A page on screen holds one full-size canvas once drawn, and at most two (the picture on show plus the new size) while it is redrawn.
9. A picture that cannot reach the screen is reported as a render failure (`pdfRenderTooLarge`), not as a success.
