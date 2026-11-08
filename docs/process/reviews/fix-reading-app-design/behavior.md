# Reading app: match the agreed design

The reading app (SPEC-CORE-059 to 062) shipped looking unlike the design the human
agreed to. `docs/process/reviews/feature-reading-app/design/` holds that design;
`docs/process/reviews/feature-reading-app/design-check.md` lists the differences D-1 to
D-15. The human decided which to fix on 2026-11-09. The revised invariants are in
`invariants.md` beside this file.

## Fixed

| Finding | What is drawn after the fix |
|---|---|
| D-1, D-2 | Reading's Discover shelves, its By tag shelves, Library's Group None grid and the Reading shelf page use 2:3 cards at least 140px wide with a 20px gap. Columns come from the container width; a 976px container holds 6. Below three columns a shelf shows two rows, as today. Loading placeholders in those grids are 2:3. Video's grids do not change. |
| D-4 | The Target button (both apps): `bg-sand`, no border, `rounded-2xl`, `px-4 py-2`, `text-sm`; the label in `text-text-muted`, then the value in `text-text-primary`, then a 16px chevron-down. No leading icon. 44px tall on a coarse pointer. |
| D-9 | Reading's Library control row: Tag and State at the start, Group and Sort pushed to the end, all four in the Target button's look. Each shows its label, so Sort reads "並び順 新しい順" / "Sort Added (newest first)". The row still wraps rather than scrolls. |
| D-15 | The chip row and the control row are one column 12px apart; the grid starts 24px below the control row. |
| D-8 | Folder chips: unselected chips filled `bg-bg-elevated` with a transparent border; the selected chip keeps the accent border required by DESIGN.md §Selected-state controls, on the same fill. |
| D-6 | The Continue reading progress bar fills in `bg-accent` on a dark translucent 4px track. |
| D-7 | The line under a Reading card's title is "<folder label> · <relative time>" at every age: minutes, hours, days, weeks, months, years ("2年前", "8か月前", "1週間前"). Other screens keep their own date format. |
| D-12 | **See all** on a shelf (both apps) is followed by a 16px chevron-right. |

## Accepted, not changed

- D-3 (page gutter, header icon tile) and D-5 (tab padding): drawn by the app-wide
  `PageHeader` and `PageTabs`, which DESIGN.md §Page Header and §Tabs govern.
- D-8's dark fill for the selected chip: DESIGN.md forbids a fill as the selection mark.
- D-10 (top bar) and D-11 (sidebar rows): the app shell, outside the reading app.
- D-13, D-14: no screenshot existed; R-5 of this fix shoots the open Target menu and the
  Manage dialog.
