# Design check

at: bcb9210ce244c190e1352a72a29228ffb2cf327c
design: docs/process/reviews/feature-collection-play-two-pane/design/

(Re-check after the owner's decisions on the first check. Screenshots are the rr2-* R-5 shots in r5/, dark theme; the design is light. Theme, sample data, tab labels, Transcript/Scenes toggles, the separate page row (spec D2), the accepted D-2 and D-3, and the 44px coarse-pointer touch target are not counted. HEAD 28ca20fc1 is later than the commit the screenshots were taken at, per decisions.md.)

## Decisions read from the design
- Main (1440): pane 280px, border-right 1px (Main.dc.html:27)
- Main: top block name 15px 600, `n / N` 12px muted, loop button 36x36 right (Main.dc.html:28-33)
- Main: rows = ordinal 10px mono 18px wide, thumb 48x27, title 12px, duration 11px muted under title; gap 2, padding 6/4/6/6, radius 10 (Main.dc.html:35-45, 137-147)
- Main: up / down / remove 26x28, always visible (Main.dc.html:46-50)
- Main: current row tint + 1px ring, accent bold ordinal, title 600 (Main.dc.html:144-146)
- Main: page row trail, prev `3 / 12` next, inspector toggle; inspector 384px (Main.dc.html:57-67, 90)
- Narrow (1024): pane folded, pane button unpressed, page row keeps prev `3 / 12` next, inspector beside player (Narrow.dc.html:19, 32-35, 46)
- FolderPlay (1440): top block name 15px, `5 / 24`, loop then x, 36x36; one-line rows with duration at right end, no thumb, no reorder buttons (FolderPlay.dc.html:28-44, 83-89)
- Phone (390): header 52px, menu, pane button, one-line title, prev, next; player 390x219; sheet (Phone.dc.html:17-43)
- PhoneQueue (390): close row 44px; top block name 16px, `3 / 12`, loop 44x44; rows min-height 44, thumb 56x32, title 13px (current 600), buttons 36x44, row padding 4; nothing below the list (PhoneQueue.dc.html:17-50, 66-73)

## Re-check of the fixed items
- D-1 (folder / Smart rows): one line, 32px, duration at the right end (rr2-FolderPlay-tree-off-loop-off-1440x900.jpg). Matches.
- D-4 (peek bar over overlay): gone while the overlay is open (rr2-04, rr2-PhoneQueue). Matches.
- D-5 (phone thumbnails): 56x32 at a coarse pointer (rr2-PhoneQueue). Matches.
- D-6 (button size): 26x28 at a fine pointer. The title width remains short, see D-7.
- Narrow (rr2-Narrow-collection-yield-1024x768.jpg): pane folded, `3 / 9` kept, inspector beside the player. Matches.

## Findings
### D-7 Main (D1): title column is narrower than the design's
- design: ordinal 18px, button group gap 0, row right padding 4, leaving the title about 89px at 12px (Main.dc.html:35-50, 137-147)
- implementation: ordinal 20px, button gap 2px, right padding 6px, title column 81px; titles cut at about 7 characters ("7417-父さ…", "7988-お彼岸…") (rr2-Main-collection-3of9-loop-on-1440x900.jpg; decisions.md R-5 re-run at bcb9210, "D-6, fixed (sizes)"; frontend/src/components/queue/QueueRows.tsx:41 for the row padding)
- visible: only by measuring

### D-8 PhoneQueue (D6): row title is 12px, the design draws 13px
- design: title 13px, current row 600 (PhoneQueue.dc.html:72)
- implementation: rows use `text-xs` (12px) at every width, measured 12px in the overlay (rr2-PhoneQueue-collection-overlay-390x844.jpg; frontend/src/components/queue/QueueRows.tsx:41)
- visible: only by measuring

TOTAL: 2 findings
