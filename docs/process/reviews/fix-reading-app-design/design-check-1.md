# Design check

at: f5fe3dfcafb97ca1258acd898f6fed743ecf58f5
design: docs/process/reviews/fix-reading-app-design/design/

## Decisions read from the design
(D = `docs/process/reviews/fix-reading-app-design/design/`)
- Main (発見, 1280): shelves stacked, gap 36px; shelf heading 18px/700; "すべて見る" 13px muted with 16px chevron-right; heading-to-grid 12px (Main.dc.html:38-45)
- Main: 6-column grid, gap 20px, 2:3 cover, radius 12 (Main.dc.html:45,48)
- Card cover: bg is a tinted gradient; cover title text top-left, 13px/700, padding 14px 12px (Main.dc.html:48-49)
- Card cover: format badge at left 8px, bottom 10px, dark pill, 11px white (Main.dc.html:50)
- Card cover: progress bar bottom, 4px, accent fill on dark translucent track (Main.dc.html:52)
- Card below cover: title 14px/600 clamp 2 lines, meta 12px muted "folder · time", gap 8px (Main.dc.html:47,55-56)
- Target button: bg #e5e5e0, no border, radius 16, padding 8x16, 14px, muted label + value + 16px chevron (Main.dc.html:30)
- Tabs: 24px gap, 10x4 padding, accent underline (Main.dc.html:32-35) [app-wide PageTabs, accepted D-5]
- Header: 48px icon tile, 28px/32px padding (Main.dc.html:23-25) [accepted D-3]
- Lib (ライブラリ まとめ方なし): chip row (pills 6x14, 13px, selected = dark fill), 12px gap, control row Tag/State at start, flex spacer, Group/Sort at end, grid 24px below, 6 columns gap 20 (Lib.dc.html:38-40)
- Lib-Grouped: same controls, shelves gap 36px, heading with 13px muted count, "すべて見る" with chevron, 6-col shelf (Lib-Grouped.dc.html:38-47)
- Target-Menu: 320px wide, padding 8, radius 16, shadow; heading 対象 11px/600 muted; rows 8x12 radius 12, gap 2; every row has a 16px radio circle (selected = 5px accent ring) then label then right-aligned count (selected row has bg #f6f6f3 and shows the count); separator; 管理… row with a 16px icon (Target-Menu.dc.html:5-9)
- Target-Manage: 440px wide, padding 24, radius 24, heading 表示する対象 18px/700, no close control; search field = bg #f6f6f3, radius 16, search icon + placeholder 検索; rows with 18px radius-5 checkbox (accent fill + white check when on); 完了 button accent, radius 16, padding 8x20, right aligned (Target-Manage.dc.html:5-11)
- Sidebar: app shell, accepted (D-10, D-11), not checked.

Screenshots used: `shots/1280-reading-discover.png`, `1280-reading-library-none-tech.png`, `1280-reading-library-group-tag.png`, `1280-reading-target-menu.png`, `1280-reading-target-manage.png`. Items in the Fixed table (columns, card size, Target button, control row, spacing, folder chips, progress colour, meta line, chevron) were compared and match the design at 1280 (6 columns, 20px gap, 2:3, 12px/24px spacing, Group/Sort at end); not re-listed.

## Findings
### D-1 Card: the format badge sits at the top-left of the cover, not the bottom-left
- design: badge `left:8px; bottom:10px` (Main.dc.html:50; same in Lib.dc.html:45, Lib-Grouped.dc.html:51)
- implementation: badge (EPUB / PDF / 書庫) is drawn at the top-left of every cover, about 8px from the top and left (shots/1280-reading-discover.png, 1280-reading-library-none-tech.png, 1280-reading-library-group-tag.png)
- visible: at a glance

### D-2 Card: the cover has no tinted fill and no cover title text
- design: cover is a tinted gradient (e.g. #e6d8c9 to #d8c7b3) with the book's title set in the top of the cover, 13px/700 at 78% ink (Main.dc.html:48-49)
- implementation: covers without a thumbnail are a flat pale grey fill with a centred file-type icon and no title text; PDF covers with a thumbnail are white with page text (shots/1280-reading-discover.png, 1280-reading-library-none-tech.png). Cover art itself is placeholder; the fill, the missing top-aligned title text and the centred icon are what differ.
- visible: at a glance

### D-3 Target menu: 200px wide instead of 320px
- design: menu panel `width:320px` (Target-Menu.dc.html:5)
- implementation: panel is about 200px wide (x 1065-1263), so it is narrower than the Target button above it is not, and it is visibly narrower than the design's panel (shots/1280-reading-target-menu.png; decisions.md states 200px)
- visible: at a glance

### D-4 Target menu: no radio circle on each row; selected row uses a check mark; 管理… icon differs
- design: every row starts with a 16px radio circle (grey ring when off, 5px accent ring when on); rows are label then count; 管理… has an eight-ray icon (Target-Menu.dc.html:7,9)
- implementation: the selected row shows a check mark, the other rows (Swift, 技術書) have no leading control and their label starts at the left edge of the label column; 管理… has a sliders icon (shots/1280-reading-target-menu.png)
- visible: at a glance

### D-5 Manage dialog: heading reads 管理… and a close X is added
- design: heading 表示する対象, no close control (Target-Manage.dc.html:6)
- implementation: heading 管理…, with an X button at the top right (shots/1280-reading-target-manage.png)
- visible: at a glance

### D-6 Manage dialog: search field has no search icon and a different placeholder
- design: field has a 16px search icon before the text 検索, muted, no ring (Target-Manage.dc.html:7)
- implementation: no icon, placeholder スマートフォルダを検索, drawn with a blue focus ring while focused (shots/1280-reading-target-manage.png)
- visible: side by side

### D-7 Manage dialog: 完了 button is a full pill and smaller
- design: padding 8px 20px, radius 16px (Target-Manage.dc.html:11)
- implementation: about 60x36 with a fully rounded (pill) end; the dialog is 448px wide versus 440px (shots/1280-reading-target-manage.png)
- visible: only by measuring

TOTAL: 7 findings
