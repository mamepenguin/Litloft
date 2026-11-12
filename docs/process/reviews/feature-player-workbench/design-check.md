# Design check

at: 21fa54f6edec353218fcdeb29a4068eb2bb64448
design: docs/process/reviews/feature-player-workbench/design/

Re-check of the first check. Evidence: R-5 run 4 shots (shots/R4-*.png, taken at the sha above). One commit after the shots makes the panel header 40px including its 1px border; the shots show 41px, so the header height is taken as 40 and is not itself in a shot. Status of each first-check ID: fixed / accepted (decision cited) / open.

## Decisions read from the design
(unchanged from the first check; values re-read against the same files)

Main.dc.html (1440x900, two panels; AOne = preset one, AOff = preset none, same file)
- Layout: header 56, breadcrumb bar 48, main + 384px inspector (Main.dc.html:19, 33, 134)
- Main column padding 16, gap 10 between player, row, panels (Main.dc.html:43)
- Player centred, 704x396 with a panel on, 1024x576 with none, radius 12 (Main.dc.html:46, 234-235)
- Toggle row: pills 32px high, padding 0 14, 12px, radius 16, gap 6; on = accent border, 600, primary text; off = 1px rgba(255,255,255,0.14) border, muted text, 500 (Main.dc.html:59, 204)
- Toggle order: 文字起こし, シーン, 詳細要約, ノート (Main.dc.html:198-201)
- 引用 chip at the trailing end of the row (Main.dc.html:64). Accepted by the human, not part of the change.
- Panels: two equal columns, gap 12, flex 1 1 0 (Main.dc.html:68-70)
- Panel card: bg #231216, radius 12, no border (Main.dc.html:70)
- Panel header: 40px high, padding 0 8 0 14, bottom border, title h2 13px/600, close button 32x32 radius 8 with a 16px X (Main.dc.html:71-73)
- Panel body: scrolls, padding 8 14 14 (Main.dc.html:75)
- Transcript body: plain rows, 40px mono 12px time column, 13px text, active row tinted; no sub-tabs, no inner box (Main.dc.html:78-82, 221)
- Scenes body: 2-column grid, gap 12, 16:9 thumbnail radius 8 with time overlay chip, 12px label (Main.dc.html:86-92)
- Detailed summary body: 14px prose, 15px h3, table 13px cells (Main.dc.html:97-110)
- Note body: 14px prose, 18px/700 heading, blockquote, list; no card or badge header (Main.dc.html:114-122)
- Inspector tabs: 情報, チャプター, 関連, Ask; 12px, active 600 with 2px accent underline (Main.dc.html:135-139)
- Info order: title 20/700, duration 12 muted, description 13 muted clamped to 3 lines with もっと見る, one action row on a single line, tag line, divider, AI 要約 and コメント (Main.dc.html:143-173)

Tablet.dc.html (820x1180)
- Player on top, 443 high, radius 12, inset 16; no toggle row; tab strip under the player (scrolls, 44 min-height, order 情報, チャプター, 文字起こし, シーン, 詳細要約, ノート, 関連, Ask); selected panel fills the area under the strip (Tablet.dc.html:23-50)

Phone.dc.html (390x844)
- Single 52px header, back chevron + file title; player 219 full bleed; sheet #231216, top radius 16, 36x4 handle, tab strip (44px, same order as the tablet), content below; note as plain prose (Phone.dc.html:17-45)

Current.dc.html: baseline only, not checked.

## Findings

### D-1 Main: panel header is taller and its title larger
- status: FIXED. Header 40px (final commit), title 13px.
- design: header 40px, title 13px/600 (Main.dc.html:71-72)
- implementation: header runs about y=578-618 with a 13px title (shots/R4-Main-1440-two-on-transcript-scenes-XN1.png; decisions.md run 4 measures 41px incl. border at the shot build; the later commit makes it 40)
- visible: was side by side; now not visible

### D-2 Main: gap between the two panels is 16px, not 12px
- status: FIXED. 12px between panels on the canonical page.
- design: gap 12 (Main.dc.html:68)
- implementation: panels at x=256-641 and 654-1040 (shots/R4-Main-1440-two-on-transcript-scenes-XN1.png; decisions.md run 4: 386px columns 12px apart)
- visible: was only by measuring

