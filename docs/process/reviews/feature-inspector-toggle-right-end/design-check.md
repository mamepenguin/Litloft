# Design check

at: a8f25e3fa344eaa3bba9e2cdfef08ba37e1523d1
design: docs/process/reviews/feature-inspector-toggle-right-end/design/

## Decisions read from the design
- Main (1280): header height = 56px, bottom border rgba(145,145,140,.2) (Main.dc.html:22)
- Main: order after the trail = file controls (2 x 32px icon buttons: in-file search, download), divider, search (36px), quick note (36px), avatar (32px), divider, inspector toggle (32px, 16px icon) (Main.dc.html:33-40)
- Main: group gap = 4px; right padding = 16px; the toggle is the last control (Main.dc.html:32)
- Main: divider = 1px x 20px, margin 0 8px (so 12px to each neighbour), colour rgba(145,145,140,.35) (Main.dc.html:17)
- Main: toggle open = right-panel icon with chevron, aria-pressed=true; closed = right-panel icon without chevron (Main.dc.html:40, ACompare.dc.html:41)
- Main: inspector pane = 384px wide at the right, with Info/Search/Comments pill tabs, a 18px/600 title, a size line, metadata rows and tag chips (Main.dc.html:49-62)
- Main: the tree button is drawn inside the header at left 60px (Main.dc.html:24)
- ACompare: the folder header (second header) ends at the avatar, with no divider and no toggle. Search, quick note and avatar sit further right than on the file header (ACompare.dc.html:44-53)
- AStacked (1000px wide): the toggle uses the bottom-panel icon (`M3 15h18` plus a down chevron). The player sits in a 380px area and the inspector is a full-width section below it, with tabs at 24px padding, a title row and metadata rows (AStacked.dc.html:38-59)
- AStacked: the stacked state is shown at 1000px wide (AStacked.dc.html:21)

## Findings
### D-1 Main / AStacked: the design's file-kind controls are missing between the trail and the first divider
- design: two 32px icon buttons (in-file search, download) sit between the trail and the first divider (Main.dc.html:33-34, ACompare.dc.html:34-35, AStacked.dc.html:31-32)
- implementation: the trail runs straight into the first divider, with nothing between them (shots/05-1280-video-beside-open.png, shots/09-900-video-stacked-open.png). decisions.md item 10(a) acknowledges this as "the running header has none for a video". The spec does not attribute it to a human decision.
- visible: at a glance

### D-2 AStacked: the stacked inspector is drawn at a different width
- design: the stacked state is shown at a 1000px artboard (AStacked.dc.html:21)
- implementation: at 1000px the app draws the inspector beside the player (shots/07-1000-video-beside.png, per decisions.md item 3). Stacking starts below 968px, and the nearest stacked shot is 900px (shots/09-900-video-stacked-open.png).
- visible: side by side

### D-3 Main / AStacked: the inspector's contents differ
- design: tab pills Info/Search/Comments, an 18px/600 title, a "12:34 · 1.2 GB" line, Updated and Resolution rows, and tag chips (Main.dc.html:50-61, AStacked.dc.html:47-58). Beside, the pane has a left border and the tabs row has a bottom border.
- implementation: no tabs. A title with an inline duration, then Like / Favorites / Verified / "more" actions, an Add tag link, then a Comments accordion (shots/05-1280-video-beside-open.png, shots/09-900-video-stacked-open.png). This is carried over from today's inspector and is not part of this change, but it is a visible difference from the artboards. decisions.md item 10(c) acknowledges it. The spec does not attribute it to a human decision.
- visible: at a glance

### D-4 Main / ACompare: the divider colour is lighter
- design: `rgba(145,145,140,.35)` for both dividers (Main.dc.html:17). The design draws the header bottom border at .2.
- implementation: dividers are `rgba(145,145,140,.2)`, the same as the header's bottom border (decisions.md item 1 reports it as `bg-border`). The spec says `bg-bg-border`, so this is a mismatch between design source and spec.
- visible: only by measuring

### D-5 Main: the avatar's left gap is smaller
- design: the avatar has `margin-left:2px` on top of the 4px gap, so quick note to avatar is 6px (Main.dc.html:18)
- implementation: Quick note 1137..1171, avatar 1175..1207, so the gap is 4px (decisions.md item 1)
- visible: only by measuring

### D-6 Main: the tree button is not part of the header
- design: the tree button is in the header box at left 60px (Main.dc.html:24)
- implementation: menu (12..52) and tree (60..100) sit in the app bar outside `<header>` (decisions.md item 1). Visually the same place, and the header's own box starts at x=240 when the sidebar is open.
- visible: not noticeable on screen. Listed because it is a structural difference.

TOTAL: 6 findings
