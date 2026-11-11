# Design check

at: 0192b534c0f5d0aeb23411e4d1c46148dffe26fa
design: docs/process/reviews/feature-scene-timeline-width/design/

## Decisions read from the design
- Wide (720): frame width 720, padding 16, so content 688 (Wide.dc.html:23)
- Wide: columns = 5, window = 3 rows = 15 tiles (Wide.dc.html:121-122)
- Wide: grid repeat(cols, minmax(0,1fr)), gap 12px 8px (Wide.dc.html:56)
- Wide: tile 4:3, radius 8, label 12px centred under the tile (Wide.dc.html:59, 63)
- Wide: window start = 5*floor(idx/5) - 5, playing tile in the middle row (Wide.dc.html:123-125)
- Wide: ruler 44px high, tick labels 0:00 / 5:00 / 10:00 / 15:00 / 18:44, band covers the drawn window (Wide.dc.html:33-34, 47-52, 187, 204-205)
- Wide: scene card below grid, label 14px then text clamped to 2 lines, no reserved empty space (Wide.dc.html:68-76)
- Wide: header row, play-time ghost button left, "regenerate" ghost button right (Wide.dc.html:24-30, 78-91)
- Main (384): 3 columns, 9 tiles, same gaps, ruler, card, footer (Main.dc.html:56, 122, 161)

## Findings
### D-1 Wide: scene card reserves blank lines, so a one-line label leaves a gap before the text
- design: label and text are plain stacked spans with gap 4px, no min-height (Wide.dc.html:72-75)
- implementation: label has min-h-[2.4rem] and text min-h-[2.45rem] (ScenesSectionPresenter.tsx:535, 538). At 720 the label fits on one line and about one empty line shows between it and the text (docs/process/reviews/feature-scene-timeline-width/r5/full-sheet-720.png). At 390 the label wraps to two lines and the gap does not show.
- visible: at a glance

Checked and matching (no finding): 5 columns at 720 with 131px tiles, 4:3 tiles, gaps 12/8, 15-tile window with the playing tile in the middle row and the same first tile (4:42), ruler height and tick labels, band over the drawn tiles, header, footer buttons (full-sheet-720.png); 3 columns, 9 tiles at 384/390 (desktop-384.png, sheet-390-expanded.png).

Not shown against a design: 600 px (4 columns) and 740x390 landscape (5 columns) have no artboard; only the formula is in the spec. Not checkable against the design.

TOTAL: 1 findings
