# Review: compact folder rows, round 1

- Commit under review: `b48be52e` (parent `99d81e4c`), worktree `/Users/libre/Sources/video_share-folder-rows`
- Baseline: FolderListRow / FolderCard / listRowFurnitureFixtureParity vitest 42 passed; e2e-layout `list-row-furniture` 7 passed.

## Findings

### F1. Invariant 5 (no breakdown below `sm`) is held only by a class-subset assertion; a change that shows the breakdown on a phone passes every test

- Label: `[introduced]` (the breakdown span, its test and invariant 5 are all new in this commit)
- Invariant: 5 (the test lets it break); bucket candidate A under R-4 ("a test that lets an A through is an A")
- Mutation M26 (want=kill), applied to the component and the fixture together:
  ```diff
  -{kinds && <span className="hidden sm:inline"> · {kinds}</span>}
  +{kinds && <span className="hidden sm:inline max-sm:inline"> · {kinds}</span>}
  ```
  (same token change on the fixture's `"class": "hidden sm:inline"`)
- Result: vitest (FolderListRow, FolderCard, parity) 42/42 pass; e2e-layout `list-row-furniture` 7/7 pass. **Survived.**
- Observation in Chromium against the same fixture and compiled sheet (scratch probe, not a repo file): at 343px the kinds span's computed `display` went from `none` to `inline`, and the folder name's width fell from 129px to 20px (fine) / 131px to 22px (coarse). Row height stayed 45, so no existing height assertion notices.
- Why it survives: `FolderListRow.test.tsx` "drops the breakdown below sm and keeps the count" uses `expect.arrayContaining(["hidden", "sm:inline"])`, which accepts added tokens, and the parity test only checks that the component and fixture agree. `list-row-furniture.spec.ts` measures folder height, thumb left and name left, never whether the breakdown is displayed or how wide the folder name is below `sm`.
- A browser assertion at 288/343 that the kinds span is not displayed (or that the folder name keeps the file row's name width) would kill it; an exact token assertion in jsdom would kill this particular spelling only.

### F2. Above `sm` in a narrow column the breakdown (`flex-shrink-0`) takes the folder name's width; with a long English breakdown the name is ~27–67px, and below ~400px the meta overflows under the ⋮ button

- Label: `[introduced]` (the parent's meta was the count alone)
- Invariant: none of the declared ones. Offered as the answer to "is anything missing from this list?" (see below).
- Reproduction (scratch probe on the fixture with the compiled sheet, viewport 700 so `sm` applies; column width set directly; meta text replaced by realistic strings). The reachable narrow case is `md` with the tree open: `TwoPaneLayout` gives the tree `md:w-[280px]`, so a 768px viewport leaves roughly a 456px row.
  | row width | meta text | meta width | folder name width |
  |---|---|---|---|
  | 456 | `138 items · Video 135 · Document 3` | 205 | 83 |
  | 456 | `1,234 items · Document 1,200 · Archive 34` | 245 | 43 |
  | 456 | `138件 · 動画 135 · 文書 3` | 136 | 152 |
  | 440 | `138 items · Video 135 · Document 3` | 205 | 67 |
  | 440 | `1,234 items · Document 1,200 · Archive 34` | 245 | 27 |
  | 380 | `1,234 items · Document 1,200 · Archive 34` | 245 | 0; meta right 369 > link right 336, ⋮ left 348 (fine) / 336 (coarse) |
- 380px above `sm` is probably not reachable at default zoom with the current frame; 440–456 is. The name, which is what identifies the row, is truncated to a few characters while the breakdown is kept whole. No test measures a folder name width at any width (the spec's `name` widths are for the file row, and `null` at 700).
- No mutation: this is behaviour of the shipped code, not a test gap.

### F3. Folder ⋮ right-edge alignment (invariant 2) is measured only on a coarse pointer
- Label: `[pre-existing]` (reproduced against `99d81e4c` with the same mutation: survives there too)
- Invariant: 2 (test gap; not broken by this commit)
- Mutation M27 (want=kill), component and fixture together:
  ```diff
  -` pointer-coarse:py-0 ${ROW_FURNITURE_PADDING}`
  +` pointer-fine:pr-4 pointer-coarse:py-0 ${ROW_FURNITURE_PADDING}`
  ```
- Result at `b48be52e`: vitest pass, e2e 7/7 pass. **Survived.** Probe: fine pointer folder ⋮ right = 327 vs file ⋮ right 333 at 343px; 684 vs 692 at 700px. Coarse unaffected.
- At `99d81e4c` (parent versions of FolderListRow.tsx, the fixture, the spec and the parity test checked out, same `pointer-fine:pr-4` added to both): parity 8/8 pass, e2e 7/7 pass. Survived → pre-existing. The "with a mouse" block asserts `by.folder.row.height`, `thumb.left`, `name.left` but not `by.folder.controls[0].box.right === more.right`.

### F4. The coarse-pointer `pointer-coarse:py-3` branch (row without `onContextMenu`) is untested and has no call site
- Label: `[introduced]`
- Invariant: none (the only caller, `FolderContent.tsx`, always passes `onContextMenu`)
- Mutations M11 (`py-3` → `py-6`, want=live) and M12 (`py-3` removed, want=live): vitest pass. Survived as expected. Neither the parity table nor the fixture has a folder shape without the ⋮ button, so the 45px claim for this branch is unmeasured. Recorded for the ledger (B); nothing reachable.

### F5. Inline rename's meta is not held by any test
- Label: `[pre-existing]` (reproduced at `99d81e4c`: removing `{meta}` from the editing branch leaves FolderListRow.test.tsx 14/14 green)
- Invariant: 6 ("inline rename behaves as before") — test gap only
- Mutation M32 (want=kill?): delete `{meta}` from the `editing ?` branch. At `b48be52e`: vitest 42/42 pass. Survived. The editing branch now also carries the new breakdown span, and nothing renders it.

## Is anything missing from the R-0 list? (round one only)

1. **The folder name keeps a usable width wherever the breakdown is shown.** Invariant 5 protects phones only; F2 shows the new `flex-shrink-0` breakdown squeezing the name at `md` with the tree open. Something like "above `sm`, the breakdown gives way before the folder name does" (or a stated minimum name width at a declared column width) is observable and mutable.
2. **Invariant 2 should say "on both pointers"** and be measured on both (F3); today only the coarse half is.
3. Invariant 5 as written is right but has no real-browser holder (F1).

## Mutation table

| # | mutation | want | result |
|---|---|---|---|
| M1 | component only: drop `pointer-coarse:py-0` | kill | killed (parity) |
| M2 | component + fixture: drop `pointer-coarse:py-0` | kill | killed (e2e coarse height 61/65 ≠ 45) |
| M3 | component only: `hidden sm:inline` → `inline` | kill | killed (parity, FolderListRow) |
| M4 | component + fixture: `hidden sm:inline` → `hidden md:inline` | kill | killed (FolderListRow unit); e2e passed |
| M5 | component + fixture: glyph column `w-24` → `w-20` | kill | killed (unit; e2e 6 failed) |
| M6 | component + fixture: drop `justify-center` on glyph column | live | live |
| M7 | component + fixture: drop `sm:p-2` on folder row | kill | killed (e2e fine 700 height 45 ≠ 41) |
| M8 | component + fixture: `Folder` 18 → 28 | kill | killed (e2e heights 49/45) |
| M9 | component + fixture: `Folder` 18 → 22 | live | live |
| M10 | component: swap `py-0` / `py-3` branches | kill | killed (parity) |
| M11 | component: no-menu branch `py-3` → `py-6` | live | live (F4) |
| M12 | component: no-menu branch `py-3` removed | live | live (F4) |
| M13 | hook: single-kind branch never taken | kill | killed (FolderCard) |
| M14 | hook: empty breakdown → `""` instead of `null` | live (equivalent) | live |
| M15 | hook: join `" · "` → `", "` | kill | killed (FolderCard 3, FolderListRow 1) |
| M16 | hook: single kind named with its number | kill | killed (FolderCard) |
| M17 | card: always append `· ${kinds}` | kill | killed (FolderCard empty folder) |
| M18 | row: drop `kinds &&` guard | kill | killed (FolderListRow empty folder) |
| M19 | row: separator `·` → `-` | kill | killed (FolderListRow) |
| M20 | row: no breakdown span at all | kill | killed (parity, FolderListRow) |
| M21 | row: breakdown span removed from meta, fixture unchanged | kill | killed (parity, FolderListRow) |
| M22 | row: drag stays on while renaming | kill | killed (FolderListRow) |
| M23 | component + fixture: `pointer-coarse:py-0` → `pointer-coarse:pt-0` | kill | killed (e2e coarse heights 53/55) |
| M24 | fixture only: drop the `hidden sm:inline` child | kill | killed (parity) |
| M25 | hook: count from `breakdown.length` instead of `file_count` | kill | killed (FolderCard 4, FolderListRow 3) |
| M26 | component + fixture: add `max-sm:inline` to breakdown span | kill | **live** (F1) |
| M27 | component + fixture: folder row `pointer-fine:pr-4` | kill | **live** (F3; also live at parent) |
| M28 | component + fixture: folder ⋮ `pointer-coarse:h-9` | kill | live, but no effect: `pointer-coarse:h-11` wins the cascade (probe: button still 44). Equivalent mutant |
| M28b | component + fixture: folder ⋮ `pointer-coarse:max-h-9` | kill | killed (e2e coarse row height 37 ≠ 45); parity passed as both sides changed |
| M30 | component: glyph `<Folder>` → `<img>` | kill | killed (parity, FolderListRow) |
| M31 | component: drop row `onContextMenu` | kill | killed (FolderListRow) |
| M32 | component: editing branch drops `{meta}` | kill? | **live** (F5; also live at parent) |
| M33 | component: drop `{...dropTargetProps}` | kill | killed (FolderListRow) |
| M34 | component: drop drop-target ring classes | kill | killed (FolderListRow) |

## Notes for whoever runs these suites

- `e2e-layout/fixtures/globals.built.css` is gitignored and is rebuilt only by the Playwright globalSetup. A probe run straight after a mutated e2e run reads the mutated sheet (first probe here saw a 60px coarse row for that reason). The sheet was rebuilt from the restored tree at the end (7/7 pass).
- Tree restored: `git status --short` empty at `b48be52e`. Scratch probes live only in the session scratchpad.

TOTAL: 5 findings
