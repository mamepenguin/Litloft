# Design check

at: a4c55ea2502a204c95b4ac7ffd73a296c5af1991
design: docs/process/reviews/feature-frame-ocr-hit-place/design/

## Decisions read from the design
- Main (760 wide): row = grid auto/1fr, gap 12, padding 10px 6px, radius 12 (Main.dc.html:31)
- Main: slot 88x50, radius 8, shows a crop around the hit line at about 3x frame zoom (scale .275 translate(-340,-354)), no outline in the crop (Main.dc.html:32-33)
- Main: time label inside the slot, bottom-right, 10px, dark pill (Main.dc.html:43)
- Main: text column order = time (12px 600) with "画面内の文字" under it (11px muted), file name (12px muted, one line), excerpt 16px/1.6 with yellow mark (Main.dc.html:45-48)
- Main: row without line boxes shows the whole frame at scale .06875, no crop (Main.dc.html:55)
- Main: speech row keeps the old plain thumbnail and a "13:10–13:24" range label (Main.dc.html:73-78)
- Main: summary line "3 件のファイル・5 か所" 13px muted (Main.dc.html:27)
- Phone (390 wide): slot 64x36, same crop, row gap 2 (Phone.dc.html:26,29,30)
- Player (1280): find bar with counter "1 / 3" and up/down/close (Player.dc.html:28-34)
- Player: outline on the video = one polygon, fill rgba(255,248,197,.55), 2px #d63031 stroke, only the current line (Player.dc.html:47-49)
- Player: find list row = time + type label on one line above the text, current row tinted rgba(214,48,49,.08), no side border; the current hit mark has a 2px #d63031 outline (Player.dc.html:65-67)
- Player: find list text is a one-line excerpt with leading "…" (Player.dc.html:67)
- Loft: 16:9 outline over the embed; vertical video outline limited to the picture area (pillarbox); no outline during an advertisement (Loft.dc.html:24,39,47-52)

## Findings
### D-1 Player: other matched lines of the segment are also outlined
- design: only the current line is drawn (Player.dc.html:47-49)
- implementation: current line in red plus 3 other matched lines of the same segment in the yellow mark style (r5/30-file-link-paused.png: "conductor交換...", "conductor開発" boxes; decisions.md line 77-82 says spec step 17 asks for it, not attributed to the human's decision)
- visible: at a glance

### D-2 Player: find list row layout differs
- design: time and "画面内の文字" on one line above the text, text full width (Player.dc.html:66-67)
- implementation: two columns, time with label stacked on the left, text on the right; the current row also has a red left border (r5/30-file-link-paused.png, bottom right)
- visible: at a glance

### D-3 Player: current hit mark in the list has no red outline
- design: the current hit's mark has outline 2px #d63031 (Player.dc.html:67)
- implementation: the current row 05:09 is tinted but its marks are plain yellow, no outline visible (r5/30-file-link-paused.png)
- visible: side by side

### D-4 Player: list excerpts are long, not one line
- design: one-line excerpt (Player.dc.html:67)
- implementation: 4-line excerpts (r5/30-file-link-paused.png). Possibly sample data; the excerpt length is the existing search behaviour.
- visible: at a glance

### D-5 Player: outline fill not clearly visible on the native video
- design: yellow fill .55 plus red stroke (Player.dc.html:48)
- implementation: red stroke is visible on "Conductor Studio 2.0"; the fill is not distinguishable at this size (r5/30-file-link-paused.png). The YouTube case (r5/42-loft-in-segment.png) shows a grey-yellow fill plus red stroke.
- visible: only by measuring

### D-6 Phone search: first row slot not shown
- design: phone row with 64x36 crop slot, search box above (Phone.dc.html:29)
- implementation: r5/21-search-crop-phone.png is scrolled; the first row's slot is cut off, and the sticky toolbar overlaps (hamburger icon over the "ファイル" tab). 64x36 crops for rows 2 and 3 are visible. First row and the search box not shown in R-5, cannot be checked.
- visible: at a glance (toolbar overlap)

### D-7 Loft: vertical-video and advertisement states not shown
- design: pillarbox-limited outline for vertical video; none during ads (Loft.dc.html:36-52)
- implementation: not shown in R-5 (decisions.md pending: no such data reached); only the 16:9 case is in r5/42-loft-in-segment.png. Cannot be checked.
- visible: not shown in R-5, cannot be checked

### D-8 Main: speech row range label and a row without boxes side by side not shown together
- design: a speech row (range label "13:10–13:24", plain thumbnail) and a whole-frame slot beside crop rows (Main.dc.html:55,73-78)
- implementation: r5/20 shows only three crop rows; the no-box row is in r5/10-search-noboxes-desktop.png (separate file); a speech row in the same list is not shown. Cannot be checked for the mixed list.
- visible: not shown in R-5, cannot be checked

TOTAL: 8 findings
