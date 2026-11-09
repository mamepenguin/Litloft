# Design check

at: d92051209522ec584f6696fb070802745fee2736
design: docs/process/reviews/feature-search-results-layout/design/

Screenshots are from d92051209; the later commit 770f9765c (long Smart Folder name truncates in the menu at 1280) is not shown in any R-5 screenshot.

## Decisions read from the design
- Main (1280): page = 240px sidebar, 56px top bar with 3 icons, page padding 28px 16px 0 (Main.dc.html:22)
- Main: query field 48px tall, radius 16, 18px text, image button 32px inside the field (Main.dc.html:23-25, 70)
- Main: chip row under the field, `＋ 条件` dashed pill 12px (Main.dc.html:26-27, 71)
- Main: results bar order = segmented control 192px wide, checkbox `シーン検索`, flexible gap, `63 件`, View icon button, Sort pill `関連度順`, `…` icon button; hairline under the bar (Main.dc.html:29-37, 73-81)
- Main: card grid = 4 columns, gap 16, card radius 16, 16:9 thumbnail, title 14/600 2-line clamp, meta 12, 10px neutral labels (Main.dc.html:39-47)
- Scene (1280): shelf under the bar: heading `シーン` 14/700, `20 区間` count, `すべて表示` button on the right, ONE row of 5 tiles (gap 12, radius 12, time 12/600, name 12 muted one line), then a `ファイル` 14/700 heading, then the 4-column grid (Scene.dc.html:49-57, 92-103)
- Phone (390): bar = hamburger left + 4 icons right; field 48px with NO image button; chip `＋ 条件` 32px tall; results bar one row: seg 148px (buttons 40px), `シーン` checkbox 44px, count `63 件`, `…` 44x44; 2-column grid gap 12, title 13/600 (Phone.dc.html:14-37, 49-57)
- Passages (1280): seg with 箇所 on; checkbox present; count `4 ファイル・15 箇所`; no View/Sort; rows `max-width:880px`; row = 120x68 thumbnail (doc placeholder reads `MD`/`PDF`, video shows duration), location 13/600, filename 12 muted ellipsis, excerpt 14/1.7 with yellow `mark` highlight on the hit; `このファイルの他の箇所 2 件 →` indented 140px (Passages.dc.html:49-58, 84-96)
- Menu (1280): `…` open state bg #f6f6f3; popover 260px wide, radius 16, right-aligned under the button; rows 14px with 16px icons: `スマートフォルダに保存`, separator, `選択モード`, `Findページを開く` (Menu.dc.html:49-54, 87-92)
- Filtered (1280): chip row = `種類 動画 ×` (sand pill, 種類 semibold) BEFORE `＋ 条件`; results bar = seg, gap, count, View, Sort, `…` with NO Scene checkbox (Filtered.dc.html:49-50, 73-81)

## Findings
### D-1 Main: 3 cards per row at 1280, design draws 4
- design: `repeat(4,minmax(0,1fr))`, gap 16 (Main.dc.html:39); card about 240px wide, thumbnails small
- implementation: 3 columns, each about 328px wide, thumbnails about 185px tall, so about 2 rows less per screen; only 6 cards on the first screen versus 8 in the design (r5/01-main-1280.png)
- visible: at a glance

### D-2 Scene: shelf is a multi-row grid of large tiles with no count or 「すべて表示」 in view, design draws one row of 5
- design: heading `シーン`, `20 区間`, `すべて表示` button top right, one row of 5 tiles, then `ファイル` heading (Scene.dc.html:50-57, 92-102)
- implementation: heading `シーン候補`, no count, tiles 328px wide in 3 columns wrapping to 3+ rows (8 tiles), `すべて表示（全 20件）` button below the tiles (visible in 02b, not above), and no `ファイル` heading between shelf and cards (r5/02-scene-1280.png, 02b-scene-scrolled-1280.png). The spec says the shelf's contents are the addon's and unchanged (search-results-layout.md:68-69); this is stated without being attributed to the human's decision.
- visible: at a glance

