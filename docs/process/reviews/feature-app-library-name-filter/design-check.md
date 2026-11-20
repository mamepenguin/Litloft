# Design check

at: d2012b837ad8a8bb81bcf9e8e0b648c0c556a598
design: docs/process/reviews/feature-app-library-name-filter/design/

Note: the artboards draw the page content only (no sidebar, no top bar). The screenshots include the app shell (240px sidebar at 1280, top bar), so content width at 1280 is about 1008px against the artboard's 1216px. Findings about column counts are stated with that in mind.

## Decisions read from the design
- Main: header = icon 36, h1 24/700 "動画", count "3,189 本" 13px muted inline after h1, Target pill at right (Main.dc.html:26-32)
- Main: tab row = 発見 / ライブラリ (selected 600 weight, 2px #211922 underline), search icon button 36x36 at the right end (Main.dc.html:33-36)
- Main: filter pills row = タグ, 状態, 20px gap, 分類, 並び順 (Main.dc.html:39-44)
- Main: shelf = title 17/600 + count 13px muted + "すべて見る ›" at right; row of 5 cards 214x120 (16:9), gap 16, title 14px (Main.dc.html:45-52)
- Open: field 260x36, radius 16, 1px #211922 border, search icon, value, × 28px, replaces the icon in the tab row (Open.dc.html:16-19, 37)
- SeeAll: back link "‹ 動画"; row = icon, h1 24/700, field 260px (border rgba .35, not dark), sort label, Target; grid 5 columns, gap 24/16, 16:9 thumbs, no subtitle (SeeAll.dc.html:28-37)
- Clips: same header/tab row/field as Main; shelf cards 214x120 with title 14px + 12px muted domain; no "すべて見る" drawn on the shelves (Clips.dc.html:47-60)
- Phone/PhoneOpen: header icon 32, h1 20/700, Target as plain text "すべての動画 ▾" on the title row, no subtitle; tab row with field filling the rest (height 40, 16px text, × 36); 2x2 filter grid (min-height 44); shelf = single horizontal row of 160x90 cards, gap 12 (PhoneOpen.dc.html:26-49)
- PhoneEmpty: 40px outline search icon #8a8a83, then 15px regular muted #62625b text "条件に合う項目はありません", 96px above (PhoneEmpty.dc.html:40-42)
- Discover: no search icon (canvas title)
- PhoneSeeAll: back link, title row with Target at right, field 44px full width, sort label below (min-height 44), 2-column grid gap 16/12 (PhoneSeeAll.dc.html:25-41)

## Findings
### D-1 Main/Open/SeeAll (1280): column count and card size
- design: shelf rows of five 214x120 cards; See all grid of 5 columns (Main.dc.html:46-52; SeeAll.dc.html:37)
- implementation: three cards per row, each about 325px wide x 183px tall, on both the Library shelves and the See all grid (shots/video-1280-main-closed.png, video-1280-open-text.png, video-1280-seeall-from-library.png). Content width is smaller than the artboard (sidebar), but the cards are also 1.5x larger than drawn.
- visible: at a glance

### D-2 Clips (1280): card size and shelf row
- design: 214x120 cards, title 14px, domain 12px muted, gap 16 (Clips.dc.html:20-23, 49)
- implementation: four cards per row, each about 237px wide, tall thumbnails (about 160px) with 15px bold title (shots/clips-1280-library-open-text.png)
- visible: at a glance

### D-3 Main/Open/Clips (1280): header structure
- design: count "3,189 本" sits inline on the same line as the h1 (Main.dc.html:26-29; Clips.dc.html:29-30)
- implementation: h1 alone on the first line, a second line "動画 · 533 本の動画" below it; Clips also adds a red "Web ページをクリップ" button next to the Target pill (shots/video-1280-main-closed.png, shots/clips-1280-library-open-text.png)
- visible: at a glance

### D-4 Main/Open/Clips/Phone: selected tab underline colour
- design: 2px #211922 underline (Main.dc.html:33; PhoneOpen.dc.html:34)
- implementation: red underline (shots/video-1280-main-closed.png, video-390-library-open-text.png)
- visible: at a glance

### D-5 SeeAll (1280): field border state
- design: See all field has the muted border rgba(145,145,140,.35) (SeeAll.dc.html:18)
- implementation: dark #211922 border (shots/video-1280-seeall-from-library.png). Possibly focus state; the shot does not show the unfocused look.
- visible: side by side

### D-6 SeeAll (1280): subtitle line
- design: header row is back link, then icon + title only; no subtitle (SeeAll.dc.html:28-35)
- implementation: an extra muted line "動画 · 533 本の動画" under the title (shots/video-1280-seeall-from-library.png)
- visible: side by side

### D-7 Phone (390): shelf layout
- design: each shelf is one horizontal row of 160x90 cards, gap 12 (PhoneOpen.dc.html:45-49)
- implementation: each shelf is a two-column grid showing four cards (two rows) of about 170px wide x 96px thumbs with 3-line-ish titles; first screen holds one shelf (shots/video-390-library-open-text.png)
- visible: at a glance

### D-8 Phone (390): header
- design: Target is plain text "すべての動画 ▾" on the title row; no subtitle (PhoneOpen.dc.html:26-31)
- implementation: title on its own line, then a second row with subtitle on the left and the Target control on the right; header is about 50px taller (shots/video-390-library-open-text.png, video-390-library-closed.png)
- visible: at a glance

### D-9 PhoneEmpty (390): empty-state text
- design: 15px regular muted #62625b text (PhoneEmpty.dc.html:42)
- implementation: bold dark heading about 20px (shots/video-390-library-nomatch-tag.png)
- visible: at a glance

### D-10 PhoneSeeAll (390): header and sort placement
- design: Target at the right of the title row; sort is a plain muted label (icon + text, no chevron) below the field (PhoneSeeAll.dc.html:26-33)
- implementation: back link, title row, subtitle + Target row below, then field, then sort with a chevron (shots/video-390-seeall.png)
- visible: side by side

### D-11 Not shown in R-5
- Phone Library closed (Phone.dc.html) is captured as video-390-library-closed.png (not opened here; same header differences as D-8 apply). No R-5 shot shows the Clips 390 page beside an artboard (none is drawn), so Clips at 390 cannot be checked against the design.
- Sort label in See all at 1280: design shows it as a plain muted label (SeeAll.dc.html:16, 34); the implementation draws a control with a chevron (shots/video-1280-seeall-from-library.png). visible: side by side

TOTAL: 11 findings
