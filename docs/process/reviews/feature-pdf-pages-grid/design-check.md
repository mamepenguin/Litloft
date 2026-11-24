# Design check

at: 69030ecb659375ee84e3ad1c1283f9ed13651fee
design: docs/process/reviews/feature-pdf-pages-grid/design/

## Decisions read from the design
- Main (384x820): grid columns = 3, `repeat(3, minmax(0,1fr))`, column-gap 8px, row-gap 12px, `align-items: start` (Main.dc.html:24)
- Main: grid inset = padding 12px (Main.dc.html:24); accepted as 24px in the spec's Checked, no action
- Main: cell = button, padding 4px, radius 8px, flex column, gap 6px, hover bg #f6f6f3 (Main.dc.html:14, 27)
- Main: picture = width 100%, aspect 1 / 1.414, white, radius 3px, 1px border rgba(145,145,140,0.4) (Main.dc.html:84-89)
- Main: current page = 2px #d63031 outline, offset 2px, on the picture only (Main.dc.html:89)
- Main: number = 12px monospace, 16px line, #62625b; current is weight 600 and #d63031 (Main.dc.html:91-93)
- Main: page 9 is landscape (1.414 / 1), shorter than its row, top-aligned (Main.dc.html:81, 84)
- Main: tab strip Info / Pages / Related / Ask, Pages underlined in accent (Main.dc.html:18-22); the grid runs to the bottom edge of the panel, `overflow: hidden; flex: 1` (Main.dc.html:24)
- Jump (384x820): 18 pages from 94, current 100 with the accent mark, three rows above it, current row near the middle of the rail (Jump.dc.html:75-77)
- Phone (390x844): 3 columns, same cell, sheet with a 36x4 handle and tab strip above the grid (Phone.dc.html:18-27)
- Wide, TwoCol, Current: comparison only, not checked.

## Screenshots compared
- Main: r5-main-1440x900-light.png (and dark), r5-userguide-1440x900-light.png, r5-hover-1440x900-light.png
- Jump: r5-jump-100-1440x900-light.png
- Phone: r5-phone-390x844-light.png, r5-phone-full-390x844.png, r5-phone-jump-100-390x844.png
- Landscape page: r5-landscape-1440x900.png

Matches seen: 3 columns, equal cells, 8px/12px gaps, 4px padding cells, white picture with a thin border, 3px radius, red 2px offset outline on the current picture, red semibold number, muted monospace numbers, hover surface (rgb 246,246,243 equals #f6f6f3), landscape page 9 shorter and top-aligned with the number just below it, Jump with rows 94-99 above and 100 near the centre, phone 3 columns with the current cell below the tab strip.

## Findings
### D-1 Main: the grid is cut off with a hard edge 16px above the panel's bottom
- design: the grid fills the artboard to its bottom edge; the last row runs off the edge (Main.dc.html:24, `flex: 1; overflow: hidden`, no bottom inset)
- implementation: the last visible row (pages 13-15) is cut at y about 884 and a blank 16px band shows below it before the window edge at 900 (r5-main-1440x900-light.png, r5-jump-100-1440x900-light.png, r5-landscape-1440x900.png); the scroller is the panel root inside the tabpanel's `p-4` (PdfPagesPanel.tsx:271, 460)
- visible: side by side

TOTAL: 1 findings
