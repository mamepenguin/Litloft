# Design check

at: 2ef70ee95b5affe1207d74aa9e98b7d711cec77a
design: docs/process/reviews/feature-player-workbench/design/

Second re-check. Evidence: R-5 run 5 shots (shots/R5-*.png, taken at the sha above) for what run 5 covers; shots/R4-*.png (core 21fa54f6e) for the rest. Between R4 and R5 only the panel header height and the D-12/D-13/D-14 fixes changed, so R4 shots stand for the unchanged screens. Status of each earlier ID: FIXED / ACCEPTED (decisions.md "Design differences" cited) / OPEN.

## Decisions read from the design
(unchanged; values re-read against the same files)

Main.dc.html (1440x900, two panels; AOne = preset one, AOff = preset none, same file)
- Layout: header 56, breadcrumb bar 48, main + 384px inspector (Main.dc.html:19, 33, 134)
- Main column padding 16, gap 10 between player, row, panels (Main.dc.html:43)
- Player centred, 704x396 with a panel on, 1024x576 with none, radius 12 (Main.dc.html:46, 234-235)
- Toggle row: pills 32px high, padding 0 14, 12px, radius 16, gap 6; on = accent border, 600, primary text; off = 1px rgba(255,255,255,0.14) border, muted text, 500 (Main.dc.html:59, 204)
- Toggle order: 文字起こし, シーン, 詳細要約, ノート (Main.dc.html:198-201)
- 引用 chip at the trailing end of the row (Main.dc.html:64). Accepted by the human, not part of the change.
- Panels: two equal columns, gap 12, flex 1 1 0 (Main.dc.html:68-70)
- Panel card: bg #231216, radius 12, no border (Main.dc.html:70)
- Panel header: 40px high, padding 0 8 0 14, bottom border, title h2 13px/600, close 32x32 radius 8, 16px X (Main.dc.html:71-73)
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
- status: FIXED. Header 40px including border in every panel measured in run 5 (decisions.md run 5); title 13px (shots/R5-Main-1440-two-on-transcript-scenes-XN1lPMKvrM7S.png).
- design: header 40px, title 13px/600 (Main.dc.html:71-72)
- implementation: matches
- visible: not visible now

### D-2 Main: gap between the two panels is 16px, not 12px
- status: FIXED. Panels 386px wide, 12px apart (shots/R5-Main-1440-two-on-transcript-scenes-XN1lPMKvrM7S.png; decisions.md run 5).
- design: gap 12 (Main.dc.html:68)

### D-3 Main/Tablet: the transcript panel is not the plain list the design draws
- status: ACCEPTED (decisions.md, first "Design differences": D-3).
- design: plain rows, nothing above the rows, no inner box (Main.dc.html:78-82)
- implementation: sub-tabs 分割テキスト / 単語 (or 外部字幕) and "AI で整える" above the rows, rows in an inset box (shots/R5-Main-1440-two-on-transcript-scenes-XN1lPMKvrM7S.png)
- visible: at a glance

### D-4 Main/Tablet: the scenes panel is a timeline strip plus a 3-column grid, not a 2-column card grid
- status: ACCEPTED (decisions.md: D-4).
- design: 2 columns, gap 12, overlay time chip, label under the image (Main.dc.html:86-92)
- implementation: timeline strip with axis, time under each thumbnail (no overlay chip, no label), 3 columns at 384px (shots/R5-Main-1440-two-on-transcript-scenes-XN1lPMKvrM7S.png)
- visible: at a glance

### D-5 Main/Phone: the note panel is a bordered card with a header that wraps
- status: ACCEPTED (decisions.md: D-5).
- design: the note's own prose, no card, no header (Main.dc.html:113-122; Phone.dc.html:38-44)
- implementation: shots/R4-Main-1440-two-on-transcript-note-vb74.png; shots/R4-Phone-390-sheet-note-tab-vb74.png
- visible: at a glance

### D-6 Main: the Info action row wraps onto two lines at 384px
- status: ACCEPTED (decisions.md: D-6).
- design: 高評価, お気に入り, 確認済み, AI ▾, ⋮ on one line (Main.dc.html:156-162)
- implementation: Like, お気に入り, 検証済み on one line; AI, quote icon, ⋮ on a second (shots/R5-Main-1440-two-on-transcript-scenes-XN1lPMKvrM7S.png)
- visible: side by side

### D-7 Phone: header is two rows and shows no file title
- status: ACCEPTED (decisions.md: D-7).
- design: one 52px header, back chevron + file title (Phone.dc.html:17-20)
- implementation: global header plus a "‹ YouTube" row (shots/R5-Loft-390-sheet-info-loft--xV260C3SY5V.png)
- visible: at a glance

