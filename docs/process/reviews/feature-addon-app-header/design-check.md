# Design check

at: d4c73ac5d2fce3b5da754748da3e9d7aca77ef69
design: docs/process/reviews/feature-addon-app-header/design/

Artboards draw Photo Diary; the screenshots are Video and Reading (the spec says so, spec line ~221). Compared structure and values, not the app name or sample data. Screenshots used: `r5-` (375) and `r4-` (640/1280) sets, with `r5-artboard-*.png` as the artboard renders. D-1 to D-11 are carried over from the previous check (accepted by id) and re-measured on the r5 shots; all still hold. The menu and Manage dialog (D-4, D-5, D-6) are not in the r4/r5 sets, so their evidence is the earlier `r2-` / first-run shots; the later runs did not change them as far as decisions.md says.

## Decisions read from the design
- Phone 375: top bar 48 px, menu button only (Phone.dc.html:18)
- Phone 375: header padding 8px 16px 0; icon tile 40x40 r12 #f6f6f3, `align-items:center` against the title+scope block (Phone.dc.html:22-23)
- Phone 375: h1 24px/1.35 700 nowrap ellipsis; scope row margin -6px top/bottom, so scope sits about 32 px under the title centre (Phone.dc.html:23)
- Phone 375: scope text 14px #62625b flex-shrink 0; row `justify-content:space-between; gap:8px`; Target at the row end, 14px muted, no fill, min-height 44, padding 4/8, margin-right -8 (chevron ends at the 16 px page gutter edge, x 359), icon 14, chevron 14, name ellipsis (Phone.dc.html:23)
- Phone 375: tabs gap 24px, margin-top 8, each tab padding 10px 4px, active 600 with 2px #d63031 underline (Phone.dc.html:24-26)
- Phone-Long 375: long name takes the free line and is cut with an ellipsis, icon and chevron stay whole (Phone-Long.dc.html:23)
- Main 1280: icon `align-items:flex-start`; title over scope; Target at the row end, 36 px tall, 14px, no fill (Main.dc.html:22-28)
- Shelf-B 375: breadcrumb 14px min-height 32, icon + title + scope + Target as Phone (Shelf-B.dc.html:23-31)
- Shelf-B 375: sort row right-aligned, padding-top 12, quiet button 44 px, icon + current order + chevron, no fill (Shelf-B.dc.html:36-38)
- Shelf-B 375: list starts 4 px below the sort row, 2 columns, gap 12, 16:9 thumbnails r10, title 13px 600 nowrap (Shelf-B.dc.html:40-45)
- Target-Menu: popover 320 wide, r16, shadow; heading "対象" 11px 600 muted; row = radio circle 16px (selected: 5px #d63031 ring; unselected: 1.5px #91918c ring) + name + count 12px muted, selected row filled #f6f6f3; divider; "管理…" row with sliders icon (Target-Menu.dc.html:5-9)
- Target-Manage: dialog 440 wide, padding 24, r24; h2 18px 700; search field filled #f6f6f3, r16, no border, search icon + "検索"; rows with 18px r5 checkbox (checked #d63031 with white tick), one row at opacity 0.4; "完了" red pill at the right; no close button (Target-Manage.dc.html:5-11)

## Findings
### D-1 Phone/Shelf-B 375: the header icon tile is aligned with the title, not centred on the title + scope block
- design: `align-items:center` in the icon/title row, so the tile is centred between the title and the scope line (Phone.dc.html:23, Shelf-B.dc.html:25; r5-artboard-Phone-375.png / artboard-Phone-375.png: tile centre y 89 css, title 73, scope 105)
- implementation: tile centre is level with the title line, the scope line hangs below the tile (r5-375-video-main-default.png: tile centre y 104 css, title 100, scope 142; r5-375-shelf-video-main-default.png: tile 128, title 125, scope 166)
- visible: at a glance

### D-2 Phone/Shelf-B 375: the scope line sits further below the title
- design: scope about 32 css px under the title centre (margin -6px)
- implementation: about 42 css px (r5-375-video-main-default.png: title 100, scope 142; shelf 125 to 166)
- visible: side by side

### D-3 Shelf-B 375: the list starts about 20 px lower below the sort row
- design: sort row 44 px, then the list 4 px below it (Shelf-B.dc.html:36,40)
- implementation: sort button bottom at about 240 css, first card top at about 264 css, a gap of about 24 px (r5-375-shelf-video-main-default.png, card top 528/2)
- visible: side by side

### D-4 Target-Menu: rows have no radio circle; the selected row is marked with a check mark
- design: 16 px radio on every row, selected has a thick red ring, unselected a thin grey ring (Target-Menu.dc.html:7)
- implementation: no ring on unselected rows, a check mark at the left of the selected row only (r2-375-video-main-target-menu-open.png; not re-shot in r4/r5)
- visible: at a glance

### D-5 Target-Menu at 375: shown as a full-width sheet at the bottom, not the 320 px popover
- design: 320 px wide card with r16 and shadow (Target-Menu.dc.html:5); no phone placement is drawn
- implementation: a card 8..367 px wide anchored to the bottom of the screen with a dimmed page behind (r2-375-video-main-target-menu-open.png)
- visible: at a glance. The artboard draws no 375 placement, so this is a state the design does not show.

### D-6 Target-Manage: search field has a blue focus ring and the dialog has a close button; the dimmed row is not shown
- design: search field fill #f6f6f3, no border; only "完了" closes the dialog; one row at opacity 0.4 (Target-Manage.dc.html:7,9,11)
- implementation: search field shows a blue 1 px border (focused) and an X at the top right; both rows are plain checked rows (1280-video-main-manage-targets.png, first run). The 0.4-opacity state is not shown in R-5, cannot be checked.
- visible: side by side

### D-7 Phone 375: tab labels are indented about 12 px more and spaced wider
- design: tab padding 10px 4px, so the first label text starts at x 20 and the gap between labels is 24 plus padding (Phone.dc.html:24-25)
- implementation: "Discover" text starts at x 32 css under the underline that starts at 16, and Discover to Library text gap is about 36 css px (r5-375-video-main-default.png; text 65/2, Library 254/2)
- visible: side by side

### D-8 Shelf-B 375: card titles and thumbnail corners differ
- design: title 13px 600, thumbnail radius 10 (Shelf-B.dc.html:43-44)
- implementation: title about 16px regular weight, thumbnail radius about 16 css px, with a duration chip (r5-375-shelf-video-main-default.png). The cards are the existing component; the artboard cards are placeholders, so this may be sample art.
- visible: side by side

### D-9 Top bar: app draws search, quick note and profile; artboards draw only a menu button
- design: 48 px bar with a menu button only (Phone.dc.html:18)
- implementation: menu at the left, search, quick note and profile at the right (r5-375-video-main-default.png); the header starts lower (h1 y 84 against 57 in the artboard, per decisions.md)
- visible: at a glance

### D-10 Main 1280: Target is 28 px tall, the artboard's is 36
- design: min-height 36, padding 4/8 (Main.dc.html:28)
- implementation: 28 px tall at 1280 (decisions.md fourth record; r4-1280-video-main-default.png shows the Target at the title row's end, visibly smaller). Not re-measured in the fifth run.
- visible: only by measuring

### D-11 Not shown in R-5, cannot be checked
- Photo Diary page itself (Main, Map, Phone, Phone-Long artboards' calendar, map, pins, "今日" and "撮影日なし" buttons): decisions.md pending says the addon page was not opened.
- Target-Menu at a wide width: not in r4/r5.
- Manage dialog disabled row (see D-6) and the Japanese Manage dialog.
- Phone-Long's tab state "地図" with the long name on the addon page.
- 640 px: no artboard draws it; the r4 shots show it but there is nothing to compare against.

### D-12 Phone/Phone-Long/Shelf-B 375: the count text is closer to the Target's icon when the line is full
- design: scope row `gap:8px` plus the button's 8 px left padding, so 16 px from the end of the count text to the Target's icon (Phone.dc.html:23; same in Phone-Long and Shelf-B)
- implementation: 4 px gap plus 8 px padding, 12 px (decisions.md fifth record, items for `main` long folder and the long-drive states; r5-375-video-longdrive-longfolder.png: `8 videos` ends at x 381 / 2, icon starts about 407 / 2, about 13 css px by eye). Where the line has room the gap is larger (45-110 px, space-between) and the artboard's 16 px does not apply.
- visible: only by measuring

### D-13 Phone/Phone-Long/Shelf-B 375: the Target's chevron ends 8 px inside the page gutter edge
- design: `margin-right:-8px` on the Target, so its chevron ends at x 359, the right edge of the 16 px gutter (Phone.dc.html:23)
- implementation: the Target keeps its 8 px padding inside the content edge, chevron ends about x 351 (decisions.md item (c); r5-375-video-main-default.png chevron right end about 696 / 2 against about 712 / 2 in r5-artboard-Phone-Long-375.png). The shelf sort button's chevron is at the same inset (r5-375-shelf-video-main-default.png), where the Shelf-B artboard draws it about 8 px further right (about 705 / 2 against 696 / 2).
- visible: side by side. This is in decisions.md as an unchanged difference but was not a D- entry before.

### D-14 Shelf-B 375: the breadcrumb sits closer to the icon tile and title
- design: breadcrumb text centre about y 73 css, icon tile top about 105 (r5-artboard-Shelf-B-375.png at 2x: breadcrumb 145, tile top 210); breadcrumb row min-height 32 (Shelf-B.dc.html:23)
- implementation: breadcrumb text centre about y 94 css, tile top about 108 (r5-375-shelf-video-main-default.png at 2x: breadcrumb 188, tile top 216), so about 14 css px from breadcrumb centre to tile against about 32 in the artboard. Measured by eye from the screenshots, not from the code.
- visible: side by side

TOTAL: 14 findings
