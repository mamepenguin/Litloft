# Design check

at: 25bd0b2279f66f24b1c35c7303036d071ab94c9c
design: docs/process/reviews/feature-player-workbench/design/

Note on evidence: the R3 shots (the build at the sha above) cover only theme, profile, sidebar, tree yield and the description save. Every workbench layout screen (A*, G*, H*, L-*, B*) was taken in run 1 (da8cf4492) or run 2 (016aa51a0). The CSS and `Workbench.tsx` read here are the current tree.

## Decisions read from the design

Main.dc.html (1440x900, two panels; AOne = preset one, AOff = preset none, same file)
- Layout: header 56, breadcrumb bar 48, main + 384px inspector (Main.dc.html:19, 33, 134)
- Main column padding 16, gap 10 between player, row, panels (Main.dc.html:43)
- Player centred, 704x396 with a panel on, 1024x576 with none, radius 12 (Main.dc.html:46, 234-235)
- Toggle row: pills 32px high, padding 0 14, 12px, radius 16, gap 6; on = accent border, 600, primary text; off = 1px rgba(255,255,255,0.14) border, muted text, 500 (Main.dc.html:59, 204)
- Toggle order: 文字起こし, シーン, 詳細要約, ノート (Main.dc.html:198-201)
- 引用 chip at the trailing end of the row (Main.dc.html:64). Accepted as not part of the change.
- Panels: two equal columns, gap 12, flex 1 1 0 (Main.dc.html:68-70)
- Panel card: bg #231216, radius 12, no border (Main.dc.html:70)
- Panel header: 40px high, padding 0 8 0 14, bottom border, title h2 13px/600, close button 32x32 radius 8 with a 16px X (Main.dc.html:71-73)
- Panel body: scrolls, padding 8 14 14 (Main.dc.html:75)
- Transcript body: plain rows, 40px mono 12px time column, 13px text, active row tinted accent 0.18; no sub-tabs, no inner box (Main.dc.html:78-82, 221)
- Scenes body: 2-column grid, gap 12, 16:9 thumbnail radius 8 with the time as an overlay chip at bottom-left, 12px label under it (Main.dc.html:86-92)
- Detailed summary body: 14px prose, 15px h3, table with 13px cells (Main.dc.html:97-110)
- Note body: 14px prose, 18px/700 heading, blockquote on #2f191b, list (Main.dc.html:114-122); no card or badge header
- Inspector tabs: 情報, チャプター, 関連, Ask; 12px, active = 600 with 2px accent underline (Main.dc.html:135-139)
- Info order: title 20px/700, duration 12px muted, description 13px muted clamped to 3 lines with もっと見る (12px/600), one action row (高評価, お気に入り, 確認済み, AI ▾, ⋮) on a single line, tag line, divider, then AI 要約 and コメント sections (Main.dc.html:143-173)

Tablet.dc.html (820x1180)
- Player on top, 443px high, radius 12, inset 16 (Tablet.dc.html:23-24)
- No toggle row (Tablet.dc.html:23-31)
- Tab strip under the player, scrolls sideways, tabs min-height 44, order 情報, チャプター, 文字起こし, シーン, 詳細要約, ノート, 関連, Ask (Tablet.dc.html:32-41)
- Selected panel content fills the area under the strip, transcript rows as in Main (Tablet.dc.html:42-50)

Phone.dc.html (390x844)
- Single 52px header: back chevron + the file title (Phone.dc.html:17-20)
- Player 219px, full bleed (Phone.dc.html:21)
- Sheet: bg #231216, top radius 16, 8px above it, 36x4 handle, tab strip (44px tabs, 12px) same order as the tablet, content below (Phone.dc.html:27-45)
- Note content as plain prose (heading 18/700, paragraph, blockquote, list) (Phone.dc.html:38-44)

Current.dc.html: today's page; used only as the baseline, not checked.

## Findings

### D-1 Main: panel header is taller and its title larger
- design: header 40px, title 13px/600 (Main.dc.html:71-72)
- implementation: header is 8px + 32px close button + 8px = 48px, title `text-sm` (14px). In A2 the header runs y=578-626 (shots/A2-1440-two-on.png; frontend/src/app/globals.css:1028-1036, Workbench.tsx:120)
- visible: side by side

### D-2 Main: gap between the two panels is 16px, not 12px
- design: gap 12 (Main.dc.html:68)
- implementation: gap 1rem; panels at x=256-640 and 656-1040 (shots/A2-1440-two-on.png; globals.css:990-996)
- visible: only by measuring

