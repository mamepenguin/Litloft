# Design check

at: c34930c5ba4887b17502d288e51367e9355d7220
design: docs/process/reviews/feature-player-workbench/design/

## Decisions read from the design
- Main (1440x900, panels shown): content padding = 16px, vertical gap between frame, row and panels = 10px (Main.dc.html:43)
- Main: frame centred, 16:9, 704x396 with panels / 1024x576 with none, radius 12px (Main.dc.html:46, 234-235)
- Main: row directly under frame; toggle chips left (32px high, 16px radius, 12px text, selected = accent border + bold), a "引用" labelled pill pushed to the right end of the row (Main.dc.html:59-65, 204)
- Main: panel region fills the rest, panels side by side (flex 1 1 0, gap 12px), each with 40px header (h2 13px/600 + close button) and a body that scrolls inside itself (Main.dc.html:68-75)
- Main: panel region has no minimum height (flex:1; min-height:0) (Main.dc.html:68)
- Main: up to two panels at once (Main.dc.html:193-194)
- AOff (no panel): player at full size (1024x576), toggle row directly under it (AOff.dc.html:17, Main.dc.html:234). This is D5.
- Main: right inspector 384px, tabs 情報 / チャプター / 関連 / Ask, then title, actions, tag, AI summary, comments (Main.dc.html:134-174)
- Main: a 48px breadcrumb/title bar with find and inspector-toggle icons sits above the content, under the 56px header (Main.dc.html:33-41)

## Screenshots used
Nearest width available is 2400px (design is 1440px). Short-window states only (H 592 / 392 / 312). No screenshot has two panels, the enlarge value on, a wrapped row, or a tall (900px) window. All under docs/process/reviews/feature-workbench-no-page-scroll/r5-screens/.

## Accepted by the user (not new)
- D5 (no panel shown: frame is smaller than the design's full-size frame so the row stays on screen; the 48px peek is gone). Seen in nopanel-600.png, nopanel-320.png (frame 512 / 232px high, 1rem gap to the row). Listed once as accepted, not counted.

## Findings
### D-1 Main / AOff: the "引用" pill at the row's right end is not in the row
- design: labelled pill "引用" at the right end of the toggle row, in both panel and no-panel states (Main.dc.html:63-64)
- implementation: the row has toggle chips only on the left. With a panel shown, the right end holds a single unlabelled icon button (panel/layout icon) instead (r5-screens/panel-600.png, panel-320.png); with no panel, nothing is at the right end (nopanel-600.png). A quote icon appears in the inspector action row instead (panel-600.png at the inspector).
- visible: at a glance

### D-2 Main: gap between frame and row is larger than the design's
- design: 10px between frame, row and panel region (Main.dc.html:43)
- implementation: frame bottom to row top is 1rem (16px), row to panel is about 12px (panel-600.png: frame ends y=368, chips start 384, panel starts 428; spec I3 and 0.75rem gap, spec.md:221, 47)
- visible: only by measuring

### D-3 Main: video frame corner radius
- design: 12px radius on the frame (Main.dc.html:46)
- implementation: frame corners look square in panel-600.png and nopanel-600.png (frame edge is sharp against the white canvas). Code not read.
- visible: side by side

### D-4 Main: breadcrumb/title bar is not a separate 48px row and its right-hand tools differ
- design: separate 48px row under the 56px header with a breadcrumb, find icon and inspector-toggle icon (Main.dc.html:33-41)
- implementation: a single top bar holds the breadcrumb and a larger set of icons (file, search, edit, quote, profile, inspector toggle); there is no second row (r5-screens/panel-600.png)
- visible: at a glance

### D-5 Main: inspector tab set and content
- design: tabs 情報 / チャプター / 関連 / Ask, followed by the AI summary section and the comments section (Main.dc.html:135-173)
- implementation: tabs Info / Related / Ask (no Chapters), no AI summary section, Comments is a collapsed row (r5-screens/panel-600.png). The test file may simply have no chapters or summary; not distinguishable from the screenshot.
- visible: at a glance

### D-6 Main: two side-by-side panels not shown
- design: two panels at once, side by side, each 40px header with title and close (Main.dc.html:68-75, 185)
- implementation: only one panel (Transcript) was captured; two panels and the 41rem side-by-side form are not shown in R-5, cannot be checked (decisions.md:7)
- visible: not shown in R-5

### D-7 Enlarge state, wrapped row, Find open, tall window not shown
- design: Main.dc.html at 1440x900 (frame 704x396 with panels)
- implementation: R-5 shows only H 592/392/312 at 2400px wide; no 900px-high capture, no enlarge-on state (decisions.md:8 "Not run"). Cannot be checked against the design's proportions (frame height share of window, panel size).
- visible: not shown in R-5

### D-8 Main: panel body at the shortest height
- design: panel keeps a 40px header and a scrolling body (Main.dc.html:71-75)
- implementation: at H=312 the panel is 56px high: its header plus about 24px of body, with a sub-tab row clipped (r5-screens/panel-320.png). The design draws no state this short; the body is only a sliver.
- visible: at a glance

TOTAL: 8 findings
