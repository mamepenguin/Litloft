# Design check

at: e66f737d1e08c119f6caafe005d2be96d8f1e2aa
design: docs/process/reviews/feature-app-view-per-target/design/

## Decisions read from the design
Bound artboards only: Main (view menus and wording), ClipsFolder, ClipsShelf, NotesRail, Phone row 2. Not checked: TagMenu, Phone row 1, Main's filter menus, PerTarget (behaviour only).

- Main: control row = 分類 then 並び順, outlined menus (radius 16, 1px border, padding 8/12, 14px), LayoutList and ArrowDownUp icons, label muted, value dark and normal weight (Main.dc.html:13,18,51-52)
- Main: after the filters, a 20px spacer before 分類 (Main.dc.html:27,50,70,85)
- Main: new wording 分類 / 並び順 in all four apps; Reading 分類 = タグ / フォルダ / 追加日 / なし; Clips 分類 = タグ / フォルダ / 追加日 / なし (Main.dc.html:53,73,88)
- Main: Notes 分類 menu plus 並び順 labelled menu with value 変更日 (Main.dc.html:97-99)
- ClipsFolder: header, tabs, then control row, then shelves (ClipsFolder.dc.html:25-47)
- ClipsFolder: menus have a trailing chevron (ClipsFolder.dc.html:37-38)
- ClipsFolder: open 分類 menu is 220px wide, with the heading 分類 and options タグ / フォルダ / 追加日 / なし, a check on the current one (ClipsFolder.dc.html:39-45)
- ClipsFolder: shelf = title 17px/600, count, "すべて見る ›" at the right end, one row of 200px cards (cover 200x150) at gap 20 (ClipsFolder.dc.html:49-50)
- ClipsFolder: shelf order is by count (レシピ 15, 記事 5, main 2) (ClipsFolder.dc.html:49,57,65)
- ClipsShelf: "‹ ライブラリ" link, then h2 22px/700 with a 14px count, then a grid of cards, no sort menu, ライブラリ tab current (ClipsShelf.dc.html:30-40)
- ClipsShelf: grid is 5 columns with gap 20 at 1200px of content (ClipsShelf.dc.html:41)
- NotesRail: the first element of the rail is the 分類 menu with LayoutList, label, value and chevron, hugging its content (align-self:flex-start) (NotesRail.dc.html:38)
- NotesRail: entries below (すべて with count, folders) 34px rows (NotesRail.dc.html:16,40-43)
- NotesRail: list's search field followed by the 並び順 menu with a label ("並び順 変更日") (NotesRail.dc.html:48-49). The spec binds this to be icon and value only, so it is not a finding.
- Phone row 2: two equal-width buttons (grid 2 columns, gap 8), min-height 44px, icon, label, value ellipsized, 分類 first (Phone.dc.html:14,33,38-41)
- Phone: no chevron on the buttons (Phone.dc.html:39-40)

## Findings
### D-1 ClipsFolder / NotesRail: the view menus have no trailing chevron
- design: both 分類 and 並び順 buttons end with a 16px chevron-down (ClipsFolder.dc.html:37-38; NotesRail.dc.html:38,49)
- implementation: "分類 フォルダ", "並び順 追加日（新しい順）", and the Notes "分類 タグ" show no chevron (shots/item2-clips-folder-menu-open-1280.png; shots/item3-notes-library-1280.png; shots/item3-notes-rail-menu-open-1280.png). The code passes no chevron (frontend/src/components/appshell/ViewMenus.tsx:27-35). Phone and Main draw none, so this applies to the 1280 artboards only.
- visible: side by side

### D-2 NotesRail: the 分類 menu fills the rail width instead of hugging its value
- design: `align-self:flex-start`, so the button is as wide as "分類 フォルダ" plus chevron (NotesRail.dc.html:38)
- implementation: the button spans the whole rail, about 204px, from x=256 to x=460 (shots/item3-notes-library-1280.png; shots/item3-notes-rail-menu-open-1280.png). ViewMenus.tsx:32 sets `fullWidth`.
- visible: at a glance

