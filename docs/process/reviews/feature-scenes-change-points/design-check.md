# Design check

at: ccad64c8d1ffc5a3dbf08ef19dff9143ed1e977f (decisions.md `at:`; the screenshots in impl-shots/ were taken at addon 581e872 / core d36168fb8 per the task brief)
design: docs/process/reviews/feature-scenes-change-points/design/

## Decisions read from the design
- Section400All: self-headed header row = film icon 14, "シーン", count 276, teal dot + 12, chevron at right; 14px text, muted, mb 14 (Section400All.dc.html:15-21)
- Section400All: ruler 44 high, radius 8, tick path, 6 scene marks, red playhead; labels 11px muted; labels mb 12 (:23-41)
- Section400All: chip group, left-aligned, gap 4, mb 10 (:43)
- Section400All: chip = pill, padding 4px 10px, 12px/16px, transparent bg, tabular nums; selected = 1px red border + weight 600 + primary text; unselected = transparent border + muted text (:44-45)
- Section400All: chip labels "標準 276" (selected), "カット 113" (:44-45)
- Section400All: grid 3 columns, gap 8px 8px, 16:9 tiles radius 8, time label 12px muted centered (:48-58)
- Section400All: scene card after grid, mt 14, radius 12, padding 10/12 (:60)
- Section400Changes: same, "カット 113" selected; header count reads 113; ruler ticks 13 (113 set) instead of 24; tile times are cut times (0:07, 0:41 ...); marks, playhead and card identical (Section400Changes.dc.html:18, 25, 43-58)
- Phone390Changes: chip group mb 8; grid gap 8px 6px; 6 tiles (2 rows); icon 20; card mt 12; header mb 12 (Phone390Changes.dc.html:15, 43, 48, 57)
- Section400NoChanges: header shows only 276 (no teal count dot is for visual index, not chips); no chip group; ruler labels mb 12 then grid directly; no scene card (Section400NoChanges.dc.html:15-19, 28-30)
- canvas.json: four boards, 384 / 384 / 384 / 390 wide

## Findings
### D-1 Section400All / Section400Changes: vertical spacing around the chip row is larger than drawn
- design: ruler labels -> chips 12, chips -> grid 10 (Section400All.dc.html:41,43; Section400Changes.dc.html:41,43)
- implementation: the section is `flex flex-col gap-3.5` (14px) and the chip group is a plain child, so ruler -> chips is 14 and chips -> grid is 14 (ScenesSectionPresenter.tsx:270, 293-316; impl-shots/desktop-ja-default.png and desktop-ja-cuts.png: chip box 699-725, first tile top 739)
- visible: only by measuring (about 2px above and 4px below the chips)

### D-2 Phone390Changes: chip row to grid gap is larger than drawn
- design: chips mb 8 (Phone390Changes.dc.html:43); ruler labels -> chips 12 (:41)
- implementation: 14 above and below, same gap-3.5 container (ScenesSectionPresenter.tsx:270); in impl-shots/phone390-ja-cuts.png the chip row bottom (1373) to tile top (1416) is about 14px at 3x scale (43px)
- visible: only by measuring (6px below the chips, 2px above)

### D-3 Section400All / Section400Changes / Phone390Changes: self-headed header row (with the count that follows the mode) is not shown in R-5
- design: header row "シーン 276 / 113" with the count following the selected chip, teal visual-index count and chevron (Section400All.dc.html:15-21; Section400Changes.dc.html:18; Phone390Changes.dc.html:15-21)
- implementation: every screenshot is host-labelled (desktop panel title "シーン" with an X, phone sheet tab), so the header row, its count and its spacing to the ruler are not drawn; decisions.md `pending:` states the self-headed placement was not reached. Code renders `rows.length` in the header when expanded (ScenesSectionPresenter.tsx:228-231)
- visible: not shown in R-5, cannot be checked

### D-4 Section400NoChanges: the no-change state is only shown in the pre-rename R-5 run at desktop width
- design: no chip group; ruler labels -> grid 12 (Section400NoChanges.dc.html:28-30)
- implementation: r5/desktop-nochange-mov-ja.png shows no chip group and the grid directly under the ruler labels (structure matches). It is the older run (before 標準 rename; not in impl-shots/), and the file has a single frame, so it is not a 276-frame case. Code gap between ruler and grid is 14 (ScenesSectionPresenter.tsx:270)
- visible: only by measuring

### Matches and notes (not findings)
- Chip look matches: pill, 26px high (py-1 + text-xs + 1px border), selected = red border + semibold + primary text, unselected = transparent border + muted text; group left-aligned with gap 4 (ScenesSectionPresenter.tsx:102-108, 295-298; desktop-ja-default.png, phone390-en-default.png). Selected chip box starts at the content left edge, same as the grid.
- Labels 「標準 276」「カット 113」 / "Default 276" "Cuts 113" match the design labels in ja; en has no design counterpart.
- Cut mode: ruler ticks thin out to the 113 set, marks/playhead unchanged, tiles show cut times with pictures (desktop-ja-cuts.png, phone390-ja-cuts.png), as drawn.
- Width-driven differences, existing Scenes layout and not from this change: 6 columns at 756 px against the design's 3 at 384, tile size, tile row gap (gap-y-3 = 12 against drawn 8 at every width, ScenesSectionPresenter.tsx:319), playing-tile ring and ruler window highlight, three tile rows before the scene card on the phone against the design's two.
- Phone grid is 3 columns as drawn.

TOTAL: 4 findings