### D-3 Main/Tablet: the transcript panel is not the plain list the design draws
- design: plain rows (time column, text), active row tinted; nothing above the rows, no inner box (Main.dc.html:78-82)
- implementation: a sub-tab bar (分割テキスト / 単語) and an "AI で整える" link above the rows. At 1440 the rows sit in a second inset box inside the card, so the card is boxed twice and the text wraps at about 55% of the panel width (shots/A2-1440-two-on.png; shots/A1-1440-one-on.png). At 820 stacked the same sub-tab bar sits above the rows (shots/G1-820-stacked-transcript-tab.png)
- visible: at a glance

### D-4 Main/Tablet: the scenes panel is a timeline strip plus a 3-column (1440 two panels) or 6-column (820) thumbnail grid, not a 2-column card grid
- design: 2 columns, gap 12, 16:9 thumbnail with the time as an overlay chip, a text label under it (Main.dc.html:86-92)
- implementation: a timeline/waveform strip with a 0:00-9:42 axis on top; thumbnails with the time printed below the image and no label; 3 columns in a 384px panel, 6 at 820; a "シーンを作る" button after the grid at 820 (shots/A2-1440-two-on.png; shots/G2-820-stacked-scenes-tab.png)
- visible: at a glance

### D-5 Main/Phone: the note panel is a bordered card with a header, and the header wraps
- design: the note's own prose, no card, no header (Main.dc.html:113-122; Phone.dc.html:38-44)
- implementation: a second bordered card inside the panel with a "要約ノート" title, a KNOWLEDGE badge and a "Knowledge で編集" link. At 384px panel width and at 390 phone the title wraps ("要約ノー/ト"), the badge wraps ("KNOWLEDG/E") and the link wraps onto two lines (shots/B5-dark-1440-dormant-detailed-plus-note.png; shots/H4-390-phone-sheet-note.png). The spec lists this header as "Checked, no action" (spec line 706), without attributing it to the human
- visible: at a glance

### D-6 Main: the Info action row wraps onto two lines at 384px
- design: 高評価, お気に入り, 確認済み, AI ▾, ⋮ on one line (Main.dc.html:156-162)
- implementation: Like, お気に入り, 検証済み on the first line; AI, the quote icon and ⋮ on a second line; tags on a third (shots/L-1440-description-info.png). Labels differ from the mock's (Like / 検証済み against 高評価 / 確認済み), and an extra quote button is present
- visible: side by side

### D-7 Phone: header is two rows and shows no file title
- design: one 52px header with a back chevron and the file title (Phone.dc.html:17-20)
- implementation: the global 56px header (menu, search, icons) plus a second row with "‹ YouTube" and two icons; the file title appears only in the resting bottom bar, truncated (shots/H0-390-phone-resting.png, shots/H4-390-phone-sheet-note.png). The player starts at y=104 against the design's 52
- visible: at a glance

### D-8 Phone: the resting state has no tab strip or content under the player
- design: the sheet sits directly under the player with its tab strip and content (Phone.dc.html:27-45). Only this state is drawn
- implementation: at rest the area under the player is empty, with a bottom bar (title, like, star, more) at the foot; the sheet and tabs appear only after raising it (shots/H0-390-phone-resting.png; shots/H1-390-phone-sheet-info.png). The spec states a resting sheet has no tabs (spec line 220), not as a human decision
- visible: at a glance

### D-9 Main: the inspector's チャプター tab is not shown in any R-5 shot
- design: tabs 情報, チャプター, 関連, Ask (Main.dc.html:136-139); 8-tab order at 820 includes チャプター (Tablet.dc.html:34)
- implementation: every canonical-page shot of the inspector shows 情報, 関連, 質問 only (the test file has no chapters). Not shown in R-5, cannot be checked
- visible: not shown

### D-10 Main: a generated detailed-summary body in a panel is not shown
- design: prose with h3, a table and timestamp links (Main.dc.html:97-110)
- implementation: only the empty card and the failed row were captured (shots/B5-dark-1440-dormant-detailed-plus-note.png; shots/B4-dark-1440-loft-detailed-summary-failed.png); decisions.md lists it as pending. Not shown in R-5, cannot be checked
- visible: not shown

### D-11 Main/Tablet/Phone: no R-5 shot of the workbench screens at the final build
- design: all artboards above
- implementation: R3 shots contain no workbench layout; the comparisons above use run 1 and run 2 shots, which predate commits 374a47c92 and 25bd0b227 and the intelligence change 289d723
- visible: not shown

## Accepted by the human (not open)
- Off toggles keep a thin neutral border using `--bg-border`, fainter than the mock's rgba(255,255,255,0.14) (globals.css:963).
- Panel cards use `--bg-elevated` with no border (globals.css:1021).
- The mock's 引用 chip on the row stands for `file-preview-actions` and is not part of the change (spec Checked, no action).

TOTAL: 11 findings
