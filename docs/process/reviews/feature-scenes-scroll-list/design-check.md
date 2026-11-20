# Design check

at: 7f672063ea9c8fdde2f40773f046cb4f6db40697
design: docs/process/reviews/feature-scenes-scroll-list/design/

Note on `at:`: the shots were taken at core 0d1479603 + 475deff8f (decisions.md, "Design-check screenshots (rerun2)"); the later commits only record decisions.

## Decisions read from the design
- Panel: section 12px radius, bg #231216, text #f5e6e8; no divider between header and body (Panel.dc.html:238, 29)
- Panel: header 40px, "シーン" 13px/600 left, 28px close button right (Panel.dc.html:29-34)
- Panel: order header, ruler, tile list, scene card, action row (play button + "シーンを作り直す" ghost) (Panel.dc.html:37-115)
- Panel: body padding 8/14/14, gap 14 (Panel.dc.html:242)
- Panel: ruler 44px, 8px radius, bg #2f191b, ticks per frame, green scene marks (dot 7px + 2px line), red 2px playhead, white hover line, translucent band (Panel.dc.html:40-53); time labels 11px muted below, gap 6 (54-60)
- Panel: tile grid cols = max(3, floor((w-28+8)/120)), gap 12px row / 8px column (Panel.dc.html:180, 71)
- Panel: tile = 16:9 picture, 8px radius, 12px/16px centred time label muted; playing = 2px accent outline offset 2 and brighter label; scene tile = 8px green dot at 6,6 (Panel.dc.html:74-78, 230-231)
- Panel: one scrolling list between ruler and card (non-flow), overflow-y auto (Panel.dc.html:249)
- Panel: full card min-height 122, 12px radius, bg #2f191b (distinct surface from the panel #231216), time 12px + label 14px + text clamped to 2 lines (Panel.dc.html:17, 87-93)
- Panel: one-line card 44px, dot, time 12px, label 13px truncated (Panel.dc.html:19, 96-100)
- Panel: action row: ghost buttons, 12px text, no fill, hover only (Panel.dc.html:15, 114)
- Panel: "現在位置に戻る" chip 28px, accent pill, shadow, centred at top of list over tiles; in flow form sticky at top 94 (Panel.dc.html:21, 253-254)
- Panel palette: warm wine-tinted dark: page #1a0e10, panel #231216, raised #2f191b/#3a2023, muted text #c4a0a4, accent #e85d5e, scene green #4caf80 (Panel.dc.html:13-24, 238)
- Main: panel width 1024 (one panel) or 506 (two); panel height 1400-32-576-12-30-12 = 738 at 1400; compact card when panel height < 520 (Main.dc.html:54-68)
- Main: pill row above panel: Transcript / Scenes (selected = accent border) (Main.dc.html:23-28)
- Short: Main at 900px height, one panel; list about one row tall (Short.dc.html:16)
- Phone: sheet 422 (half) and 780 (full); tabs row 40px with accent underline on the active tab; Panel in flow form: no header, ruler sticky at top, one-line card sticky at bottom, whole sheet scrolls, 3 columns at 390 (Phone.dc.html:17-42, Panel.dc.html:240-258)
- Phone: after the pinned card comes the action row (play/time + rebuild) inside the flow (Panel.dc.html:258)

## Findings
### D-1 Main/Short: the scene card has no visible surface in the workbench (accepted by the human)
- design: card is a distinct raised block, #2f191b on a #231216 panel, 12px radius (Panel.dc.html:17)
- implementation: card uses bg-bg-elevated on a panel of the same tone, so the card reads as bare text on the panel with an empty gap below it (r5/rerun-wb-1400x1050-card.jpg, r5/rerun-wb-1184x999-playing-first-row.jpg, r5/rerun2-dark-wb-1400x1400.jpg, r5/rerun2-wb-two-panels.jpg; ScenesSectionPresenter.tsx:110, 620, 640). In the phone sheet the card does show as a block. The dark workbench shot has the same flat card.
- visible: at a glance
- status: accepted by the human (decisions.md, 2026-11-19)

### D-2 Main/Short/Panel: a divider line under the panel header (accepted by the human)
- design: no divider between the 40px header and the body (Panel.dc.html:29-37)
- implementation: a 1px rule under "Scenes" (r5/rerun-wb-1400x1050-card.jpg, r5/rerun2-wb-two-panels.jpg). The core host draws it.
- visible: side by side
- status: accepted by the human

### D-3 Main/Panel: a "source scenes have changed" line is drawn between the card and the action row (accepted by the human)
- design: card is followed directly by the action row (Panel.dc.html:85-115)
- implementation: stale line under the card in every shot (r5/rerun-wb-1400x1050-card.jpg, r5/rerun2-phone-full-end.jpg; ScenesSectionPresenter.tsx:410-414). The design's play/time button on the left is not built, as stated.
- visible: side by side
- status: accepted by the human

### D-4 Main/Phone, dark theme: the palette is neutral grey, the design's is wine-tinted
- design: page #1a0e10, panel #231216, raised #2f191b, muted text #c4a0a4 (Panel.dc.html:238, Main.dc.html:17)
- implementation: the dark theme draws neutral charcoal for page, panel, ruler and sheet, with grey text (r5/rerun2-dark-wb-1400x1400.jpg, r5/rerun2-dark-phone-full.jpg). Layout, tile size, outline, dots, accent underline and the coral/green accents are close to the design. The stale line is amber-yellow here (the design has none, see D-3).
- visible: side by side

### D-5 Phone: the action row's button is a filled pill in the app, a ghost in the design
- design: "シーンを作り直す" is a ghost button, 12px, no fill, 6px 10px padding, with the play/time button at the left of the row (Panel.dc.html:15, 114)
- implementation: at the end of the sheet scroll, the stale line, then "Regenerate scenes" as a filled rounded pill at 13px, right aligned, with more space around it (r5/rerun2-phone-full-end.jpg; ScenesSectionPresenter.tsx:416-438, 428-431). In the workbench it reads as plain text because its fill matches the panel (r5/rerun2-wb-two-panels.jpg). The order at the end of the scroll is as designed: last tile, one-line card, action row, inside the sheet. The last rows' pictures were still blank 3 s after the jump (decisions.md), drawn as empty tiles.
- visible: side by side

### D-6 Main two panels: the Scenes list is shorter than the design's
- design: two panels 506 wide and 738 high, 4 columns; list height 738-40-22-64-14-14-122-14-36 = 412 px, about 3.7 rows (Main.dc.html:54-58, Panel.dc.html:186)
- implementation: panels 536 wide and 642 high; 4 columns (matches); list 286 px, so 3 rows and no partial fourth (r5/rerun2-wb-two-panels.jpg; heights from decisions.md). The host's player and header are taller than the design's, and the stale line (D-3) takes room the design gives the list.
- visible: side by side

### D-7 Main/Short: fewer columns beside the inspector (accepted by the human)
- design: 1024 px panel, 8 columns, about 5 rows at 1400 px tall (Panel.dc.html:180-186, Main.dc.html:54-57)
- implementation: 716 px panel beside the Info inspector, 5 columns (r5/rerun-wb-900-to-1400-resize.jpg, r5/rerun2-dark-wb-1400x1400.jpg); 6 columns at 1184x999.
- visible: at a glance
- status: accepted by the human; the 7-instead-of-8 case at 1024 is in the D2 line of invariants.md

TOTAL: 7 findings
