# Design check

at: d3216f508af71544c4968552e83450c4d1f2838c
design: docs/process/reviews/feature-enlarged-row-beside/design/ (A2 = BottomRow.dc.html)

## Decisions read from the design
- A2: artboard 1376x878, no left sidebar, canvas 16..976, inspector 384px at left 992 (BottomRow.dc.html:15, 67)
- A2: player frame 480x270 at left 16, top 72, radius 12 (BottomRow.dc.html:22)
- A2: row beside the frame, left 512, width 464 (frame right + 16 to canvas right), height 270 = frame height, items bottom-aligned (BottomRow.dc.html:27)
- A2: toggles are pills, height 32, padding 0 14, font 12px; selected = accent border, 600 weight, primary text; unselected = faint border, muted text, 500 (BottomRow.dc.html:29-32)
- A2: toggles group wraps upward (wrap-reverse), gap 8 (BottomRow.dc.html:28)
- A2: Enlarge panels is a 32px round icon button at the row's right end, accent border when pressed (BottomRow.dc.html:34-37)
- A2: panel starts 12px under the frame (354 = 342 + 12), full canvas width 960, radius 12, runs to the bottom of the screen (BottomRow.dc.html:41)
- A2: panel header 40px, title 13px/600, close button 32px at the right, hairline under (BottomRow.dc.html:42-45)
- A2: four toggles drawn (Detailed summary, Transcript, Scenes, Note); one panel open
- A2: dark theme surfaces (#131312 page, #272725 panel)
- Current: row under the frame (old layout, comparison only)

## Findings
### D-1 A2: toggles and Enlarge button are 44px under a coarse pointer, 32px in the design
- design: pills and Enlarge button 32px high/wide (BottomRow.dc.html:29, 35)
- implementation: fine pointer 32px (matches); coarse pointer pills and the round button are about 44px (r5/layout-13rem/beside-sidebar-open-1376x878-coarse-2panel.png; the row also gets taller than the design's 32px strip). Base min-height is 2rem (frontend/src/app/globals.css:1021); the coarse override is not in the design.
- visible: at a glance (coarse pointer only)

### D-2 A2: the design is drawn on a dark theme, R-5 screenshots are light
- design: page #131312, panel #272725, text #eeeeea (BottomRow.dc.html:15, 41)
- implementation: light page and a cream panel (r5/layout-13rem/beside-sidebar-open-1376x878-fine-1panel.png). Layout, not colours, was compared; the dark rendering of the beside state is not shown in R-5.
- visible: at a glance

### D-3 A2: four-toggle row not shown in R-5, cannot be checked
- design: four pills (Detailed summary, Transcript, Scenes, Note) in the 464px row, plus Enlarge (BottomRow.dc.html:29-32)
- implementation: only Transcript and Scenes exist in the data (decisions.md `pending`). Whether four pills fit the row or how they wrap with the 224px side space of the sidebar-open case is not shown.
- visible: not shown in R-5, cannot be checked

### D-4 A2: the shown beside state at the default width has a 224px row, the design's row is 464px
- design: row 464px wide, canvas 960 (BottomRow.dc.html:27)
- implementation: with the sidebar open (the default) the canvas is 720 and the row 224px wide; with two panels the row is full (Transcript, Scenes, Enlarge), and at 208px the pills stack in two lines (r5/layout-13rem/threshold-C704-side208-fine.png). The design draws the sidebar-closed width only; the sidebar-closed screenshot (r5/layout/beside-sbfalse-1376x878-fine-1panel.png) matches the design's geometry (frame 16, row 512..976, panel at 354).
- visible: at a glance (sidebar open only)

### D-5 A2: panel contents and inspector differ from the artboard
- design: Detailed summary panel with a skeleton body; inspector tabs Info / Chapters / Related / Ask (BottomRow.dc.html:68)
- implementation: Transcript / Scenes panels, inspector tabs Info / Related / Ask (r5/layout-13rem/...fine-1panel.png). This is the data (sample), listed for completeness.
- visible: side by side

TOTAL: 5 findings
