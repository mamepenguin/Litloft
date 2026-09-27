# R-0: Document viewers edge to edge, EPUB bar and panels (PR-B, feat/document-viewer-layout)

Declared with the spec `2026-09-27-document-viewer-layout.md`, revised after its
spec review (15 findings). Approved by the user 2026-09-27.

## Touch points

- `FileDetail/MediaCanvas.tsx` and `MediaPlayerBlock.tsx` (`data-bleed` on the
  wrapper); a document-viewer predicate in `lib/fileDetailShell.ts`;
  `app/globals.css` (the bleed rule, its `[data-sheet-snap]` and PDF-floor
  interplay).
- Not bled, keeps its card: `FileDetailCanvas` inside `FileDetailFullScreen`
  (collection / folder-play route).
- `PdfPreview.tsx` and `EpubPreview.tsx` keep their own `rounded-xl`; the bled
  radius comes from the `data-bleed` rule.
- `epub/EpubPreview.tsx`: the floating full-screen button removed, the panel
  container box, `panelStyle` (bar-height variable), bar props.
- `epub/EpubPositionBar.tsx`: two rows, quiet slider states, bubble, chapter
  marks, the full-screen button.
- `epub/EpubTocPanel.tsx`, `epub/EpubTypographyPanel.tsx`: placement classes
  only.
- `lib/epubToc.ts` if the marks' positions are computed there.
- `DESIGN.md` §5 exception.
- `messages-core` if a label changes (none planned).
- Tests: `EpubPreview.test.tsx`, `EpubPositionBar` tests, `epubToc` unit,
  `MediaCanvas` / file-detail tests, `e2e-epub` (desktop: bar, panels, marks,
  drag), `e2e-components` (Pixel 5 coarse and desktop: bar heights, coarse
  thumb, the bleed rule against the real stylesheet), `popup-dismissal.test.ts`.
- A real-device check: the panel container on the iOS simulator.
- Not touched: the reader (`public/epub-reader/*`), progress saving, seek
  semantics, PDF rendering and toolbar, video / image / archive layout.

## Invariants

1. On the file page, a PDF's and an EPUB's viewer box starts at the canvas
   column's top (never above it) and spans its full width, with 0 px radius,
   at every width; the sections below it keep the canvas padding; video,
   audio, image and archive boxes are where they were; on the collection route
   the viewers keep their card.
2. The bar's height is the same at rest, on hover, on keyboard focus and
   during a drag (20 + 40 px fine, 44 + 44 px coarse), so the book's frame does
   not change size between those states.
3. At rest on a fine pointer the slider draws no thumb and no accent colour;
   on hover, focus or drag it draws the accent thumb and track. On a coarse
   pointer a neutral thumb is drawn at rest. The slider's hit row is 20 px
   tall on a fine pointer and 44 px on a coarse one.
4. A drag shows the target chapter and percentage above the thumb, inside the
   bar's width; on release it sends exactly one seek to that fraction (at most
   one `turned` / WatchHistory write — none when it lands on the page shown);
   a cancelled drag sends none. The second row keeps the current place while
   dragging.
5. Chapter marks sit at top-level TOC fractions, mirrored for RTL, with none
   within 1/48 of an end or of the previous mark, and none at all when more
   than 24 remain.
6. Inline, the full-screen button is in the bar and nothing overlaps the
   book; in full screen the close button is where it was.
7. With the frame 512 px wide or more, an open panel is 320 px wide at the
   bottom-left above the bar; narrower, it spans the frame and touches the
   bar. In full screen it sits above the bar and never overlaps it. Either way
   it is inside the frame box and the close, Escape and focus behaviour is
   unchanged.
8. The bar's disabled buttons are drawn in the disabled colour, not
   translucent.
