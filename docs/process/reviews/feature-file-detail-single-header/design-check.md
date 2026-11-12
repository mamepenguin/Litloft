# Design check

at: a137f8448939bbe13f27f7ab54b2d0b5d8c5a5d0
design: docs/process/reviews/feature-file-detail-single-header/design/

## Decisions read from the design
- Main (1440): one header 56px, border-bottom 1px (Main.dc.html:18); menu + tree buttons 40px (:19-22); breadcrumb 14px muted, file name last at weight 500 dark (:23-31); inspector toggle 32px, then 1px x 20px divider, then search, quick note (36px) and avatar (32px) (:32-38). No find button, no other control.
- Main: content starts at y=56, player 16:9 with 24px padding, 360px inspector aside with tabs (:41-71).
- Proposed-Phone (390, video): header 56px, gap 8 (:18); menu 40px and tree 40px (:19-20); two-line heading, line 1 12px muted with chevron and parent name, line 2 14px semibold ellipsis (:21-24); one trailing control, search 44px (:25). Video 219px high directly under the row (:28). Sheet with handle, tabs, 17px title (:33-56).
- Md-Proposed-Phone (390): row = menu, tree, heading (line 1 link `‹ メモ`, line 2 full file name incl. `.md` plus a 6px grey save dot at rest, :26-27), find-in-file 44px with file-search glyph (:30), one pencil toggle 44px (:31), search 44px (:32). Nothing else in the row. Resting strip 56px: chevron-up BEFORE the name, the full file name with extension 14px semibold, then three 36px circle buttons (:47-54).
- Md-Renaming-Phone (390): row = menu, tree, heading only; line 1 is plain muted text `メモ` with no chevron (:24); line 2 = input without the extension (value `打ち合わせ 11月12日`, 28px high, 1px #435ee5 border, 6px radius) plus a fixed grey `.md` suffix outside it (:27-28); input and suffix reach the row's right padding (12px, :18).
- Current-PC, Current-Phone, Md-Current-Phone are today's state and were used only as the baseline.

## Findings
### D-1 Md-Renaming-Phone: the `.md` suffix is inside the input, not a fixed suffix beside it
- design: input holds the name without extension, `.md` is a separate grey span right of the input (Md-Renaming-Phone.dc.html:27-28)
- implementation: the input holds `meeting-notes.md` and nothing sits right of it (r2-390-md-renaming.png; decisions.md "Second run" item 2 says input 64-374 with no control right of it). For `.txt` the suffix is outside the input as designed (r2-390-txt-renaming.png). The spec D7 also calls for `.md` outside the input.
- visible: at a glance

### D-2 Md-Renaming-Phone: line 1 keeps the link chevron while renaming
- design: line 1 is plain muted text `メモ`, no chevron, indented 11px (Md-Renaming-Phone.dc.html:24)
- implementation: line 1 still draws `‹ notes` as in the resting row (r2-390-md-renaming.png, r2-390-txt-renaming.png)
- visible: side by side

### D-3 Md-Proposed-Phone: save dot is not shown at rest
- design: grey 6px "saved" dot follows the name on line 2 in the resting preview state (Md-Proposed-Phone.dc.html:27)
- implementation: no dot beside `meeting-notes…` at rest; decisions.md item 5 records the dot only "while editing" (r2-390-md-rest.png, 103-narrow-save-dot.png)
- visible: side by side

### D-4 Md-Proposed-Phone: the file name is truncated at 390 where the design shows it in full
- design: the name (16 characters) fits on line 2 with the save dot, between the menu/tree buttons and three 44px controls (Md-Proposed-Phone.dc.html:19-32)
- implementation: `meeting-notes.md` (16 characters) shows as `meeting-notes…`; the row has a fourth control (Capture basket, see D-5) taking the space (r2-390-md-rest.png)
- visible: side by side

### D-5 Narrow and wide file rows: an extra Capture basket button, and on the video row an extra find button
- design: narrow row ends with search only (Proposed-Phone.dc.html:25) or find, toggle, search (Md-Proposed-Phone.dc.html:30-32); wide row has no find and no basket (Main.dc.html:32-38). The spec D4 says the `header-actions` slot "draws nothing visible today" and D6 gives find only to Markdown and plain-text documents.
- implementation: a 36px quote-glyph Capture basket button ends every narrow file row (r2-390-md-rest.png, 80-narrow-strip.png, 91-320-video.png) and sits before the avatar on the wide row (111-wide-video-final.png, 112-wide-md-final.png). A file-search find button is also drawn on the video row, narrow (80-narrow-strip.png, 91-320-video.png) and wide (111-wide-video-final.png), where the design draws none. decisions.md F1 records the basket as accepted by the human in R-5; the spec does not state it. The find button on video is not mentioned in decisions.md or the spec.
- visible: at a glance

### D-6 Md-Proposed-Phone: strip name button has the chevron after the name and a different name text
- design: chevron-up glyph before the name; the name is the full file name with extension (`打ち合わせ 11月12日.md`) (Md-Proposed-Phone.dc.html:49-50). Spec D8 also says "preceded by a chevron-up glyph".
- implementation: name first, chevron after it (`Meeting-notes ^`, `Todo ^`, `Clip ^`), and the name is the title without extension (r2-390-md-rest.png, r2-390-txt-renaming.png, 80-narrow-strip.png)
- visible: side by side

### D-7 Md-Proposed-Phone: an extra "Version history" row sits above the strip
- design: the bottom is the 56px strip alone (Md-Proposed-Phone.dc.html:47)
- implementation: a full-width `Version history` disclosure row is drawn between the note and the strip on Markdown and plain-text pages, narrow (r2-390-md-rest.png, r2-320-inbox.png) and wide (112-wide-md-final.png). The pre-existing component is not part of the design.
- visible: at a glance

### D-8 Main: wide trail starts at the content's left edge, not 12px after the menu and tree buttons
- design: trail follows the two buttons directly (Main.dc.html:19-23)
- implementation: trail starts at x=240, the right pane's edge, with the sidebar open (111-wide-video-final.png, 112-wide-md-final.png). The spec D2 states this rule as agreed; the canvas does not draw the sidebar, so the two differ side by side.
- visible: side by side

TOTAL: 8 findings
