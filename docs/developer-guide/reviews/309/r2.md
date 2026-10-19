# Review: compact folder rows, round 2

- Commit under review: `799c3b77` (fix), parent `b48be52e` (round 1). Worktree `/Users/libre/Sources/video_share-folder-rows`.
- Baseline at `799c3b77`: vitest (FolderListRow, parity, FolderCard) 42 passed; e2e-layout `list-row-furniture` 12 passed.
- Harness: each mutation backs files up to `scratchpad/r2bak/`, applies the edit, runs both suites, restores (`git status --short` checked empty after each). Probes are a scratch Node script driving Chromium against the fixture and its compiled sheet.

## Findings

(written incrementally below)

### G1. The breakdown's new browser tests run on a fine pointer only; a breakdown that shows on a phone passes every test

- Label: `[introduced]` (the `a folder row's breakdown` describe block is new in `799c3b77`; it is the holder the fix added for F1)
- Invariant: 5 (M23); also 4 at `sm` and up on touch (M22). R-4: a test that lets an A through is an A.
- The block is `test.use({ hasTouch: false })`, and its below-`sm` case is one width (343) and one pointer. Phones are coarse pointers. The coarse-pointer describe uses `LONG_NAME`, where a displayed breakdown has 0 width anyway, so it cannot see this.
- Mutation M23 (want=kill), component and fixture together:
  ```diff
  -hidden min-w-0 max-w-max flex-grow basis-0 truncate text-xs tabular-nums text-text-muted sm:block
  +hidden min-w-0 max-w-max flex-grow basis-0 truncate text-xs tabular-nums text-text-muted sm:block pointer-coarse:block
  ```
  Result: vitest 42/42, e2e 12/12. **Survived.** Probe under the mutated sheet, coarse pointer, name "Folder": at 343 the breakdown is displayed at 80.4px (truncated), at 288 at 25.4px (a "· Vi…" fragment); the count moves from the right edge (left 255.3 on fine) to 168.9, straight after the name.
- Mutation M22 (want=kill), both files: append `pointer-coarse:hidden`. vitest 42/42, e2e 12/12. **Survived.** Probe: on a coarse pointer at 440 and 700 the breakdown is `display: none` while `FolderCard` still renders `count · kinds` on every pointer (`FolderCard.tsx` builds `meta` without a media condition).
- Not a behaviour defect at `799c3b77` (the shipped sheet hides the breakdown below `sm` on both pointers, measured); it is the holder for invariant 5 that the fix claimed for F1 covering half the pointers.

### G2. A breakdown the name has pushed to zero width still takes its 8px gap from the name

- Label: `[introduced]` (the sibling layout is new in `799c3b77`)
- Invariant: 7 on the reading "the breakdown takes no width while the name is truncated" if the flex gap it brings counts as its width; the supervisor decides. Measured, not argued:
- Probe (current sheet, rebuilt from the restored tree; same result on both pointers). Same folder, with the breakdown span present vs removed:
  | row | name chars | name full width | breakdown | name box | truncated | count right / inner right |
  |---|---|---|---|---|---|---|
  | 440 | 31 | 223 | present (0px) | 222.25 | **yes** | 388 / 396 |
  | 440 | 31 | 223 | absent | 222.89 | no | 396 / 396 |
  | 700 | 69 | 484 | present (0px) | 482.25 | **yes** | 648 / 656 |
  | 700 | 69 | 484 | absent | 483.64 | no | 656 / 656 |
  So a name that fits whole in a folder without a breakdown is truncated in one with a breakdown, and in that state the count sits 8px short of the column's right edge (it is flush when the breakdown is showing or absent). Between full widths of about 214 and 222 at 440 the breakdown instead gets a sub-8px box and draws as "·…" (see G5).
- Why no test sees it: the "gives way" test asserts `row.kinds!.width === 0`, the span's own box. Mutation M17 (want=kill), both files: append `ml-4` to the breakdown span → 24px taken from a truncated name. vitest 42/42, e2e 12/12. **Survived.**
- The parent (`b48be52e`) took the whole breakdown's width (F2), so this is far smaller than what it replaced; it is recorded because invariant 7 was written for this fix.

### G3. "The count always stays whole" has no holder

