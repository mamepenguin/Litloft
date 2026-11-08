# Design check

at: ac5e6d3005b1a125011633025064d907a2ed98af
design: docs/process/reviews/feature-reading-app/design/

Artboards (canvas.json): Main 1280 "発見", Lib 1280, Lib-Grouped 1280, Target-Menu 368, Target-Manage 488, Sidebar 240. Screenshots used: shots/10-reading-discover-1440.png, 20-reading-library-1440.png, 23-reading-library-by-tag-1440.png, 03-sidebar-1440.png (the 1440 shots are the nearest to the 1280 artboards; no 1280 shot exists).

## Decisions read from the design
- Main: sidebar column = 240px wide, white, right border (Main.dc.html:18)
- Main: page header padding = 28px 32px 0 (Main.dc.html:23); content gutter 32px (Main.dc.html:38)
- Main: header = 48px icon tile radius 12 + h1 24px/700 + 13px muted scope line + Target button (Main.dc.html:25-30)
- Main: Target button = filled #e5e5e0, radius 16, padding 8x16, muted label "対象" + value + chevron-down, no border, no leading icon (Main.dc.html:30)
- Main: surface tabs = text links, gap 24, padding 10px 4px, 2px #d63031 underline on the active one, 1px bottom rule (Main.dc.html:32-35)
- Main: shelf = h2 18px/700 + "すべて見る >" 13px muted right, heading margin-bottom 12, shelf gap 36 (Main.dc.html:38-44)
- Main: cover grid = 6 columns, gap 20 (Main.dc.html:45); at 1280 a card is about 146px wide
- Main: card = 2:3 cover radius 12, format badge bottom-left 11px dark pill, progress bar 4px bottom edge, fill #d63031 on a rgba(33,25,34,.25) track (Main.dc.html:48-53)
- Main: card text = title 14px/600 two-line clamp, meta 12px muted "<category> · <relative time>" (Main.dc.html:55-56, 74)
- Main: Continue reading shows 6 cards with progress; the other shelves none (Main.dc.html:78-101)
- Lib: folder chips = 13px pills padding 6x14, unselected #f6f6f3 filled, selected #211922 filled with white bold text (Lib.dc.html:38)
- Lib: control row = Tag and State on the left; flexible spacer; Group ("まとめ方") and Sort ("並び順") on the right; all are filled #e5e5e0 label+value buttons with chevron (Lib.dc.html:38)
- Lib: grid below controls = same 6-column, gap 20 cards, padding 24px 32px 0 (Lib.dc.html:39-40)
- Lib-Grouped: Group value "タグ別"; shelves with name + muted count in the h2 and "すべて見る", 6 cards per shelf, shelf gap 36 (Lib-Grouped.dc.html:38-46)
- Target-Menu: 320px popover, radius 16, shadow, section label "対象" 11px/600, radio rows with count on the right, divider, "管理…" row with gear icon (Target-Menu.dc.html:3-7)
- Target-Manage: 440px dialog radius 24, h2 18px "表示する対象", search field, checkbox rows (18px, radius 5, red fill when checked), unusable row opacity .4, "完了" red button right-aligned (Target-Manage.dc.html:3-9)
- Sidebar: drive switcher row with up/down chevrons; rows ホーム, ライブラリ, Ask, Notes, 動画, 読む; divider; five view rows; "スマートフォルダ" label with two rows; trash pinned to the bottom; no Sources or Collections sections (Sidebar.dc.html:10-28, 36-52)

