# Design check

at: 9e81059e3e34e964dc99da1807d83998d3fd75f3
design: docs/process/reviews/feature-dark-theme-neutral/design/

Scope per spec item 9: colour per surface, dark theme only. Layout, sizes, columns and copy are not compared.

## Decisions read from the design
- Neutral: page ground = #131312 (Neutral.dc.html:16)
- Neutral: header search field fill = #2f2f2c, placeholder/icon #a5a59f, input text #eeeeea (Neutral.dc.html:19-21)
- Neutral: primary button (upload) = coral #e85d5e, white text (Neutral.dc.html:23)
- Neutral: sidebar ground = #131312; selected row = #272725 with #eeeeea; inactive rows, heading, counts = #a5a59f; footer text = #8a8a84 (Neutral.dc.html:26-32)
- Neutral: header/content meta text = #a5a59f (Neutral.dc.html:37)
- Neutral: active chip ("すべて") = coral #e85d5e, white text; inactive chips = #2f2f2c with #eeeeea text (Neutral.dc.html:40-43)
- Neutral: file cards = #1c1c1b; title #eeeeea; meta #a5a59f (Neutral.dc.html:46-64)
- Neutral: card progress bar = coral #e85d5e (Neutral.dc.html:47)
- Neutral: selected card = coral 2px outline; raised #272725 fill is a sketch detail, not compared (Neutral.dc.html:66; spec item 9)
- Spec item 9 / I9: EPUB book surface = #131312

## Findings
### D-1 Folder view: file tiles paint no card fill
- design: file cards paint #1c1c1b (Neutral.dc.html:46, 50, 54, 58, 62)
- implementation: the video tiles in the Clips folder and the EPUB tile paint no background (rgba(0,0,0,0)); the page ground #131312 shows behind the thumbnail and caption. #1c1c1b is painted only by folder cards and the video detail inspector pane. The EPUB tile's media box is #272725. (shots/11-folder-progress-1280.png, shots/01-folder-grid-sidebar-1280.png; decisions.md:36, 54)
- visible: at a glance (in the design the caption sits on a lighter card; in the shots the caption sits directly on the page ground)

### D-2 Search field does not paint #2f2f2c at 1280
- design: search field fill #2f2f2c (Neutral.dc.html:19)
- implementation: the in-folder "Filter in this folder..." field paints #1c1c1b; the Search overlay input at 1280 has no fill over the modal's #131312. Only the 390 Search overlay input is the #2f2f2c pill. (shots/01-folder-grid-sidebar-1280.png, shots/02-search-field-filter-chip-1280.png, shots/09-search-field-filter-chip-390.png; decisions.md:38, 55)
- visible: at a glance (at 1280 the field is nearly the page colour; at 390 it is the lighter sand pill the design draws)

### D-3 Active chip is not coral
- design: active chip coral #e85d5e with white text (Neutral.dc.html:40)
- implementation: no coral chip on any captured screen. Active file-type filter is shown as #272725 on the toolbar Filter button; the Search overlay chip "Type Video" is #2f2f2c with no active/coral state. (shots/03-folder-filter-active-1280.png, shots/08-folder-filter-active-390.png, shots/02-search-field-filter-chip-1280.png; decisions.md:43, 56)
- visible: at a glance

### D-4 Selected card outline not shown in R-5
- design: selected card has a coral 2px outline (Neutral.dc.html:66)
- implementation: no screenshot shows a selected file card; decisions.md:45, 57 states it was not reachable. Not shown in R-5, cannot be checked.
- visible: not shown

### D-5 Primary button and card progress bar: no difference found
- Listed so the unmatched decisions above are the only ones. "Add" button measured #e85d5e with white text, card progress bar #e85d5e (decisions.md:42, 44; shots/11-folder-progress-1280.png). Sidebar ground, selected row #272725, primary text #eeeeea, muted #a5a59f and EPUB surface #131312 match the design values (decisions.md:34-41, 46; shots/01, 05). Not counted as findings.

TOTAL: 4 findings
