# Design check

at: 4648ddfc43ed0ea66113c39249d3a32043b0d142
design: docs/process/reviews/feature-smart-collection-parity/design/ (Ask.dc.html, reused by the spec for its target rows)

## Decisions read from the design
- Ask の範囲 (760 wide): row leading icon = lucide Library for a collection, ListFilter for a Smart Collection (Ask.dc.html:28-30)
- Ask の範囲: icon size = 16x16, stroke-width 2 (Ask.dc.html:28)
- Ask の範囲: icon colour = #62625b (muted) (Ask.dc.html:28)
- Ask の範囲: icon placed before the name, gap icon to name = 10px (Ask.dc.html:28)
- Ask の範囲: row padding 8px 12px, name 14px, colour #211922 (Ask.dc.html:28)
- Ask の範囲: search field labelled/placeholder "<kind>を検索", 13px, 32px high (Ask.dc.html:26)
- The design draws no checkbox, no checked-row mark and no count; those are not in the artboard.

## Findings
### D-1 Ask の範囲: row icon is 14px, design is 16px
- design: width/height 16 (Ask.dc.html:28)
- implementation: Target menu rows draw the icon at size 14 (frontend/src/components/ToolbarMenu.tsx:334); Manage… rows draw it at size 14 (frontend/src/components/appshell/ManageTargetsDialog.tsx:134). In video-menu-1280.png and rerun-video-manage-1280.png the glyphs look about as tall as the text x-height, a little smaller than the 16px glyph in the design.
- visible: only by measuring

### D-2 Ask の範囲: gap between icon and name is 8px, design is 10px
- design: gap 10px between icon and name (Ask.dc.html:28)
- implementation: Target menu row uses `gap-2` (8px) with the icon inside a 16px-wide slot that sits after the check column (ToolbarMenu.tsx:321-334); Manage… row uses `gap-2` between checkbox, icon and name (ManageTargetsDialog.tsx:125). Name starts about 8px after the 16px slot in video-menu-1280.png.
- visible: only by measuring

### D-3 Ask の範囲: icon is not the first element in the row
- design: icon is the leftmost element of the row, padding-left 12px (Ask.dc.html:28)
- implementation: Target menu reserves a 16px check column before the icon, so the icon is indented by about 28px from the row edge, and rows without an icon (default row すべての動画) show no icon (video-menu-1280.png, video-menu-375.png). Manage… puts a checkbox before the icon (video-manage-1280.png). The checkbox and the check column are required by the selection / saved-set states the design does not draw, so the icon position differs by construction.
- visible: side by side

### D-4 Ask の範囲: search field size and typeface differ
- design: 32px high, 13px text, 8px radius, placeholder "コレクションを検索" (Ask.dc.html:26)
- implementation: Manage… search is a rounded-2xl field with `py-2 text-sm` (about 38-40px high, 14px), with a leading search glyph, placeholder 対象を検索 (ManageTargetsDialog.tsx:113; rerun-video-manage-1280.png). The design's search field sits inside a menu, the implementation's inside a dialog; the Target menu itself has no search field (video-menu-1280.png).
- visible: side by side

### D-5 Ask の範囲: icon-bearing menu is not shown as a dialog; Manage… dialog has no counterpart
- design: a single 240px-wide menu with back row, search field and icon rows (Ask.dc.html:22-31)
- implementation: the Target menu has heading 対象, a default row with count, icon rows, separator and 管理… row (video-menu-1280.png); the Manage… modal is a separate dialog with checkboxes and 完了 (video-manage-1280.png). The design file does not draw either surface, so their structure cannot be checked against it; the icon rows are the only reused part.
- visible: side by side

## Checked, no difference
- Icon glyph: Library and ListFilter paths match the design's SVG paths (TargetMenu.tsx:135, ManageTargetsDialog.tsx:122).
- Icon colour: muted text token in Manage… (`text-text-muted`, ManageTargetsDialog.tsx:136); screenshots show a grey icon.
- Place before the name and kind-to-icon mapping hold at 1280 and 375 (video-menu-375.png, reading-menu-*.png, reading-manage-*.png were not individually opened beyond the video ones; the video pair is consistent with the code, which is shared).

TOTAL: 5 findings
