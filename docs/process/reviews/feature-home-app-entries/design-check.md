# Design check

at: ae69b1f3d5c65c37a0fc21feb2004b52bcc4122d
design: docs/process/reviews/feature-home-app-entries/design/

## Decisions read from the design
- Main (1440, sidebar 240px): main padding 56px 32px 32px, gap 32px between blocks (Main.dc.html:40)
- Main: header = 40px icon tile r12 + h1 24px/700 + 13px muted drive name; 追加 is a grey pill (#e5e5e0, r16, plus icon, no chevron) (Main.dc.html:41-47)
- Main: entry nav is a wrapping flex row, gap 8px, tiles 12px 16px, r12, bg #f6f6f3, 14px/500, icon 18px left, gap 10px; Inbox pill 20px min, #e0e0d9, after label (Main.dc.html:50-58)
- Main: row order 続きから, 最近見た, お気に入り, ピックアップ, 最近追加 (Main.dc.html:91-128)
- Main: shelf title h2 18px/700 (no icon), right link "すべて表示" 13px muted, gap 12px (Main.dc.html:61-65)
- Main: card grid 6 columns, gap 16px; 続きから / 最近見た / 最近追加 hold 12 cards (two rows of 6), お気に入り 4 (Main.dc.html:66,92-127)
- Main: card = 16:9 thumbnail r12 with 4px progress bar (grey track, red fill) at the bottom; name 13px/1.4 two-line clamp; meta 12px muted "kind · remaining/ago"; no card border, no card background (Main.dc.html:68-76)
- Narrow (1024, no sidebar): same as Main with 5 columns, gap 16px; 10 cards per row; padding 8px 32px 32px (Narrow.dc.html:22,48)
- Mobile (390): main padding 0 16px, gap 24px, h1 22px, 追加 min-height 44px (Mobile.dc.html:22-29)
- Mobile: entry nav = 4-column grid, gap 8px, tile column flex, padding 12px 4px, min-height 72px, icon 22px above 12px label, Inbox pill absolute top 6 / right 8 (Mobile.dc.html:32-39)
- Mobile: shelves are a single horizontal strip of 152px-wide cards, gap 12px, bleeding past the right edge (margin-right -16px, overflow hidden), 3 cards shown; h2 17px; "すべて表示" has 12px vertical padding (Mobile.dc.html:43-50)
- MobileNoProfile (390): six entries 4 + 2, no Inbox tile; rows お気に入り, ピックアップ, 最近追加 as 152px strips (MobileNoProfile.dc.html:32-57)

Compared and matching (not findings): wide-row tile padding, radius, background, icon-left layout, pill after label (shots/10, 12); mobile 4 + 3 and 4 + 2 grid, icon above label, フォトダイアリー wrapping, pill at top-right, tile height about 72 to 82px (shots/13, 41); entry row position between header and first row; row order and no Liked row.

## Findings
### D-1 Main: cards per row at 1440 are 4, not 6
- design: 6 columns, gap 16px, about 176px per card; 続きから/最近見た/最近追加 hold up to 12 cards in two rows (Main.dc.html:66,92)
- implementation: 4 columns, each card about 283px wide, gap about 12px; the row is one line (shots/10-home-1440-sidebar-open.png, shots/14-home-1440-rows.png; frontend/src/lib/cardGrid.ts:10-22,63-64 CARD_MIN_PX 256, one row once there are 3 or more columns; SectionRow.tsx:27)
- visible: at a glance

### D-2 Narrow: cards per row at 1024 are 3, not 5
- design: 5 columns, gap 16px, 10 cards per row (Narrow.dc.html:48)
- implementation: 3 columns, each about 323px wide, one line only (shots/12-home-1024.png; cardGrid.ts as above)
- visible: at a glance

### D-3 Mobile: rows are a wrapped 2-column grid, not a horizontal strip of 152px cards
- design: one line of 152px cards with the next card cut off at the right edge, gap 12px (Mobile.dc.html:48-50)
- implementation: 2-column grid of about 173px-wide cards that wraps to a second line; 続きから takes two lines for three cards, so each section is taller and fewer sections fit on the first screen (shots/13-home-390-mobile.png, shots/41-home-390-no-profile-empty-inbox.png; SectionRow.tsx:27-28, rowsFor gives 2 rows at 2 columns). The spec does not state this as a decision of the human.
- visible: at a glance

### D-4 All widths: 追加 is a red accent pill with a chevron; the design draws a grey pill with a plus only
- design: background #e5e5e0, text #211922, plus icon, no chevron (Main.dc.html:47, Mobile.dc.html:29)
- implementation: red fill (rgb 214,48,49), white text, plus icon and a down chevron (shots/10-home-1440-sidebar-open.png, 12, 13, 41). The spec (D7) calls the header unchanged, but the design file draws it grey.
- visible: at a glance

### D-5 Cards: bordered, shadowed card with the caption inside, larger thumbnails; caption meta differs
- design: bare 16:9 thumbnail r12, caption below it with no card surface; meta 12px muted carrying kind and state, e.g. "動画 · 残り 12 分", "PDF · 18 / 64 ページ", "ノート · 昨日" (Main.dc.html:68-76, 93-96)
- implementation: a white card with border and soft shadow wrapping thumbnail and caption; semibold title over "size · 5 分前" or "1200 × 800 · 4 分前"; a type badge (PDF/MD/JPG) and a duration badge on the thumbnail; no kind or remaining-time text (shots/10-home-1440-sidebar-open.png, 13)
- visible: at a glance

### D-6 Shelf headers: leading icon, different link label, counts
- design: h2 only ("続きから"), link text "すべて表示", no count (Main.dc.html:63-64)
- implementation: a line icon (play, history, star, file-plus) before each title; link text "すべて見る"; for お気に入り / 最近追加 a count "（2）" / "（43）" (shots/10, 12, 14, 41)
- visible: side by side

### D-7 ピックアップ row is not shown in R-5, cannot be checked
- design: row between お気に入り and 最近追加, 4 cards at 1440 and 3 at 390 (Main.dc.html:114-119, Mobile.dc.html:88-92, MobileNoProfile.dc.html:73-77)
- implementation: no screenshot draws the row; decisions.md says the slot answered empty and drew nothing, and lists the real-data case as pending
- visible: not shown in R-5, cannot be checked

### D-8 Progress bar on 続きから cards: no grey track
- design: 4px bar, grey track rgba(112,112,112,0.85) behind the red fill across the thumbnail bottom (Main.dc.html:71)
- implementation: a red bar only; no grey remainder visible on the thumbnails (shots/10-home-1440-sidebar-open.png, 13; e.g. the PDF cards show red with the rest of the bottom edge white)
- visible: side by side

TOTAL: 8 findings
