# Design check

at: c25c19b6c8c295086352537a5b2c694199b50325
design: docs/process/reviews/feature-smart-folder-overwrite/design/

## Decisions read from the design
- Main (960): chips row ends with a flex spacer then a sand 上書き保存 button, Save icon 16px, 14px text, padding 6px 12px, radius 16px, bg #e5e5e0, no border (Main.dc.html:23-24)
- Main: chips tag + 長さ 10分以上 + dashed ＋ 条件 (Main.dc.html:20-22)
- Main: results bar = ファイル/箇所 segmented toggle (192px), シーン検索 checkbox, spacer, count "18 件", 表示 button, sort button "関連度順", ⋯ (Main.dc.html:27-38)
- Main: grid 4 columns, gap 16, 16:9 thumbs radius 12 (Main.dc.html:39)
- Unchanged (960): no 上書き保存 button in chips row (Unchanged.dc.html:19-22)
- Unchanged: ⋯ menu right-aligned under the button, width 232px, radius 16, shadow; items in order: muted header "保存済み: 京都の旅行", 上書き保存 (disabled, grey, Save icon), 名前変更 (pencil), 削除 (red, trash), divider, 選択モード (Unchanged.dc.html:42-49)
- Phone (375): button on its own wrapped line right-aligned, min-height 44px (Phone.dc.html:24)
- Phone: results bar = ファイル/箇所 toggle 148px, シーン checkbox, count "18 件", 44px ⋯ only; grid 2 columns gap 12 (Phone.dc.html:27-40)

## Findings
### D-1 Main: results bar content differs (toggle and シーン検索 missing, labels differ)
- design: ファイル/箇所 toggle, シーン検索 checkbox, 表示, 関連度順 (Main.dc.html:28-37)
- implementation: changed state shows only count, "グリッド表示", "新しい順" and ⋯; no toggle, no シーン検索 (shots/23-changed-1280.png). Author attributes this to the missing search addon and operator queries hiding シーン検索 (decisions.md:63-67), not to a human decision in the spec.
- visible: at a glance

### D-2 Phone: results bar lacks toggle and シーン
- design: ファイル/箇所 toggle + シーン checkbox + count + ⋯ (Phone.dc.html:28-35)
- implementation: only "2件" and ⋯ (shots/42-changed-375.png); same cause as D-1 (decisions.md:63-67)
- visible: at a glance

### D-3 Main/Phone: 長さ chip label differs
- design: "長さ 10分以上" (Main.dc.html:21)
- implementation: "長さ >1s" (shots/42-changed-375.png; decisions.md:63)
- visible: side by side

### D-4 Unchanged: ⋯ menu narrower than drawn
- design: width 232px (Unchanged.dc.html:42)
- implementation: menu spans about x=1064 to 1264, roughly 200px (shots/21-unchanged-menu-open-1280.png). Item order, disabled grey 上書き保存, red 削除, divider match.
- visible: only by measuring

### D-5 Count format
- design: "18 件" with a space (Main.dc.html:34)
- implementation: "3件" / "2件" without a space (shots/23-changed-1280.png, shots/42-changed-375.png)
- visible: only by measuring

### D-6 Phone ⋯ menu not drawn in design, not checkable
- design: no artboard of the open ⋯ menu at 375
- implementation: bottom sheet with 表示, ソート and 保存済み footer; the 上書き保存/名前変更/削除 rows are not visible in shots/41-unchanged-menu-open-375.png (sheet cut at the 保存済み header)
- visible: not shown in R-5, cannot be checked

TOTAL: 6 findings
