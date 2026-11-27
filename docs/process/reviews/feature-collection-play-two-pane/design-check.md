# Design check

at: 5fa146b9ccd19b66a22ced240879468ea5549ed0
design: docs/process/reviews/feature-collection-play-two-pane/design/

(Screenshots are R-5 shots in the dark theme; the design is drawn in the light theme. Theme, sample data, tab labels and the Transcript/Scenes toggles versus the design's Chapters/Notes are not counted. Separate page row under the header is excluded by spec D2.)

## Decisions read from the design
- Main (1440): queue pane width 280px, border-right 1px (Main.dc.html:27)
- Main: top block padding 16/12/12/16, name 15px 600 with ellipsis, `n / N` 12px muted under it, loop button 36x36 at right (Main.dc.html:28-33)
- Main: rows = ordinal (10px mono, 18px wide), thumb 48x27, title 12px, duration 11px muted under title; row gap 2px, padding 6/4/6/6, radius 10 (Main.dc.html:35-45, 137-147)
- Main: up / down / remove buttons 26x28 each, always visible (Main.dc.html:46-50)
- Main: current row tint rgba(214,48,49,.08) + 1px inset ring .4, ordinal accent+bold, title 600 (Main.dc.html:144-146)
- Main: page row 48px: trail drive / collection / title, spacer, prev, `3 / 12`, next, inspector toggle (Main.dc.html:57-67)
- Main: inspector 384px (Main.dc.html:90)
- Narrow (1024): pane not shown, pane button unpressed, page row keeps prev `3 / 12` next, inspector 384px beside player (Narrow.dc.html:19, 32-35, 46)
- FolderPlay (1440): top block name 15px, `5 / 24`, loop button then x button, both 36x36 (FolderPlay.dc.html:28-35)
- FolderPlay: row is ONE line: ordinal, title (flex:1, ellipsis), duration at the right end of the same line (11px muted); padding 8/8/8/6; no thumbnail, no reorder buttons (FolderPlay.dc.html:38-44, 83-89)
- Phone (390): header 52px with menu, pane button, one-line title 14px 600, prev, next only (Phone.dc.html:17-23)
- Phone: player 390x219 directly under header; below it an open bottom sheet 420px high with tabs and title/actions (Phone.dc.html:24-43)
- PhoneQueue (390): header with menu + pane button only; close row 44px button right-aligned with border; top block name 16px 600, `3 / 12`, loop 44x44; rows min-height 44, thumb 56x32, title 13px, per-row buttons 36x44, row padding 4 (PhoneQueue.dc.html:17-47, 66-73)
- PhoneQueue: nothing else drawn below the list (no sheet or bar over it) (PhoneQueue.dc.html:16-50)

## Findings
### D-1 FolderPlay: duration is under the title, not at the row's right end
- design: one-line row, duration right-aligned on the title's line, row about 33px tall (FolderPlay.dc.html:39-43, 87)
- implementation: ordinal, then title with the duration on a second line under it, rows about 44px tall, so fewer rows fit (r5/23-D4-folder-play-tree-off-loop-off-1440x900.jpg)
- visible: at a glance

### D-2 Phone (D5): the row carries extra controls
- design: menu, pane button, one-line title, prev, next, nothing else (Phone.dc.html:17-23)
- implementation: menu, pane button, two-line heading (collection name over title), a document-info icon, prev, next, search and capture buttons (r5/21-D5-phone-video-playing-390.jpg). The title is cut to "7417-父…".
- visible: at a glance

### D-3 Phone (D5): the bottom sheet is a collapsed peek, the design draws it open
- design: sheet 420px high with tabs (情報 / チャプター / 文字起こし / 関連), title, meta and action chips below the player (Phone.dc.html:25-43)
- implementation: a one-line peek bar at the bottom with the title and like / favourite / more, and a large empty dark area between the player and the bar (r5/21-D5-phone-video-playing-390.jpg)
- visible: at a glance

### D-4 PhoneQueue (D6): the sheet's peek bar is drawn over the open queue
- design: queue overlay shows only header, close row, top block and rows; nothing below the list (PhoneQueue.dc.html:16-50)
- implementation: the file's peek bar (title, like, favourite, more) stays at the bottom over the overlay (r5/22-D6-phone-video-queue-overlay-390.jpg; r5/rr1-05-phone-overlay-390.jpg shows the overlay without it)
- visible: side by side

### D-5 PhoneQueue (D6): row and thumbnail size is not the design's touch size in the shots
- design: rows min-height 44 (about 52 with padding), thumb 56x32, title 13px, buttons 36x44 (PhoneQueue.dc.html:34-45, 70)
- implementation: in the 390px shots rows are about 42px apart, thumbs about 48x27, buttons about 30px wide (r5/22-D6-phone-video-queue-overlay-390.jpg, r5/rr1-05-phone-overlay-390.jpg). decisions.md says the shots were taken at a fine pointer, so the coarse-pointer 44px form is not shown in R-5 and cannot be checked from it.
- visible: only by measuring

### D-6 Main (D1): per-row buttons and title width differ slightly
- design: buttons 26x28, leaving the title about 88px at 12px (Main.dc.html:47-49)
- implementation: buttons spaced about 30px apart, titles cut at about 6 characters ("7417-父さ…") (r5/19-D1-video-collection-3of9-loop-on-1440x900.jpg)
- visible: only by measuring

TOTAL: 6 findings
