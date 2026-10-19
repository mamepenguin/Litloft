# R-0: No empty band under a document viewer (fix/viewer-bottom-gap)

Declared with the spec `2026-09-27-viewer-bottom-gap.md`. Approved by the user 2026-09-27.

## Touch points

- `FileDetail/MediaCanvas.tsx` host classes; `FileDetailSkeleton.tsx` (same host).
- `app/globals.css`: the bled host's bottom padding.
- Layout fixtures restating the host classes: `e2e-layout/fixtures/mobile-inspector-sheet.html`, `pseudo-fullscreen.html`, and the parity test in `MediaShell.test.tsx`.
- Tests: an `e2e-components` measurement against the real stylesheet.
- Not touched: the viewers, the bleed margins, the resting strip, `useFillHeight`.

## Invariants

1. With nothing shown below it, a PDF's or an EPUB's viewer ends exactly at the canvas's scrollable bottom (on a phone, where the resting strip begins).
2. With a section shown below a bled viewer, that section is 16 px below the viewer and has 16 px of padding under it.
3. For video, image and archive, the gap between the player and a visible section below is 16 px and the canvas keeps 16 px of bottom padding.
4. A hidden or absent box between or after the canvas's children adds no space.
