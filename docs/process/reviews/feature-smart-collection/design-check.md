# Design check

at: fe615e7220aa57f44e4e516c7f1d32101e97dde7
design: docs/process/reviews/feature-smart-collection/design/

## Decisions read from the design
- Main (880 wide, canvas.json): left "今" has two sections, コレクション (+ button) and スマートフォルダ; right "統合後" has one コレクション section = Main.dc.html:17-50
- Main: merged section lists collections and smart rows interleaved in one list = Main.dc.html:45-48
- Main: collection row icon library glyph 16px, name flex 1, count 12px opacity .6 = Main.dc.html:45
- Main: smart row icon three-line filter glyph 16px, no count = Main.dc.html:46
- Main: row 14px, padding 8px 12px, radius 8px, gap 10px, muted colour = Main.dc.html:45
- Main: section header 12px / 600, chevron 12px, + button 14px, header margin 16px 0 4px = Main.dc.html:40-44
- Main: sidebar width 260px, radius 16, padding 4px 8px 16px = Main.dc.html:39
- Conflict (sidebar create): inline input under header, 14px, radius 8, 2px red outline, error line 12px red under it, one line = Conflict.dc.html:25-29
- Conflict (dialog): width 400px, padding 24, radius 16, gap 16 = Conflict.dc.html:37
- Conflict (dialog): title 18px/600 with star icon, close X at right = Conflict.dc.html:39-40
- Conflict (dialog): no description paragraph; title, then 名前 label (13px muted), then field = Conflict.dc.html:38-46
- Conflict (dialog): field white bg, radius 12, 1px red border, padding 10px 12px, 14px; error 12px red, gap 6 = Conflict.dc.html:44-45
- Conflict (dialog): buttons right-aligned, gap 8, min-height 44, radius 12, cancel grey, save red = Conflict.dc.html:47-49

Checked, no difference: merged sidebar structure (one コレクション section, interleaved rows, smart rows without count, distinct icons) in shots/sidebar-ja-1440.png.
Not shown in R-5: the design has no 375 artboard, so 375 states are not compared.

## Findings
### D-1 Conflict dialog: an extra description paragraph above the name field
- design: title then directly the 名前 label; no body text (Conflict.dc.html:38-43)
- implementation: "現在の検索条件を保存します。" paragraph between title and label (shots/search-save-dialog-ja-1440.png, shots/name-in-use-search-save-after-409-ja-1440.png; SmartFolderSaveDialog.tsx:120-122)
- visible: at a glance

### D-2 Conflict dialog: width 448px instead of 400px
- design: 400px (Conflict.dc.html:37)
- implementation: max-w-md = 448px; measured 496..944 (shots/search-save-dialog-ja-1440.png; SmartFolderSaveDialog.tsx:105)
- visible: side by side

### D-3 Conflict dialog: buttons about 36px tall, 16px radius, 12px gap
- design: min-height 44, radius 12, gap 8 (Conflict.dc.html:47-49)
- implementation: about 36px tall (y 511-547), rounded-2xl, gap-3 (shots/search-save-dialog-ja-1440.png; SmartFolderSaveDialog.tsx:161-165)
- visible: side by side

### D-4 Conflict dialog: field is grey, 16px radius, label 12px, tighter spacing
- design: white field, radius 12, padding 10px 12px, label 13px, 6px gaps (Conflict.dc.html:42-45)
- implementation: bg-bg-elevated field, rounded-2xl, py-2, label text-xs, error mt-1 (4px) (shots/name-in-use-search-save-after-409-ja-1440.png; SmartFolderSaveDialog.tsx:124,149,156)
- visible: side by side

### D-5 Conflict sidebar: the error line wraps to two lines
- design: error on one line in a 260px sidebar (Conflict.dc.html:19,28)
- implementation: 240px sidebar; text breaks as "...がありま / す" (shots/name-in-use-sidebar-create-after-409-ja-1440.png)
- visible: at a glance

### D-6 Sidebar: a drag-grip glyph left of the コレクション header
- design: chevron + label + "+" only (Main.dc.html:41-43, Conflict.dc.html:21-23)
- implementation: dotted grip at far left of the header (shots/sidebar-new-collection-ja-1440.png, shots/name-in-use-sidebar-create-after-409-ja-1440.png)
- visible: side by side

### D-7 Sidebar: width 240px instead of 260px
- design: 260px (Main.dc.html:39)
- implementation: 240px column (shots/sidebar-new-collection-ja-1440.png)
- visible: side by side

TOTAL: 7 findings
