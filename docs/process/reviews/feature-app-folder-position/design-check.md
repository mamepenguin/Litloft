# Design check

at: 39409faa19a4f5f62ac646938a69d9b4197d5816
design: docs/process/reviews/feature-app-folder-position/design/

Shot paths below are relative to docs/process/reviews/feature-app-folder-position/r5/. The design boards have no sidebar; the implementation shots at 1280 show the app sidebar (240 px), so the content area is about 1008 px against the design's 1216 px.

## Decisions read from the design
- Main: crumb row above chip row above control row above shelves (Main.dc.html:40-79)
- Main: crumb = home icon, ">" separators, ancestor links, current segment weight 500 in #211922, 14 px, no border or background (Main.dc.html:41-47)
- Main: chips = pill, #f6f6f3, 14 px name with 13 px muted count, wrap, gap 8 (Main.dc.html:17-19, 48)
- Main: control row = タグ, 状態 on the left; flex spacer; 分類, 並び順 pushed to the right edge (Main.dc.html:53-59)
- Main: shelf grid = 5 columns, gap 16, 16:9 thumbnails radius 12, title 14 px, shelf heading 18 px / 600, "すべて見る" link at right (Main.dc.html:61-79)
- Reading: same crumb, chip row and control row; 分類 shows "なし"; no shelves, 7-column grid (gap 24/20) of 2:3 covers radius 8, kind badge 11 px white-on-light at bottom-left, 14 px title, 12 px muted folder line (Reading.dc.html:48-71)
- States 上端: chips only, no crumb, then controls, then shelves (States.dc.html:30-41)
- States 子フォルダなし: crumb (3 levels), controls, one shelf, no chip row (States.dc.html:46-59)
- States 空: crumb, then the empty state only (no control row): 40 px icon, one line "ファイルがありません" 15 px, no second line (States.dc.html:64-76)
- Phone: crumb on one nowrap row, chips on one horizontally scrolling row, both min-height 44 (Phone.dc.html:19-21, 37-51)
- Phone: control row is one row of four icon + value buttons (the "タグ"/"状態"/"分類"/"並び順" labels dropped, value shortened to "新しい順") (Phone.dc.html:53-58)
- Phone: each shelf is a horizontal rail of 150 px cards, 17 px heading, "すべて見る" at right (Phone.dc.html:60-78)

## Findings
### D-1 Main: shelf grid has 3 columns, design has 5
- design: 5 columns at 1216 px content width, 16:9 thumbs about 230 px wide, 14 px titles (Main.dc.html:70)
- implementation: 3 columns of about 325 px, larger thumbnails and about 16 px two-line titles; two shelves do not fit on the first screen as in the design (video-desktop-YouTube.png, video-desktop-top.png)
- visible: at a glance

### D-2 Main / Reading: 分類 and 並び順 are not pushed to the right edge
- design: タグ and 状態 left, 分類 and 並び順 right-aligned after a flex spacer (Main.dc.html:56, Reading.dc.html:56)
- implementation: all four controls sit in a left cluster (分類 starts at x=541 after a small gap) and the right side of the row is empty (video-desktop-YouTube.png, reading-desktop-Inbox.png)
- visible: at a glance

### D-3 Reading: grid has 6 columns and different card look
- design: 7 columns at 1216 px, cover radius 8, kind badge light (white 90%, dark text, 11 px) (Reading.dc.html:61-65)
- implementation: 6 columns of about 151 px (the Inbox shot has 5 books, left-aligned), dark pill badges (書庫 / PDF) (reading-desktop-top.png, reading-desktop-Inbox.png)
- visible: side by side

### D-4 States 空: empty state has a second line, a different icon, and the control row stays
- design: crumb then empty state only; 40 px thin-line table icon; single line "ファイルがありません" at 15 px, normal weight (States.dc.html:64-76)
- implementation: control row (タグ / 状態 / 分類 / 並び順) is drawn between crumb and empty state; larger solid file icon; bold heading plus the second line "ファイルをここにドロップすると追加できます。" (video-desktop-empty.png, video-phone-empty.png)
- visible: at a glance

### D-5 Phone: control row is a 2x2 grid with labels, not one compact row
- design: four icon + value buttons in one row, labels dropped, sort shortened to "新しい順" (Phone.dc.html:54-57)
- implementation: 2x2 grid of full-width buttons with "タグ 指定なし", "状態 すべて", "分類 フォルダ", "並び順 追加日（..." (sort value truncated); the controls take two rows and push the first shelf down (video-phone-YouTube.png, video-phone-top.png)
- visible: at a glance

### D-6 Phone: shelves are a 2-column vertical grid, not horizontal rails
- design: each shelf is a single row of 150 px cards that overflows right (Phone.dc.html:69-76)
- implementation: 2-column grid of about 170 px thumbnails wrapping to several rows under the shelf heading (video-phone-YouTube.png, video-phone-top.png)
- visible: at a glance

### D-7 Phone: gap between crumb and chips, and between chips and controls, is larger than the design
- design: crumb and chips separated by 4 px, controls 12 px below (Phone.dc.html:37, 53)
- implementation: crumb to chips about 30 px and chips to controls about 22 px (at 1x, from the 2x shots) (video-phone-YouTube.png)
- visible: side by side

### D-8 Main: board's two-link ancestor crumb (動画 > 学問) and the Reading crumbs-with-chips state are not shown in R-5
- design: Main crumb has an ancestor link plus a current segment together with chips; Reading board shows crumb + chips together (Main.dc.html:41-50, Reading.dc.html:41-50)
- implementation: decisions.md states the data has no such position; only a single crumb with chips (YouTube) and crumb without chips are shown (decisions.md pending). Not shown in R-5, cannot be checked.
- visible: not shown in R-5, cannot be checked

### D-9 Header and tab row differ from the boards
- design: caption "main" above the title, count beside the h1; tab row has no trailing control (Main.dc.html:29-37)
- implementation: title with icon tile, subtitle "動画 · 533 本の動画", a search icon at the right end of the tab row (video-desktop-YouTube.png)
- visible: side by side

TOTAL: 9 findings