### D-8 Phone: the resting state has no tab strip or content under the player
- status: ACCEPTED (decisions.md: D-8).
- design: sheet directly under the player with tabs and content (Phone.dc.html:27-45)
- implementation: shots/R5-Loft-390-resting-loft--xV260C3SY5V.png (and R4-Phone-390-resting-stored-two-vb74.png)
- visible: at a glance

### D-9 Main: the inspector's チャプター tab is not shown in any R-5 shot
- status: FIXED (shown in shots/R4-Chapters-1440-tab-loft--xV260C3SY5V.png; tab present in shots/R5-Loft-1440-beside-loft--xV260C3SY5V.png). The list inside the tab sits in a card with its own collapsible 「チャプター」 header the artboard does not draw (minor, side by side).

### D-10 Main: a generated detailed-summary body in a panel is not shown
- status: ACCEPTED as unverifiable (decisions.md: D-10). Still not shown in R-5, cannot be checked.
- design: prose with h3, table, timestamp links (Main.dc.html:97-110)

### D-11 no R-5 shot of the workbench screens at the final build
- status: FIXED. R4 and R5 shots exist; R5 covers the 1440 two-panel, .loft and collection screens at the final build. Tablet and phone non-.loft screens are only in R4 (not re-shot; run 5 says only the header and the D-12..14 fixes changed since).

### D-12 Collection surface: the two panels have no gap between them
- status: FIXED. Panels at x=176-714 and 726-1264, 12px apart, both still within the 506px height (shots/R5-Collection-native-1440-transcript+chapters.png; at 390 the two stacked panels are separated by a visible gap in shots/R5-Collection-native-390-transcript+chapters.png).
- design: gap 12 (Main.dc.html:68)

### D-13 Collection surface at 390: toggle row and panels are inset narrower than the player
- status: FIXED. Row, panels and video frame all span x=16-374 (shots/R5-Collection-native-390-transcript+chapters.png).
- design: shared 16px inset (Main.dc.html:43)

### D-14 .loft pages: a metadata block sits between the player and the toggle row
- status: FIXED on the canonical page (decisions.md, second "Design differences": D-14). Channel/date line and description are in Info under the title, nothing between player and row (shots/R5-Loft-1440-beside-loft--xV260C3SY5V.png; shots/R5-Loft-820-stacked-info-loft--xV260C3SY5V.png; shots/R5-Loft-390-sheet-info-loft--xV260C3SY5V.png). The collection surface still has it, see D-16 and D-17.

### D-15 .loft Info: no duration line under the title
- status: OPEN (new).
- design: title 20/700, then duration 12 muted, then the description (Main.dc.html:143-173)
- implementation: on a .loft the Info shows title, then the channel · date line, then the description; the video duration appears nowhere in Info (shots/R5-Loft-1440-beside-loft--xV260C3SY5V.png; shots/R5-Loft-390-sheet-info-loft--xV260C3SY5V.png). A native video shows the duration in the same position ("9:46:36", shots/R5-Main-1440-two-on-transcript-scenes-XN1lPMKvrM7S.png). decisions.md run 1 notes "Info shows no ... duration for a .loft", unchanged and not recorded as the human's decision.
- visible: side by side

### D-16 Collection surface, .loft: a metadata block still sits between the player and the toggle row
- status: OPEN (new). D-14's decision covers the canonical page; the collection surface was not mentioned. decisions.md run 5 states this as the current behaviour.
- design: player, toggle row, panels; no block between (Main.dc.html:43-65)
- implementation: channel · date line, 3-line description and もっと見る under the player at 1440 and 390, before the toggle row (shots/R5-Collection-loft-EKCONLkv6vZZ-1440-transcript.png; shots/R5-Collection-loft-EKCONLkv6vZZ-390-transcript.png). At 1440 this pushes the row to y=864, and the panel starts at 908.
- visible: at a glance

### D-17 Collection surface, .loft at 390: the description is inset 32px, the row and frame 16px
- status: OPEN (new).
- design: row and panels share the player's 16px inset (Main.dc.html:43)
- implementation: the description text starts at x=32 while the video frame, toggle row and panel start at x=16 (shots/R5-Collection-loft-EKCONLkv6vZZ-390-transcript.png; decisions.md run 5)
- visible: side by side

## Accepted by the human (not findings)
- Off toggles keep a thin neutral border tinted differently from the mock's rgba(255,255,255,0.14).
- Panel cards use an elevated background with no border.
- The mock's 引用 chip stands for `file-preview-actions` and is not part of the change.

TOTAL: 17 findings
