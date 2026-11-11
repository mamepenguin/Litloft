# Design check

at: 1c0e7778b38d1791fdbf223f0ef323a30ce60ae0
design: docs/process/reviews/fix-reading-app-design/design/

## Decisions read from the design
(D = `docs/process/reviews/fix-reading-app-design/design/`)
- Main (発見, 1280): shelves stacked, gap 36px; heading 18px/700; "すべて見る" 13px muted + 16px chevron-right; heading-to-grid 12px (D/Main.dc.html:38-45)
- Main: 6-column grid, gap 20px, cover 2:3 radius 12 (Main.dc.html:45,48)
- Card cover: tinted gradient fill; cover title top-left 13px/700 at 78% ink, padding 14px 12px (Main.dc.html:48-49)
- Card cover: format badge left 8px, bottom 10px, padding 0 6px, radius 6px, bg rgba(33,25,34,.82), 11px / line 18px / weight 500 (Main.dc.html:50)
- Card cover: progress bar bottom, 4px, accent fill on rgba(33,25,34,.25) track (Main.dc.html:52)
- Card below cover: flex column gap 8px (cover, title, meta); title 14px/600 clamp 2; meta 12px muted "folder · time" (Main.dc.html:47,55-56)
- Target button: bg #e5e5e0, no border, radius 16, padding 8x16, 14px, muted label + value + 16px chevron (Main.dc.html:30)
- Tabs, header tile and gutters: app-wide, accepted earlier (not re-checked)
- Lib: chip row (pills 6x14, 13px), 12px gap, control row Tag/State at start, spacer, Group/Sort at end, 8px gap, grid 24px below, 6 cols gap 20 (Lib.dc.html:38-40)
- Lib-Grouped: same controls; shelves gap 36px; heading 18px/700 + 13px muted count; "すべて見る" with chevron; 6-col shelf (Lib-Grouped.dc.html:39-47)
- Target-Menu: 320px, padding 8, radius 16, shadow; heading 対象 11px/600 muted; rows 8x12 radius 12; radio circles; 管理… row with icon (Target-Menu.dc.html:5-9) [width and check-mark rows accepted in Round 2]
- Target-Manage: 440px, padding 24, radius 24, heading 表示する対象 18px/700, no close control, search field bg #f6f6f3 radius 16 with icon, no border/ring, rows gap 12 padding 8x12 with 18px radius-5 accent checkbox, 完了 accent radius 16 padding 8x20 (Target-Manage.dc.html:5-11) [close button and placeholder accepted]
- Sidebar: app shell, accepted, not checked.

Screenshots used: `shots/1280-reading-discover.png`, `1280-reading-discover-loading.png`, `1280-reading-library-none-tech.png`, `1280-reading-library-group-tag.png`, `1280-reading-shelf-new.png`, `1280-reading-target-menu.png`, `1280-reading-target-manage.png`, `1280-reading-target-manage-en.png`, `1280-reading-card-no-thumb-progress.png`, `1280-reading-card-thumb-progress.png`, `1280-reading-card-no-thumb.png`. Code: `frontend/src/components/readingapp/ReadingCard.tsx`, `frontend/src/components/appshell/ManageTargetsDialog.tsx`.

Matches the design at 1280 and not re-listed: 6 columns, 20px gap, 2:3 covers, shelf heading size and spacing, See all with chevron, Target button look, Library control row order/placement and 12px/24px spacing, badge position (bottom-left, above the bar), no-thumbnail cover title top-left, accent progress fill, "<folder> · <relative time>" meta, 2:3 loading placeholders, Manage heading, search icon, 完了 radius.

## Findings
### D-1 Card: format badge is a full pill, larger and lighter than the design
- design: radius 6px, padding 0 6px, 11px/500, bg rgba(33,25,34,.82) (Main.dc.html:50)
- implementation: `rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold` = pill, 8px side padding, 12px/600, 70% black (ReadingCard.tsx:54; shots/1280-reading-card-no-thumb.png, 1280-reading-discover.png)
- visible: side by side

### D-2 Card: meta line sits 2px under the title, not 8px
- design: title and meta are separated by the column's 8px gap (Main.dc.html:47,55-56)
- implementation: `mt-0.5` (2px) between title and meta; cover-to-title is 8px (ReadingCard.tsx:67,70; shots/1280-reading-card-thumb-progress.png shows the meta tight under the title)
- visible: side by side

### D-3 Card: progress track is much darker than the design
- design: track rgba(33,25,34,.25) (Main.dc.html:52)
- implementation: track `bg-black/50`, so the unfilled part reads as mid grey against the red fill (ReadingCard.tsx:58; shots/1280-reading-card-no-thumb-progress.png, 1280-reading-discover.png)
- visible: only by measuring

### D-4 Manage dialog: corner radius 16px instead of 24px
- design: dialog radius 24px (Target-Manage.dc.html:5)
- implementation: `rounded-2xl` (16px) (ManageTargetsDialog.tsx:82; shots/1280-reading-target-manage-en.png)
- visible: side by side

### D-5 Manage dialog: search field has a border and shows a blue focus border; rows are tighter with a native-size checkbox
- design: field is a borderless #f6f6f3 fill; rows padding 8x12, gap 12, 18px radius-5 accent checkbox (Target-Manage.dc.html:7,9)
- implementation: field has `border border-bg-border` and, autofocused, a blue `focus:border-focus-ring` outline; rows `px-2 py-2 gap-2` with a native ~16px checkbox, so rows are about 36px apart and the checkbox sits 8px in, not 12px (ManageTargetsDialog.tsx:111,123-125; shots/1280-reading-target-manage.png, 1280-reading-target-manage-en.png)
- visible: side by side

TOTAL: 5 findings