## Findings
### D-1 Main, Lib, Lib-Grouped: 4 cards per row where the design draws 6
- design: 6 columns, gap 20, card about 146px wide at 1280 (Main.dc.html:45, Lib.dc.html:40, Lib-Grouped.dc.html:46)
- implementation: 4 columns, cards 271px wide (about 1.8x the design's) at 1440; the first screen holds about one shelf row where the design shows two or more shelves (shots/10-reading-discover-1440.png, shots/20-reading-library-1440.png, shots/23-reading-library-by-tag-1440.png). Spec item 243-246 says the count follows Home's cardGrid; no human decision for fewer columns is stated.
- visible: at a glance

### D-2 Main, Lib: card gap is narrower than the design's 20px
- design: gap 20 (Main.dc.html:45)
- implementation: about 14px between cards (covers end at 549 and the next starts at 563 in a 1440 shot)
- visible: side by side (shots/10-reading-discover-1440.png)

### D-3 Main, Lib, Lib-Grouped: page gutter and header tile sizes differ
- design: gutter 32px; icon tile 48px (Main.dc.html:23-25, 38)
- implementation: content starts 40px from the sidebar edge and ends 40px from the right edge; icon tile is about 40px (shots/10-reading-discover-1440.png)
- visible: only by measuring

### D-4 Main, Lib, Lib-Grouped: Target button is outlined with an icon, not a filled label-value button
- design: filled #e5e5e0, radius 16, "対象 すべての本" then a chevron, no border and no leading icon (Main.dc.html:30)
- implementation: white button with a thin border, a target icon, "Target All books", no chevron (shots/10-reading-discover-1440.png)
- visible: at a glance

### D-5 Main, Lib, Lib-Grouped: surface tabs are wider and spaced differently
- design: padding 10px 4px, gap 24, underline as wide as the label (Main.dc.html:32-34)
- implementation: the active underline spans about 90px under a 30px label (horizontal padding about 16px), tabs sit about 20px apart (shots/10-reading-discover-1440.png)
- visible: side by side

### D-6 Main: progress bar color and track
- design: fill #d63031 (red) on a dark translucent track, 4px (Main.dc.html:52)
- implementation: the bars on the Continue reading cards read grey/dark olive, not red (shots/10-reading-discover-1440.png, bottom edge of the four covers)
- visible: side by side (colour read from the screenshot; code not read)

### D-7 Main, Lib: card meta uses a folder segment and a date, not a category with relative time
- design: "<category> · <relative time>" for every card, e.g. "漫画 · 昨日", "技術書 · 2年前" (Main.dc.html:74)
- implementation: "Books · 08/11" and "Swift · 08/17" as absolute dates for most cards and relative ("2 days ago") for the recent ones (shots/10-reading-discover-1440.png, shots/20-reading-library-1440.png)
- visible: side by side

### D-8 Lib: folder chips look different
- design: unselected chips filled #f6f6f3 with no border; selected chip filled #211922 with white bold text (Lib.dc.html:38)
- implementation: all chips are white with a thin outline; the selected "All" is marked by a red outline, no dark fill (shots/20-reading-library-1440.png)
- visible: at a glance

### D-9 Lib, Lib-Grouped: control row layout and button look
- design: Tag and State left; Group ("まとめ方") and Sort ("並び順") pushed to the right edge; all filled grey label-value buttons with chevrons (Lib.dc.html:38)
- implementation: all four controls sit together on the left, outlined, each with a leading icon and no chevron; labels read "Tag", "State All", "Group None", "Added (newest first)" (shots/20-reading-library-1440.png). The Sort control shows no "Sort" label.
- visible: at a glance

### D-10 Main, Lib, Lib-Grouped: an extra top bar the design does not draw
- design: no top bar; the page header starts at the top (Main.dc.html:23)
- implementation: a 56px top bar (search, compose, avatar) above the header, and a sidebar toggle at top-left (shots/10-reading-discover-1440.png). Likely the app shell; not in the design.
- visible: side by side

### D-11 Sidebar: rows, sections and drive switcher differ
- design: ホーム, ライブラリ, Ask, Notes, 動画, 読む; one divider; five view rows; "スマートフォルダ" with two rows; trash at the bottom; drive row has up/down chevrons (Sidebar.dc.html:10-28, 42-52)
- implementation: Home, Inbox, Library, Video, Reading (no Ask or Notes rows); Views, Sources (YouTube & Feeds), Collections and Smart Folders sections with section labels and collapse chevrons; five smart folders; drive row "main" with a drive icon and no chevrons; smart-folder rows use a search icon, not a folder-with-dot icon; trash not visible in the 900px shot (shots/03-sidebar-1440.png, shots/10-reading-discover-1440.png)
- visible: at a glance

### D-12 Lib, Lib-Grouped: group shelf heading style
- design: name 18px/700 with a 13px muted count; "すべて見る >" with a chevron (Lib-Grouped.dc.html:43-44)
- implementation: name with a small count; "See all" has no chevron (shots/23-reading-library-by-tag-1440.png; same in shots/10-reading-discover-1440.png)
- visible: side by side

### D-13 Target-Menu: not shown in R-5, cannot be checked
- design: Target-Menu.dc.html:3-7
- implementation: decisions.md describes the menu in text only; no screenshot of the open menu exists in shots/
- visible: n/a

### D-14 Target-Manage: not shown in R-5, cannot be checked
- design: Target-Manage.dc.html:3-9
- implementation: decisions.md describes the dialog in text only; no screenshot of the open dialog exists in shots/
- visible: n/a

### D-15 Lib: chip row and control row are spaced further apart than the design
- design: chip row and control row in one column with gap 12; grid starts 24px below (Lib.dc.html:38-39)
- implementation: chip row to control row is about 40px between their top edges (chips at y=208-238, controls at y=269-306), roughly 30px of space against the design's 12px (shots/21-reading-library-chip-tech-1440.png; selected chip drawn with a red outline, see D-8)
- visible: side by side

TOTAL: 15 findings
