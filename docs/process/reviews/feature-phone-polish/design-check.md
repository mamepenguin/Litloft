# Design check

at: 4ba623abc77ff2437f9a9a487a3ad0d20937c773
design: docs/process/reviews/feature-phone-polish/design/

Scope: FoldersCount.dc.html only (spec "Design decisions to check"; 123 has no artboard). The single-kind "9件 · 動画" is superseded by the spec, so it is not a finding.

## Decisions read from the design
- FoldersCount: artboard width = 390px (canvas.json)
- FoldersCount: section label "フォルダ" above the grid, 14px / weight 600 / #62625b, 12px gap to grid (FoldersCount.dc.html:16, :15)
- FoldersCount: grid = 2 columns, gap 12px (:17)
- FoldersCount: card = flex column, gap 6px, padding 16px, radius 16px, white, soft shadow (:19)
- FoldersCount: row 1 = 40x40 icon tile (radius 12, #f6f6f3, folder glyph 20px) + name, gap 12px, name weight 600, nowrap with ellipsis (:20-22)
- FoldersCount: row 2 = count only, spans card width under icon row, 14px, muted #62625b, nowrap/ellipsis (:24)

## Findings
### D-1 FoldersCount: no "フォルダ" section label above the folder grid
- design: a 14px / 600 / muted label "フォルダ" sits above the 2-column grid, 12px gap (FoldersCount.dc.html:16)
- implementation: the filter field is followed directly by the card grid; FolderShelf renders only the grid div and FolderContent renders no heading before it (frontend/src/components/folder/FolderContent.tsx:37-60, :160-176). Screenshots show the Add menu open over the left of that area, so the label's absence cannot be confirmed from the picture alone; no text is visible at the right of the gap between the filter field and the first card row (/private/tmp/claude-502/shots/ja-393-home.png, en-320-home.png)
- visible: at a glance

### D-2 FoldersCount: card and count-line structure not checkable without the menu open
- design: card gap 6px, padding 16px, radius 16px, count line under the icon row (:19-24)
- implementation: code matches (FolderCard.tsx:69, :101, :114: p-4, rounded-2xl, gap-1.5, flex-col, text-sm muted, truncate). Cards at 393px measure about 175px wide in 2 columns with 12-13px gap, matching the artboard. Every R-5 shot of the cards has the Add menu open over part of the grid, and no shot shows a card whose name line wraps or is being edited. This is a note, not a difference: matches; the editing state is not shown in R-5.
- visible: only by measuring

TOTAL: 2 findings