- Label: `[pre-existing]` — same mutation survives at `b48be52e` (see below). The clause arrived with invariant 7 after round 1, and the fix's new tests do not cover it.
- Invariant: 7 (test gap; the shipped `flex-shrink-0` keeps the count whole, measured 41.75px at every width)
- Mutation M19 (want=kill), both files:
  ```diff
  -ml-auto flex-shrink-0 text-xs tabular-nums text-text-muted
  +ml-auto min-w-0 truncate text-xs tabular-nums text-text-muted
  ```
  At `799c3b77`: vitest 42/42, e2e 12/12. **Survived.** Probe under the mutated sheet with `LONG_NAME`: count box 18.5px ("3…") at 440, 36.6px at 700, both pointers.
- At `b48be52e` (component, fixture, spec, FolderListRow test checked out from that commit; meta span `flex-shrink-0` → `min-w-0 truncate` in component and fixture): e2e 7/7, vitest 26/26. Survived there too → pre-existing.
- Note: plain removal of `flex-shrink-0` (M9) is killed, but only because "3 items" then wraps and the row height assertions (41/45) notice; a count that truncates on one line is invisible to them.

### G4. The count's position (`ml-auto`, and the breakdown's `max-w-max`) is unheld

- Label: `[introduced]` (both classes are new in `799c3b77`)
- Invariant: none declared (no invariant says where the count sits). Bucket B unless the supervisor reads it into 4/7.
- M8 (want=live per the list), both files: drop `ml-auto` from the count. 42/42, 12/12, survived. Probe at 440 and 700, "Folder": count left 166.9 (straight after the name) instead of 240.3 / 500.3; the breakdown follows it and the right half of the column is empty.
- M3 (want=live per the list), both files: drop `max-w-max` from the breakdown. 42/42, 12/12, survived. Same count position (166.9); the breakdown's box stretches to 179.4 / 439.4px with its text left-aligned beside the count.
- Either spelling moves every folder row's count off the right edge, where `FileListRow`'s size/date column ends above `sm`, and nothing measures a count box. The "shows whole" test would have caught it with one `count.right === inner.right` style assertion; recorded as B.

### G5. Visible spacing of the breakdown: the separator is 8px on one side and a space on the other, and a nearly-squeezed breakdown draws as "·…"

- Label: `[introduced]`
- Invariant: none
- The breakdown is now a flex sibling whose text starts with `· `, so the gap before the dot is the container's `gap-2` (8px) and after it one space (~3px). At `b48be52e` the same text was the inline `" · "`, symmetric, as `FolderCard` still renders it (`${count} · ${kinds}`). Screenshot at 700px, "Folder": `3 items   · Video 2 · Image 1` — the dot visibly belongs to the breakdown, not between count and breakdown.
- When the name leaves the breakdown under ~16px (e.g. 440px column, name 205–214px wide, breakdown 16.4 / 8.3px), the row ends in a bare "·…" or "·" fragment. Invariant 7 permits a partially shown breakdown; this is the cosmetic end of that range. No test and no mutation: shipped behaviour.