### D-3 Scene at 390: shelf tiles are a two-column wrapping grid, design phone artboard has no shelf (Scene artboard is 1280 only)
- design: not drawn at 390 (no Scene phone artboard)
- implementation: shelf of 2-column large tiles pushes the results below the first screen (r5/02-scene-390.png). Not shown in design, cannot be checked.
- visible: not checkable

### D-4 Phone: add-condition chip reads 「＋」, design draws 「＋ 条件」
- design: `＋ 条件`, 13px, 32px tall (Phone.dc.html:20, 50)
- implementation: a bare `＋` circle about 34x25px (r5/01-main-390.png). decisions.md lists this as a difference from the spec, not attributed to the human.
- visible: at a glance

### D-5 Passages: rows span the full content width, design caps at 880px
- design: `.rows{max-width:880px}` (Passages.dc.html:49)
- implementation: first row link x=256, width 960, right edge 1216 (decisions.md; r5/04-passages-1280.png); the excerpt runs to the right edge
- visible: side by side

### D-6 Passages: thumbnail is about 88x50, design 120x68, and has no `MD`/`PDF` label or duration
- design: `.fi` 120x68; doc placeholder text `MD`/`PDF`; video thumbnail carries a duration chip (Passages.dc.html:52-53, 93-98)
- implementation: thumbnail about 88px wide; documents show a generic document glyph; the video row shows no duration (r5/04-passages-1280.png)
- visible: side by side

### D-7 Passages: no highlight on the matched term
- design: `mark` yellow #fff8c5 on 「会議」 in each excerpt (Passages.dc.html:57, 93-98)
- implementation: excerpts drawn as plain text, no highlight (r5/04-passages-1280.png, 04-passages-390.png)
- visible: at a glance

### D-8 Passages: 「このファイルの他の箇所」 link is not indented
- design: `padding:0 6px 10px 140px`, aligned under the text column (Passages.dc.html:58, 96)
- implementation: link starts at x=260, the thumbnail edge, with the row text starting at x=362 (r5/04-passages-1280.png)
- visible: side by side

### D-9 Passages: row excerpt is 14px/1.7 in design, drawn smaller and tighter
- design: `.ex` 14px, line-height 1.7 (Passages.dc.html:56)
- implementation: excerpt about 13px with line pitch about 21px (r5/04-passages-1280.png). Read from the screenshot only; exact class not checked.
- visible: only by measuring

### D-10 Menu: popover is about 200px wide, design 260px
- design: `.pop{width:260px}` (Menu.dc.html:51)
- implementation: menu spans x=1064..1264 (200px) (r5/05-menu-1280.png); `…` button does not show the #f6f6f3 open fill (design Menu.dc.html:50)
- visible: side by side

### D-11 Filtered: Scene checkbox (and shelf) stay with a type chip, design draws no checkbox
- design: results bar with `種類 動画 ×` has no `シーン検索` checkbox (Filtered.dc.html:76-78)
- implementation: checkbox present and checked, shelf shown, with the type chip (r5/07-typechip-1280.png; decisions.md "checkbox still present"). The spec D10 hides the checkbox only for an operator in the query.
- visible: at a glance

### D-12 Long Smart Folder name in the menu at 1280: not shown after the fix
- design: menu is 260px wide, rows one line (Menu.dc.html:51-52)
- implementation: the only R-5 shot of a long name (r5/08e-sf-menu-longname-1280.png) predates 770f9765c and shows the menu widened to about 630px across the bar; the post-fix state is not in R-5, cannot be checked.
- visible: not checkable

### D-13 Image button in the query field, image error line, and 「画像で探す」 pill order
- design: 32px image button inside the field at 1280 (Main.dc.html:70); phone shows none
- implementation: not drawn in any R-5 screenshot (image query unavailable on that stack, per decisions.md), cannot be checked
- visible: not checkable

### D-14 Type chip at 390 and Passages/Menu at 390 combined states
- design: Filtered artboard is 1280 only; Menu artboard is 1280 only
- implementation: 07-typechip-390.png, 05-menu-390.png exist but have no design counterpart, cannot be checked against a drawn value
- visible: not checkable

TOTAL: 14 findings
