# Design check

at: 764d57c301de74e3bf4536ac6d5ef5721299f5fd
design: docs/process/reviews/feature-search-operator-negation/design/

Worktree HEAD is 23c5d52f2; screenshots are from the sha above. Paths are under docs/process/reviews/feature-search-operator-negation/. D-1..D-5 (accepted) and D-6/D-7 (fixed/resolved) in decisions.md are not re-raised unless the implementation changed them.

## Decisions read from the design
- Main A: input h40 radius 12 15px; chips gap 8, wrap, 12px/16px, padding 2px 4px 2px 8px (design/Main.dc.html:22,25,26)
- Main A: normal chip sand #e5e5e0, bold label then value (Main.dc.html:26-29)
- Main A: negated chip transparent, inset 1px ring #b9b9b2, 除外 muted #62625b, then bold label, then value (Main.dc.html:32-39)
- Main: has: chip sand, bold label only (Main.dc.html:64-67)
- Main: chip order tag, 除外 tag, 除外 folder, コレクション未登録, then dashed ＋ 条件 last (Main.dc.html:26-68)
- Menu: 224px popover, ten items in order, タグなし disabled at .5 (Menu.dc.html:28-38)
- Phone: 375, input then chip row, long negated chip max-width 100% with ellipsis, x shrink 0; chips wrap; ＋ 条件 last (Phone.dc.html:20-37)

## Findings
### D-1 Main (375, combined row): ＋ 条件 not shown
- design: the chip row ends with the dashed ＋ 条件 pill (design/Phone.dc.html:37; Main.dc.html:68)
- implementation: design-main-combined-375.png is cropped after コレクション未登録 and shows no ＋ 条件, so the end of the wrapped row at 375 (where the pill lands) cannot be checked. At 1280 it is present, last in the row (r5/design-main-combined-1280.png). The row itself (query order, ring chips with no fill, 除外 muted, bold label, sand has: chip, wrap without horizontal scroll) matches the design.
- visible: only by measuring

TOTAL: 1 findings
