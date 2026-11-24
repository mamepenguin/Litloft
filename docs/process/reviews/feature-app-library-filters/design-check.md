# Design check

at: bc390056532248bd1a83aaebd94349155efcc059
design: docs/process/reviews/feature-app-library-filters/design/
(note: commit 860752997 added the search placeholder after these shots; read from code, FilterMenus.tsx:136, it is now present)

## Decisions read from the design
- Main (動画 right column): row order タグ, 状態, 20px gap, 分類, 並び順 (Main.dc.html:48-52, .gap width 20 at :27)
- Main: filter buttons are outlined pills, white bg, radius 16, padding 8px 12px, 14px, label muted + value #211922 weight 400 (Main.dc.html:17-18)
- Main: 動画 分類 offers フォルダ/タグ/追加日/長さ/なし, 状態 すべて/未視聴/視聴中/視聴済み (Main.dc.html:53)
- Main 読書: category chips row first, then タグ, 状態, gap, 分類, 並び順 (Main.dc.html:66-72)
- Main Clips: タグ, 状態 (すべて/未確認/確認済み), gap, 分類, 並び順, no category chips (Main.dc.html:83-88)
- TagMenu: tag button has value text plus a trailing chevron-down icon (TagMenu.dc.html:24)
- TagMenu: value is chosen tags joined ", ", b max-width 12rem ellipsis (TagMenu.dc.html:14, :64)
- TagMenu: menu width 300px, radius 14, shadow, padding 8px 0 (TagMenu.dc.html:26)
- TagMenu: search field 36px high, radius 10, search icon, placeholder "タグを検索", no clear button (TagMenu.dc.html:28-31)
- TagMenu: row 指定なし with check when none, divider, list max-height 320 scroll (TagMenu.dc.html:33-35)
- TagMenu: rows = check slot, name (ellipsis), count right, 12px muted tabular; chosen rows first; row background only on hover, a chosen row is shown by check only (TagMenu.dc.html:16-18, :37, :58)
- TagMenu: empty text 一致するタグはありません, 14px muted (TagMenu.dc.html:40)
- Phone 390: 2x2 grid, row 1 タグ + 状態, row 2 分類 + 並び順, gap 8, buttons min-height 44, value ellipsis (Phone.dc.html:33-41, :13-15)
- Phone: sections below start with title 16px/600, count, すべて見る (Phone.dc.html:44)

## Findings
### D-1 TagMenu: menu is narrower than drawn
- design: width 300px (TagMenu.dc.html:26)
- implementation: panel is content-sized with min-w 200px; measured about 219px wide at 1440 (shots/video-tagmenu-two-chosen-1440-ja.png, x 281-499; ToolbarMenu.tsx:35 sm:min-w-[200px])
- visible: side by side

### D-2 TagMenu / Main: filter buttons have no trailing chevron
- design: the Tag button in the TagMenu artboard ends with a chevron-down (TagMenu.dc.html:24). Main draws none on any button.
- implementation: no chevron on タグ in the closed or the chosen state (shots/video-tagmenu-two-chosen-1440-ja.png, layout-video-1280-ja.png); ToolbarMenu draws ChevronDown only in some variants (ToolbarMenu.tsx:248, 254), not the inline-label one used here
- visible: side by side (the design is itself inconsistent between Main and TagMenu)

### D-3 TagMenu: chosen rows get a grey fill
- design: row background only on hover (TagMenu.dc.html:17); a chosen row is marked by its check
- implementation: chosen rows have bg-bg-elevated and font-medium (FilterMenus.tsx:42); in shots/video-tagmenu-two-chosen-1440-ja.png both chosen rows are shaded, and in video-tagmenu-search-1440-ja.png 指定なし is shaded when chosen
- visible: at a glance

### D-4 TagMenu: search field shows a clear (x) button
- design: search field has no clear control (TagMenu.dc.html:28-31)
- implementation: input is type="search", so Chromium draws a blue x once text is typed (shots/video-tagmenu-search-1440-ja.png; FilterMenus.tsx:132). The field is also shorter than 36px (py-1.5 text-sm, about 32px) with radius rounded-xl (12) against 10 (FilterMenus.tsx:129).
- visible: side by side

### D-5 TagMenu: search placeholder not shown in R-5
- design: placeholder "タグを検索" (TagMenu.dc.html:30)
- implementation: R-5 shots show an empty field (decisions.md line 8 says so); the code now sets it (FilterMenus.tsx:136, commit 860752997) but no screenshot at that commit shows it
- visible: not shown in R-5, cannot be checked

### D-6 TagMenu: list max-height not shown
- design: list scrolls at max-height 320px (TagMenu.dc.html:35)
- implementation: no shot has more than 5 rows; panel height is capped at 70vh by ToolbarMenu (ToolbarMenu.tsx:35), not 320px
- visible: not shown in R-5, cannot be checked

Checked and matching: order and 20px gap at 1280/1440 (layout-video-1280-ja.png, 状態 ends 521, 分類 starts 541); Reading chips above filters (layout-reading-1280-ja.png); Clips with no chips and タグ/状態/分類/並び順 (layout-clips-1280-ja.png); 390px 2x2 grid with タグ left, 状態 right, about 44px tall, value ellipsis (layout-video-390-ja.png); lone タグ in the left half without a profile (layout-video-390-ja-noprofile.png); count column, check column, chosen-first order, 指定なし row and divider (video-tagmenu-two-chosen-1440-ja.png). The 390px bottom sheet (video-tagmenu-sheet-chosen-390-ja.png) is not drawn in the design, so there is nothing to compare. Focus rings in the layout shots (blue at 1280, orange at 390) are focus states the design does not draw.

TOTAL: 6 findings
