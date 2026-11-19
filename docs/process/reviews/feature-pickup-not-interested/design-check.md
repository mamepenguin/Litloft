# Design check

at: 690a7c13eb7195deed0ac51dd81c838bb7b4103b
design: docs/process/reviews/feature-pickup-not-interested/design/

## Decisions read from the design
- Main (880x480): frame padding 40px, column gap 16px between heading row and grid (Main.dc.html:15)
- Main: heading 18px / 600, link "すべて見る (238)" 14px muted, no heading icon (Main.dc.html:17-18)
- Main: 3 columns, gap 16px (Main.dc.html:20)
- Main: card radius 12px, 16:9 thumb, padding 12, title 14px/600, meta 12px muted (Main.dc.html:22-27)
- Main: menu 176px wide, radius 16, 1px border, rows 8px 12px padding, 14px text, 14px icons, gap 10 (Main.dc.html:30-32)
- Main: 興味なし first with circle-slash icon, then 1px divider, then the existing rows (Main.dc.html:31-35)
- Main: toast bottom-right at right 24 / bottom 24, max-width 384, radius 16, accent circle-check 18px, text 14px, 元に戻す accent 14px/500, close button (Main.dc.html:58-62)
- VideoApp (880x480): padding 40, heading 18px/600, link "すべて見る" with no chevron (VideoApp.dc.html:15-18)
- VideoApp: 3 columns, gap 24px (VideoApp.dc.html:20)
- VideoApp: thumb radius 16, duration badge bottom-right, title 16px/22px weight 500 (one line), no card background (VideoApp.dc.html:23-26)
- VideoApp: menu = 新しいタブで開く then 興味なし, same 176px menu (VideoApp.dc.html:29-37)
- VideoApp: same toast, right 24 / bottom 24 (VideoApp.dc.html:40)

## Findings
### D-1 VideoApp: Recommended draws 2 columns at 880, design draws 3
- design: 3 columns, gap 24px, content width 800 (VideoApp.dc.html:20)
- implementation: 2 columns, each card about 416px wide, gap about 16px, so a row has fewer cards and the thumbs are larger (screenshots/video-app-recommended-880-light-menu-and-toast.png; decisions.md notes it too)
- visible: at a glance

### D-2 VideoApp: card title wraps to 2 lines, design is 1 line
- design: title 16px/22px, one line (VideoApp.dc.html:26)
- implementation: 2-line titles under each thumb (screenshots/video-app-recommended-880-light-menu-and-toast.png). May be sample-data length; the 2-column width does not explain it, the titles are long.
- visible: side by side

### D-3 VideoApp: "すべて見る" carries a chevron
- design: plain text link, no icon (VideoApp.dc.html:18)
- implementation: "すべて見る" followed by a right chevron (screenshots/video-app-recommended-880-light-menu-and-toast.png, video-app-recommended-390-light-touch-menu-and-toast.png)
- visible: side by side

### D-4 Main: home Pickup row gap between cards is about 12px, design 16px
- design: grid gap 16px (Main.dc.html:20)
- implementation: cards at x=16-291 and 303-577, so a gap of about 12px (screenshots/home-pickup-row-880-light-menu-and-toast.png)
- visible: only by measuring

### D-5 Main: heading has a leading icon and is bold
- design: plain text heading, 18px / 600 (Main.dc.html:17)
- implementation: sparkle icon before "ピックアップ"; `text-lg font-bold` (700) (screenshots/home-pickup-row-880-light-menu-and-toast.png; frontend/src/components/CarouselSection.tsx:74)
- visible: side by side

### D-6 Main: page gutter is 16px, design frame uses 40px
- design: padding 40px (Main.dc.html:15)
- implementation: content starts at x=16 at 880 width, so cards are about 275px wide against the design's about 256px (screenshots/home-pickup-row-880-light-menu-and-toast.png). The 40px may be artboard framing; reported because the card size differs.
- visible: side by side

### D-7 Both: toast offset is 16px, design is 24px
- design: right 24px, bottom 24px (Main.dc.html:58, VideoApp.dc.html:40)
- implementation: `fixed bottom-4 right-4` (frontend/src/components/ToastProvider.tsx:104); toast edge about 16px from the right and bottom in all screenshots. D3 says the existing toast, so this is the existing placement.
- visible: only by measuring

### D-8 Main: card meta is a date, design shows a duration
- design: meta line is the length, e.g. 21:40 (Main.dc.html:26)
- implementation: meta line is a date or relative day (09/14, 6 日前), and titles run to 2 lines (screenshots/home-pickup-row-880-light-menu-and-toast.png). The card is the existing one; likely sample data and the existing card.
- visible: side by side

### D-9 Not shown in R-5: dark-mode and 390 screenshots were not compared
- design: Main and VideoApp each have a dark theme prop (Main.dc.html:67, VideoApp.dc.html:49)
- implementation: dark and 390 screenshots exist in the folder but were not opened in this check; light 880 and one 390 light touch were compared
- visible: not checked

TOTAL: 9 findings
