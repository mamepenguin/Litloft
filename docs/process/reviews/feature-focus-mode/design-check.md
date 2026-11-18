# Design check

at: 7f4e1122ec79997886ac1ab33feaff87f27b507f (from decisions.md; the review request names 820eee803 as the implementation commit, the two differ)
design: docs/process/reviews/feature-focus-mode/design/

## Decisions read from the design
All artboards import Main.dc.html with props; values are in Main.dc.html.
- Main (normal 1440x900, inspector): sidebar 240px (:19), header 56px (:211), inspector 384px (:139), canvas 816 wide, video frame 784 wide at 16px padding (:80,:191-196), Transcript/Scenes pill buttons 32px high under the video (:91-94), inspector tabs Info/Related/Ask 34px with 2px accent underline (:140-143)
- Focus1440 / Focus1440Closed: no sidebar, no header, canvas 1440x900 minus inspector (384, or 0 when closed); video 1024x576 at 16px padding (:182-196); inspector stays and starts at y=0 (:139)
- Normal1280 / Focus1280: 1280x800 normal and focus (props only; same code)
- ExitReveal (A, recommended): header overlaid at top 0, 56px, shadow `0 6px 20px rgba(0,0,0,.5)`, with menu and tree buttons at left (:36-43,:208-211); the focus button shown pressed (#262626) (:60,:213); 8px hot zone at the top (:69); the page does not shift
- ExitFloat (B): floating button group top-right (:128-135); alternative, not the chosen one
- Touch (1180x820, coarse): 88x44 transparent button at top centre, 56x22 pill with a down chevron, padding-top 6px, no strip (:73,:218)
- Pdf focus: toolbar 40px (margin 12px 0 15px) with page nav and zoom, text-only, no divider line; page 900px wide centred, 1300px tall, runs to the bottom edge (:99-109,:198-199)
- Collection normal (surface=collection): no sidebar, no item list; header has menu button (no tree button), "‹ 戻る" text, breadcrumb (:36-46,:182); video 1088 wide centred, margin-top 40px, then caption lines and a 20px/700 title (:112-126,:202-205)
- CollectionFocus: same content as Collection, header hidden, no sidebar
- Colours: dark theme, background #161616, text #ededed, muted #a3a3a3 (:221)

## Findings
### D-1 Collection normal: item list and header differ from the design
- design: the collection surface has no left pane at all; header shows menu button, "‹ 戻る", breadcrumb, and no tree button (Main.dc.html:36-46,:182)
- implementation: a 280px item list (numbered rows with up/down/trash controls) fills the left, the tree-toggle button is shown pressed in the header, there is no "‹ 戻る" (r5/collection-normal-tree-1440x900.png). Spec line 18/62 treats the item list as the left pane, but the design artboard does not draw it.
- visible: at a glance

### D-2 Collection revealed header: no "‹ 戻る", extra tree button
- design: revealed header on the collection surface = menu button, "‹ 戻る", breadcrumb (Main.dc.html:36-46)
- implementation: menu button, tree button, breadcrumb; no "‹ 戻る" (r5/collection-focus-revealed-tree-1440x900.png)
- visible: at a glance

### D-3 Collection focus: content is not the design's wide video layout
- design: video frame 1088px wide centred, 40px top margin, caption and 20px bold title below (Main.dc.html:112-126)
- implementation: sample item is audio, so a 48px icon, file name and an audio bar centred at about 66px from the top (r5/collection-focus-tree-1440x900.png). A collection with a video item at the design's width is not shown in R5, so the 1088px frame cannot be checked.
- visible: at a glance (partly sample data; the video case is not shown in R5)

### D-4 PDF: viewer does not fill the canvas height, and toolbar is heavier
- design: page runs to the bottom edge; toolbar is plain text controls, 40px, no divider (Main.dc.html:100-108)
- implementation: the viewer ends at y=775 in focus (y=831 in normal) and a blank white band sits below (r5/pdf-focus-1440x900.png, r5/pdf-normal-1440x900.png); toolbar is a 55px bar with a bottom border, a "Fit width" pill, and extra fullscreen and open-external icons. The band is larger in focus (125px) than in normal (69px).
- visible: at a glance (the band); side by side (toolbar)

### D-5 Theme: implementation shots are light, design is dark
- design: #161616 background, #ededed text (Main.dc.html:221)
- implementation: white background and dark text in every R5 shot (e.g. r5/video-focus-1440x900.png). Not checked whether this is the viewer's theme setting; the design draws no light variant.
- visible: at a glance

### D-6 Touch handle: pill colour follows the light theme
- design: pill rgba(38,38,38,.86) with a light chevron, 1px light border (Main.dc.html:73)
- implementation: pale grey pill with a dark chevron, 88x44 hit area and 56x22 pill at the top centre, over the video (r5/touch-focus-handle-1180x820.png). Size and position match; only the colour differs, tied to D-5.
- visible: side by side

### D-7 Focus at 1280x800 and inspector-closed focus: not shown in R5, cannot be checked
- design: Focus1280 (864x486 video), Focus1440Closed (video without inspector, 1408 wide capped by height) (Main.dc.html:191-196)
- implementation: no screenshot at 1280x800 and none with the inspector closed under r5/. decisions.md states 864x486 at 1280x800 by measurement only.
- visible: not shown in R5, cannot be checked

### D-8 Collection and PDF/EPUB/HTML/markdown revealed at touch width, and ExitFloat: not shown
- design: Touch artboard only draws the video surface; the implementation shows touch for video and markdown safe-area only, so the touch handle on a collection page is not shown in R5. ExitFloat (B) is not the chosen option and is not drawn in R5 (no finding beyond noting it).
- visible: not shown in R5, cannot be checked

TOTAL: 8 findings
