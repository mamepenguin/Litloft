# Design check

at: 329f3f6fcc04d25973e8bc2c3f9b0c06c0e619b1
design: docs/process/reviews/feature-search-operator-negation/design/

Note: the worktree HEAD is 948a2a238; the screenshots were taken at the sha above. All paths below are under docs/process/reviews/feature-search-operator-negation/.

## Decisions read from the design
- Main (variant A): page 1280 wide, padding 32px 48px; input h40, radius 12, 15px (design/Main.dc.html:16,22)
- Main: chip row below input, gap 12 from input, chips gap 8, wrap (Main.dc.html:18,25)
- Main: normal chip = sand #e5e5e0 pill, 12px/16px, padding 2px 4px 2px 8px, bold (600) label then value, x button (Main.dc.html:26-29)
- Main A: negated chip = transparent, inset 1px ring #b9b9b2, "除外" muted #62625b, then bold label, then value; x aria "除外 タグ 2023 を外す" (Main.dc.html:32-39)
- Main: has: chip = sand pill, bold label only ("コレクション未登録"), no value (Main.dc.html:64-67)
- Main: "＋ 条件" = dashed 1px #91918c pill, padding 4px 10px, 12px muted, last in row (Main.dc.html:68)
- Main: chip height = 2+16+2 = 20px (button line-height 12 + padding 2) (Main.dc.html:26-28)
- Menu: popover 224px wide, radius 12, 1px border, shadow, padding 4px 0, left-aligned under "＋ 条件" (Menu.dc.html:28)
- Menu: 10 items in order タグ, 種類, フォルダ, コレクション, サイズ, 長さ, 更新日, お気に入り, タグなし, コレクション未登録 (Menu.dc.html:29-38)
- Menu: item 14px/20px, padding 8px 12px (36px pitch), disabled opacity .5 with タグなし disabled when a tag chip is present (Menu.dc.html:14-16,37)
- Phone: 375 wide, padding 24px 16px, gap 12; input, then chip row directly, then empty text "該当するファイルはありません" 14px muted centered, no icon (Phone.dc.html:16-39)
- Phone: long negated chip max-width 100%, "除外 フォルダ <value>" single line with ellipsis, x flex-shrink 0 (Phone.dc.html:29-32)
- Phone: chip order tag, 除外 tag, long 除外 folder, タグなし (sand, label only), ＋ 条件 (Phone.dc.html:21-37)
- Phone: no image-search button and no toolbar drawn between input and chips or below chips (Phone.dc.html:17-39)

## Findings
### D-1 Phone: empty state differs in form
- design: plain centered muted 14px text "該当するファイルはありません", no icon, no count/toolbar row (design/Phone.dc.html:39)
- implementation: large search icon, bold heading 一致するファイルが見つかりません, muted sub-line 検索条件を変更してください。, plus a "0 件" / ... toolbar row above it (r5/design-long-375.png, r5/design-main-375.png; same at 1280 in r5/design-main-1280.png)
- visible: at a glance

### D-2 Phone: extra 画像で探す button between input and chips
- design: input then chip row with 12px gap; nothing between (design/Phone.dc.html:17-20)
- implementation: a sand pill "画像で探す" sits between the input and the chips at 375, pushing the chips down by about 50px (r5/design-main-375.png, r5/design-long-375.png)
- visible: at a glance

### D-3 Menu: popover narrower than drawn
- design: width 224px (design/Menu.dc.html:28)
- implementation: about 199px wide at 1280 (x 256 to 455 in r5/menu-root-1280.png; 355 to 554 in r5/menu-root-tagged-1280.png). Item pitch 36px, order, labels and disabled タグなし match.
- visible: only by measuring

### D-4 Menu at 375: design draws only the popover; implementation is a bottom sheet
- design: the only Menu artboard is the 420px popover; no 375 menu is drawn (design/Menu.dc.html:28; canvas.json Menu 420 wide)
- implementation: at 375 the menu is a full-width bottom sheet with the page dimmed behind it and larger text and rows (r5/menu-root-375.png). The design does not show this form, so it cannot be checked against it.
- visible: at a glance

### D-5 Chip height taller than drawn
- design: chip is 20px tall (2px padding + 16px line; x button line-height 12 + 2px padding) (design/Main.dc.html:26-28)
- implementation: chips measure about 22-24px tall in the screenshots (r5/design-main-1280.png, r5/design-long-1280.png). The x button is `p-0.5` with default line height inside the 16px line (frontend/src/components/search/SearchFilterChips.tsx:128). Row gap and padding otherwise match.
- visible: only by measuring

### D-6 Negated chip ring lighter than drawn
- design: inset 1px ring #b9b9b2 (design/Main.dc.html:32)
- implementation: `ring-warm-silver/50` = #91918c at 50% on white, about #c8c8c5 (SearchFilterChips.tsx:101; globals.css:50). The ring is fainter than the design's.
- visible: only by measuring

### D-7 Main: the drawn combined row is not shown in R-5
- design: one row with a normal tag chip, two 除外 chips and the コレクション未登録 chip (sand, label only), then "＋ 条件", at 1280 (design/Main.dc.html:26-68)
- implementation: no screenshot at 1280 shows tag + 除外 tag + 除外 folder + コレクション未登録 together on the search page. r5/design-main-1280.png shows the first three; the has: chip appears only with タグなし in r5/design-long-1280.png. The search-window screenshots (win2-1280-3/4.png) are a different surface from the page artboard. Not shown in R-5 as drawn; cannot be checked.
- visible: only by measuring

TOTAL: 7 findings
