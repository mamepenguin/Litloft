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

## Round 2: after the design check of the fix

`design-check-1.md` compared the fixed screens with the design. The human decided on
2026-11-09.

| Finding | What is drawn after the fix |
|---|---|
| D-1 | The format badge sits at the cover's bottom-left (8px from the left, 10px from the bottom); with a progress bar it stays above the bar. |
| D-2 | A book without a thumbnail shows its title as a cover: the title in 13px bold, `text-text-primary` at reduced emphasis, top-left with 14px / 12px padding, wrapping, on the `bg-bg-elevated` fill, clipped by the cover. No file-type icon, no gradient. Books with a thumbnail are unchanged. |
| D-5 | The Manage dialog's heading is 表示する対象 / "Shown targets" (both apps). The 管理… menu row keeps its text. |
| D-6 | The Manage dialog's search field has a 16px search icon at its start. |
| D-7 | The Manage dialog's 完了 button is a DESIGN.md button: `rounded-2xl`, padding at least `px-4 py-2`, not a pill. |

Accepted, not changed: D-3 and D-4 (the Target menu's width and its check-mark rows are
the app-wide menu, which Video's design also draws with check marks), the Manage dialog's
close button and its search placeholder (D-5, D-6).

## Round 3: after the second design check

`design-check.md` (the second check) reported D-1 to D-5, all visible only by measuring.
The human accepted all five on 2026-11-09, unchanged: the badge's radius and weight and
the Manage dialog's radius, search field and checkboxes follow DESIGN.md (§5 radius scale,
inputs) and the app-wide controls; the 2px title-to-meta gap and the progress track's
opacity are left as they are.

R-5 of round 2 found that the Reading and Video shelf pages scrolled sideways below `sm`,
because `PageHeader` kept its controls on one line. Every `PageHeader` layout now wraps its
controls below `sm` instead of widening the page; `sm` and wider are unchanged.
