# Design check

at: a84cf80e83a28136660ae11ad5847871b49e0f76 (from decisions.md; the task named a304d2ff4 as the implementation commit, which differs from the commit the screenshots record)
design: docs/process/reviews/feature-pdf-viewer-height/design/

## Decisions read from the design
Artboards (canvas.json:1): Main (today, mode before), Info, Detail, DetailFocus; all 1440x900. Info/Detail/DetailFocus are Main with props (Info.dc.html:17, DetailFocus.dc.html:17).
- Info: inspector width = 384 (Main.dc.html:119)
- Info: canvas = 1440-240-384 = 816; viewer fills to bottom: height 900-56-55 (Main.dc.html:124)
- Info: tabs strip, 40px tall, 13px, selected = 600 weight + 2px #c4383a underline; order Info, Pages, 詳細要約, Related, Ask (Main.dc.html:66,150)
- Info: content = 20px bold title, 13px muted size, Like/Favorites/Verified row, "+ Add tag" (Main.dc.html:94-97)
- Info: "要約" block (700 heading + 3-line body, 1.7 line height) under tags, above Comments (Main.dc.html:99-104)
- Info: "› Comments" row last (Main.dc.html:105)
- Detail: inspector = max(40% of row, 512) = 512 at 1440 with sidebar (Main.dc.html:119); canvas 688
- Detail: selected tab 詳細要約; pane has 18px bold heading + 12px model name at right (Main.dc.html:74-77) (heading/model difference is an accepted difference per the spec)
- Detail: body 16px / 1.625; section titles 700 at 16px, numbered ("1. ...") (Main.dc.html:73,78)
- Detail: citation chips inline after sentences, "p.4" pale-red and "p.12" solid red (Main.dc.html:79,81)
- Detail: a cited-passage card (page count, quote, "このページへ" pill button) (Main.dc.html:82-86)
- Detail: no controls other than tabs, heading, text, chips, card
- DetailFocus: no sidebar/header; inspector = 576 (40% of 1440); canvas 864; viewer from y=0 with toolbar then page area to bottom (Main.dc.html:116-124)

## Findings
### D-1 Info: the short 要約 block is not shown in any R-5 screenshot of a PDF
- design: "要約" block with heading and body between tags and Comments (Main.dc.html:99-104)
- implementation: the PDF Info tab goes straight from "+ タグ追加" to コメント (r5/pdf-info-1440.png, r5/pdf-info-focus-1440.png). The only summary-related text is on the EPUB, "要約できる内容が足りません" and the summary-note card (r5/epub-info-note-1440.png). The block as designed (heading plus summary text) is not shown for a PDF, so it cannot be checked.
- visible: at a glance (the region is absent from the screenshot)

### D-2 Info: an AI menu / quote / more row sits between the Like row and the tag row
- design: Like / Favorites / Verified, then "+ Add tag" directly (Main.dc.html:96-97)
- implementation: an extra row with "AI" dropdown, quote icon and a kebab menu (r5/pdf-info-1440.png)
- visible: at a glance

### D-3 Detail: a "出典確認" toggle card sits at the top of the pane
- design: no control above the summary text; text starts right under the model line/heading (Main.dc.html:73-78)
- implementation: a full-width bordered card with a "出典確認" switch before the title (r5/pdf-detail-1440.png, pdf-detail-focus-1440.png, pdf-detail-1280.png)
- visible: at a glance

### D-4 Detail: citation chips and the cited-passage card are not shown
- design: p.N chips after sentences and a card with page count, quote and "このページへ" button (Main.dc.html:79-86)
- implementation: no chips and no card in any detail screenshot (出典確認 is off in the shots). The state with citations is not shown in R-5 screenshots, so it cannot be checked.
- visible: at a glance

### D-5 Detail: heading scale and structure differ from the design's
- design: one 18px "詳細要約" title; section titles 16px bold with numbers; body 16px (Main.dc.html:75,78)
- implementation: a large (~28px) document-title h1 ("サッカーの神様をさがして：書籍情報と…") repeated from the summary body, section headings ~22px unnumbered with a "編集" link at the right, bullet lists with wider spacing (r5/pdf-detail-1440.png)
- visible: at a glance

### D-6 Detail at 1280: the viewer toolbar wraps onto two rows
- design: toolbar is a single 55px row (Main.dc.html:42); no 1280 artboard exists, but the toolbar row is the same at every width
- implementation: at 1280 with the 詳細要約 tab the "open in new tab" icon wraps to a second row and the page area starts ~40px lower (r5/pdf-detail-1280.png); at 1440 it fits on one row (r5/pdf-detail-1440.png)
- visible: at a glance

### D-7 Detail: viewer page is left-aligned, not centred in the canvas
- design: white page centred in the desk with equal side margins (Main.dc.html:50-51)
- implementation: the page sits against the left edge of the canvas with the right side empty, at cover-page zoom "Fit width" 100% (r5/pdf-detail-1440.png, pdf-info-1440.png)
- visible: side by side

TOTAL: 7 findings