### D-3 Main / ClipsFolder: no gap between the filters and 分類 in a Library control row
- design: a 20px spacer separates the filters from 分類, then 分類 and 並び順 sit 8px apart (Main.dc.html:50,70,85)
- implementation: Reading puts 分類 8px after the タグ menu, the same as between 分類 and 並び順 (shots/item5-reading-1280-ja.png). The row is `gap-2` throughout (ViewMenus.tsx:105-106). The spec states "after a gap".
- visible: side by side

### D-4 ClipsFolder: the shelf link says "すべて表示 ›", the design says "すべて見る ›"
- design: "すべて見る ›" (ClipsFolder.dc.html:49,58,66; spec line 326 also says "すべて見る ›")
- implementation: "すべて表示 ›" on every Clips shelf (shots/item2-clips-folder-menu-open-1280.png). The Video shelves say "すべて見る" (shots/item5-video-1280-ja.png). Already recorded in decisions.md item 5 as a known difference.
- visible: at a glance

### D-5 ClipsShelf: the heading is smaller than the design's
- design: h2 22px, weight 700, with a 14px count (ClipsShelf.dc.html:38-39)
- implementation: `text-lg font-bold`, 18px (addons/knowledge/frontend/clipsapp/ShelfPage.tsx:101), and the heading in shots/item2-clips-folder-shelf-1280.png measures about 18px.
- visible: side by side

### D-6 ClipsShelf: more space between the tabs and "‹ ライブラリ"
- design: the back link sits one 20px gap below the tab rule (ClipsShelf.dc.html:22,30-35)
- implementation: the tab rule is at y=185 and the link text at y=230 in shots/item2-clips-folder-shelf-1280.png, about 45px. The Library page has no such spacing from its control row, so the shelf page adds a larger gap.
- visible: only by measuring

### D-7 ClipsShelf: 4 columns at 1280px, the design draws 5
- design: `repeat(5,minmax(0,1fr))`, gap 20, in a 1200px content width, so about 224px cards (ClipsShelf.dc.html:41)
- implementation: 4 columns of about 237px, in a content width of about 1008px next to the sidebar (shots/item2-clips-folder-shelf-1280.png). The cards keep today's 200px minimum as the spec requires, and the sidebar narrows the content, so this may follow from the shell. Reported because the column count differs at the artboard's width.
- visible: at a glance

### D-8 Phone row 2: the view buttons are shorter than the design's 44px
- design: `min-height:44px` on both buttons (Phone.dc.html:13,14)
- implementation: both buttons are about 37px tall (y=214 to 251) in shots/item5-video-390-ja.png and shots/item5-clips-390-ja.png. Not set in ViewMenus.tsx.
- visible: only by measuring

### D-9 Phone row 2: the 並び順 icon is squeezed (recorded in decisions.md)
- design: both icons stay 16x16 (Phone.dc.html:16)
- implementation: the ArrowDownUp icon is narrower than the LayoutList icon at 390px (shots/item5-video-390-ja.png), measured 10.7x16 per decisions.md item 5. The value is ellipsized as designed.
- visible: side by side

### D-10 Not shown in R-5: Clips and Notes at the artboard width in the states the design draws
- design: ClipsFolder is drawn with Target レシピ, folder shelves ordered by count and cards at 200px. NotesRail is drawn with the default Folders segment.
- implementation: R-5 has no Notes screenshot with the Folders segment shown (every Notes shot, item3, shows タグ because the legacy key was seeded), so the folder rail entries (すべて with count, folder rows at 34px) under the new menu cannot be checked. The Reading Library at 1280 with Date Added is shown, but Reading Folder grouping at 390px is not. Phone row 2 is shown for Video, Reading (item5-reading-390) and Clips only with 追加日 selected.
- visible: cannot be checked

TOTAL: 10 findings