### G6. Inline rename's count
- `[pre-existing]` F5 (no test holds the editing branch's count). The fix changed that branch from `{meta}` to `{countLabel}`; the rename row is again the count only, the same content as `99d81e4c`, and `ml-auto` beside the `flex-1` editor is a no-op, so it lays out as before. Ledger only.

## Question A — did the fix do what it claimed?

- **F1** (no browser holder for invariant 5): fixed for a fine pointer only. M5 (`max-sm:block`, round 1's M26 spelling) is now killed by "is not drawn below sm" (78.4px ≠ 0). The coarse-pointer spelling survives (G1).
- **F2** (breakdown squeezed the name): fixed in behaviour. Probed at 440/456/700 with names 6–80 characters on both pointers: whenever the name is truncated the breakdown's box is 0 and the count is 41.75px; whenever the breakdown shows the name is whole. The residue is the 8px gap (G2). The tests kill M1 (no `basis-0`), M2 (no `flex-grow`), M10 (name `flex-1`), M14 (`basis-4`), M18 (name `flex-shrink-0`).
- **F3** (fine-pointer ⋮ alignment): fixed. Round 1's M27 (`pointer-fine:pr-4`) is now killed at 288/343/700 (272≠278, 327≠333, 684≠692).
- **F4** (`pointer-coarse:py-3` branch): removed. The one caller (`folder/FolderContent.tsx` `folderProps`) always passes `onContextMenu`, so no reachable row lost its padding.
- Broke: nothing a user hits, beyond the spacing in G5 and the 8px in G2. Tests: G1, G3, G4 are the gaps.

## Question B — visual regressions
- Count right-aligned when the breakdown is hidden (below `sm`) or absent: yes, flush to the column edge (probe: count right 396 = inner right at 440, 656 at 700; 297 at 343 below `sm`).
- Count right-aligned when the breakdown shows: no longer at the right edge by design — the breakdown's right edge is, and the count's x varies per row with the breakdown's length (240 / 309 / 346 at 440 across names). This matches `b48be52e`, where the meta span's right edge aligned and the count's x also varied; not a regression.
- Gap count ↔ breakdown: G5. Rename branch: lays out as at `99d81e4c` (G6).

## Question C — trajectory

There is one fix commit, so there is no pair of consecutive fix rounds to compare. Its shape against the change it fixes:

- **Removed**: the no-menu `pointer-coarse:py-3` branch, and the nested `hidden sm:inline` span inside the count.
- **Added**: one element (the breakdown as a flex sibling) with a new sizing state (grow from zero, capped at max-content), `ml-auto` on the count, and four predictions — `folder ⋮ right === file ⋮ right` on a fine pointer, and the three `a folder row's breakdown` cases.

`b48be52e` added a pointer-conditional branch; `799c3b77` removed it and replaced a layout rather than adding a special case to the old one, so this round does not read as patching. Warning for the next round: the obvious fixes for G1–G4 are all *additional predictions* (a coarse-pointer copy of the breakdown block, a count-width assertion, a count-position assertion), and G2's obvious fix is a new spacing special case (e.g. margin on the breakdown instead of the container gap). If round 3 is shaped that way, it will be the second consecutive round that adds predictions to the breakdown block, which is the pattern the trajectory rule names.

## Mutation table

| # | mutation (component + fixture unless noted) | want | result |
|---|---|---|---|
| M1 | breakdown: drop `basis-0` | kill | killed (e2e gives-way 700/440: 77.3 / 35.6 ≠ 0) |
| M2 | breakdown: drop `flex-grow` | kill | killed (e2e shows-whole 700/440: width 0) |
| M3 | breakdown: drop `max-w-max` | live (no invariant) | live — G4 |
| M4 | breakdown: drop `min-w-0` | live (equivalent: `truncate` makes it a scroll container, automatic min size 0) | live |
| M5 | breakdown: add `max-sm:block` | kill | killed (e2e below-sm 78.4 ≠ 0) |
| M6 | breakdown: `sm:block` → `md:block` | kill | killed (unit class assertion; e2e 5 cases, partly because `span.sm\:block` no longer matches and `kinds` is null) |
| M7 | breakdown: drop `truncate` | kill | killed (text wraps at 0 width; row 113 / 97 ≠ 41 / 45) |
| M8 | count: drop `ml-auto` | live (no invariant) | live — G4 |
| M9 | count: drop `flex-shrink-0` | kill | killed (count wraps; rows 49 / 53 ≠ 41 / 45) |
| M10 | name: add `flex-1` | kill | killed (gives-way: 105.9 ≠ 0) |
| M11 | name: drop `min-w-0` | live (equivalent, as M4) | live |
| M12 | component only: count after the breakdown | kill | killed (parity; FolderListRow "drops the breakdown below sm") |
| M13 | component only: breakdown drops `max-w-max` | kill | killed (parity) |
| M14 | breakdown: `basis-0` → `basis-4` | kill | killed (gives-way: 13.5 / 6.2 ≠ 0) |
| M17 | breakdown: add `ml-4` | kill | **live** — G2 |
| M18 | name: add `flex-shrink-0` | kill | killed (gives-way: nameTruncated false) |
| M19 | count: `flex-shrink-0` → `min-w-0 truncate` | kill | **live** — G3 (also live at `b48be52e`) |
| M22 | breakdown: add `pointer-coarse:hidden` | kill | **live** — G1 |
| M23 | breakdown: add `pointer-coarse:block` | kill | **live** — G1 |
| M27 | row: add `pointer-fine:pr-4` (round 1's F3 mutation) | kill | killed (fine ⋮ right at 288/343/700) |

## Notes
- A probe run after the parent-commit reproduction for G3 read a sheet compiled from `b48be52e`'s sources (no `basis-0`), and showed a truncated name beside a 58px breakdown. That was the stale sheet, not the code: after one e2e run on the restored tree the same probe gives name 222.25 / breakdown 0. All numbers above are from sheets built from the tree they describe.
- Tree restored after every mutation; final `git status --short` empty; e2e rebuilt from the restored tree (12/12).

TOTAL: 6 findings