### D-3 Main/Tablet: the transcript panel is not the plain list the design draws
- status: ACCEPTED (decisions.md, "Design differences": D-3, the sub-tab bar and inner box are the transcript's existing UI).
- design: plain rows, nothing above the rows, no inner box (Main.dc.html:78-82)
- implementation: sub-tabs 分割テキスト / 単語 and "AI で整える" above the rows, rows in an inset box, text wrapping at about 55% of the panel (shots/R4-Main-1440-two-on-transcript-scenes-XN1.png; shots/R4-Tablet-820-transcript-tab-loft--xV260C3SY5V.png)
- visible: at a glance

### D-4 Main/Tablet: the scenes panel is a timeline strip plus a 3-column (1440 two panels) or 6-column (820) grid, not a 2-column card grid
- status: ACCEPTED (decisions.md: D-4, SPEC-ADDON-089/093).
- design: 2 columns, gap 12, overlay time chip, label under the image (Main.dc.html:86-92)
- implementation: timeline strip with axis on top, time printed under each thumbnail, no label, 3 columns at 384px, 6 at 820, a "シーンを作り直す" link and a description box under the grid at 820 (shots/R4-Main-1440-third-on-scenes-vb74.png; shots/R4-Tablet-820-scenes-tab-XN1.png)
- visible: at a glance

### D-5 Main/Phone: the note panel is a bordered card with a header that wraps
- status: ACCEPTED (decisions.md: D-5, knowledge's own section card).
- design: the note's own prose, no card, no header (Main.dc.html:113-122; Phone.dc.html:38-44)
- implementation: inner bordered card with "要約ノート", a KNOWLEDGE badge and "Knowledge で編集"; at 384px and at 390 the title, badge and link wrap (shots/R4-Main-1440-two-on-transcript-note-vb74.png; shots/R4-Phone-390-sheet-note-tab-vb74.png)
- visible: at a glance

### D-6 Main: the Info action row wraps onto two lines at 384px
- status: ACCEPTED (decisions.md: D-6).
- design: 高評価, お気に入り, 確認済み, AI ▾, ⋮ on one line (Main.dc.html:156-162)
- implementation: Like, お気に入り, 検証済み on one line; AI, quote icon, ⋮ on a second; tags on a third. Labels differ (Like / 検証済み) and a quote button is extra (shots/R4-Main-1440-two-on-transcript-note-vb74.png). At 820 the row is a single line beside the title (shots/R4-Tablet-820-info-vb74.png)
- visible: side by side

### D-7 Phone: header is two rows and shows no file title
- status: ACCEPTED (decisions.md: D-7).
- design: one 52px header, back chevron + file title (Phone.dc.html:17-20)
- implementation: global 56px header plus a "‹ YouTube" row; player starts at y=104 (shots/R4-Phone-390-sheet-note-tab-vb74.png; shots/R4-Phone-390-resting-stored-two-vb74.png)
- visible: at a glance

### D-8 Phone: the resting state has no tab strip or content under the player
- status: ACCEPTED (decisions.md: D-8).
- design: sheet directly under the player with tabs and content (Phone.dc.html:27-45)
- implementation: empty area under the player and a bottom bar (title, like, star, more); tabs appear only when the sheet is raised (shots/R4-Phone-390-resting-stored-two-vb74.png)
- visible: at a glance

### D-9 Main: the inspector's チャプター tab is not shown in any R-5 shot
- status: FIXED (now shown).
- design: tabs 情報, チャプター, 関連, Ask (Main.dc.html:136-139); 820 strip includes チャプター (Tablet.dc.html:34)
- implementation: tabs 情報, チャプター, 関連, 質問 with チャプター selected showing the list (shots/R4-Chapters-1440-tab-loft--xV260C3SY5V.png); at 820 and 390 the strip carries チャプター after 情報 (shots/R4-Tablet-820-transcript-tab-loft--xV260C3SY5V.png). Inside the tab the list sits in a card with its own collapsible 「チャプター」 header, which the artboard does not draw
- visible: side by side (the extra card header only)

### D-10 Main: a generated detailed-summary body in a panel is not shown
- status: ACCEPTED as unverifiable (decisions.md: D-10); still not shown in R-5, cannot be checked.
- design: prose with h3, table, timestamp links (Main.dc.html:97-110)
- implementation: no R4 shot opens a 詳細要約 body (decisions.md run 4: body not opened)
- visible: not shown

### D-11 no R-5 shot of the workbench screens at the final build
- status: FIXED. R4 shots cover AOff, AOne, Main two-on and third-on, light theme, tablet and phone at the final build.
- design: all artboards
- implementation: shots/R4-*.png
- visible: n/a

### D-12 Collection surface: the two panels have no gap between them
- status: OPEN (new; collection pages are not an artboard, but the panel pair is drawn with gap 12).
- design: gap 12 between panels (Main.dc.html:68)
- implementation: at 1440 /files/...?folder_play=1 the panels meet at x=720 with no space (shots/R4-Collection-1440-two-on.png; decisions.md run 4: grid gap 0px, 12px only when none is on); at 390 stacked panels touch (shots/R4-Collection-390-two-on.png)
- visible: side by side

### D-13 Collection surface at 390: toggle row and panels are inset narrower than the player
- status: OPEN (new).
- design: row and panels share the player's 16px inset (Main.dc.html:43)
- implementation: row and panels at x=32-358 while the player spans 16-374 (decisions.md run 4; shots/R4-Collection-390-two-on.png)
- visible: side by side

### D-14 .loft pages: a metadata block sits between the player and the toggle row
- status: OPEN (new). Spec keeps the .loft metadata aside under the player (SPEC-CORE-085 step 3, per decisions.md run 1), not stated as the human's decision.
- design: player, toggle row, panels; no block between (Main.dc.html:43-65; Tablet.dc.html:23-32)
- implementation: on a .loft the channel/date line, description and もっと見る sit under the player, pushing the row to y=647 and the panel to 690; with transcript on the panel is 288px and <main> scrolls (shots/R4-Chapters-1440-tab-loft--xV260C3SY5V.png; shots/R4-Tablet-820-transcript-tab-loft--xV260C3SY5V.png)
- visible: at a glance

## Accepted by the human (not findings)
- Off toggles keep a thin neutral border tinted differently from the mock's rgba(255,255,255,0.14).
- Panel cards use an elevated background with no border.
- The mock's 引用 chip stands for `file-preview-actions` and is not part of the change.

TOTAL: 14 findings
