# Design check

at: 88893750a17d38c570dd4e3813d3799da71b29f9
design: docs/process/reviews/feature-smart-collection-parity/design/

## Decisions read from the design
- Main (1200): results bar order = 8件 (13px muted), 再生, グリッド表示, 関連度順, … (Main.dc.html:23-28)
- Main: 再生 = secondary bg #e5e5e0, 32px high, 14px/500, Play icon; other controls 34px, white with border (Main.dc.html:25-28)
- Main: menu 200px wide: 保存済み: name, 上書き保存 (disabled), 名前変更, ホームに置く, 削除 (red), rule, ここに質問, 選択モード (Main.dc.html:36-45)
- Main: 4 card columns, gap 12px (Main.dc.html:30)
- Phone (375): bar = 8件 + … only (44px button); sheet over 35% scrim, inset 8px, bottom 16px; 再生 first row, rule, 表示 (2 rows), rule, ソート (one row, 関連度順 only), rule, saved block, rule, ここに質問, 選択モード; whole sheet visible at once at 812 (Phone.dc.html:18-41)
- Queue (1200): player left (flex 1), queue panel right 360px, gap 40px (Queue.dc.html:15-21)
- Queue: panel title 16/600, `1/8トラック` 13px muted, loop button muted grey no background (Queue.dc.html:22-27)
- Queue: numbered rows 44px, number, title (ellipsis), duration at right; current row 40px pink #fbeaea with ▶ (Queue.dc.html:29-33)
- Ask (760): textarea first (2 rows), chip row below it (コレクション あんこ動画 × and ＋ 範囲), no page header/tabs drawn (Ask.dc.html:17-21)
- Ask: collection menu 240px with ← 戻る, filter input placeholder `コレクションを検索`, rows with icons (Ask.dc.html:22-30)

## Findings
### D-1 Queue: video queue is a thumbnail grid below the player, not a right-hand numbered list
- design: 360px panel to the right of the player with 44px numbered rows (title + duration), gap 40px (Queue.dc.html:15-33)
- implementation: for a video Smart Collection the panel is full content width under the player and shows a 4-column thumbnail grid with titles, no row numbers, no duration column (shots/queue-1200-ja.png, shots/queue-1440-ja.png). Only audio gets the right-hand numbered list (shots/queue-audio-1200-ja.png). decisions.md section 2/6 D4 states this as the app's behaviour, with no attribution to a human decision.
- visible: at a glance

### D-2 Queue: loop button looks active (pink pill) rather than muted grey
- design: borderless muted-grey icon, color #62625b (Queue.dc.html:27)
- implementation: red icon on a pink rounded background (shots/queue-1200-ja.png, shots/queue-audio-1200-ja.png)
- visible: side by side

### D-3 Phone sheet: sort section lists all 7 options and the sheet does not fit at 375x812
- design: ソート shows a single row (関連度順); the whole sheet, including ここに質問 and 選択モード, is visible at once (Phone.dc.html:30-40)
- implementation: ソート lists 7 options; the sheet is 60vh and scrolls, ここに質問 and 選択モード are below the fold at 375x812 (shots/search-smart-375x812-ja-sheet-bottom.png; decisions.md D3). In shots/search-smart-375-ja-sheet.png 選択モード is not visible.
- visible: at a glance

### D-4 Ask: chip row sits above the question field, with a page header and tabs the design does not draw
- design: textarea first, chip row (コレクション あんこ動画 ×, ＋ 範囲) beneath it, no header or tabs (Ask.dc.html:17-21)
- implementation: header (質問 / 動画 · 8件), Ask/Find tabs, then the chip row, then the textarea with hint text, model select and 質問する button (shots/ask-760-ja-chip.png); the collection menu opens over the field (shots/ask-760-ja-collections.png). decisions.md D5 says "one column as drawn" but the field/chip order is reversed.
- visible: at a glance

### D-5 Ask collection menu: filter placeholder wording differs
- design: `コレクションを検索` (Ask.dc.html:26)
- implementation: `コレクションを絞り込む` (shots/ask-760-ja-collections.png)
- visible: side by side

### D-6 Search page: 画像で探す control present, not drawn
- design: Phone shows only the query field then `8件` and `…` (Phone.dc.html:17-21); Main's field has no image-search icon (Main.dc.html:17)
- implementation: a large 画像で探す button beside the condition chips at 375 (shots/search-smart-375-ja-bar.png) and an icon in the query field at 768/1440 (shots/search-smart-1440-ja-menu.png)
- visible: side by side

### D-7 Main: height of the other bar buttons
- design: 再生 32px, other controls 34px (Main.dc.html:25-28)
- implementation: decisions.md states the others are 38px (.r5 manifest not opened by this check)
- visible: only by measuring

TOTAL: 7 findings
