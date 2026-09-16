# Review: compact folder rows, round 4

- Commit under review: `7586865d` (the removal), parent `e34d60bb` (round-3 fix), then `e187dd98` (round-2 fix), `a1c77a61` (the change). Branch parent / merge-base: `6f885dbe`. Worktree `/Users/libre/Sources/video_share-folder-rows`.
- `origin/develop` has since moved to `e60d151c`; every "against develop" reproduction below uses `6f885dbe`, the merge-base. `e60d151c` touches neither `FolderCard.tsx` nor `FolderListRow.tsx`.
- Baseline at `7586865d`: vitest (FolderListRow 15, parity 8, FolderCard 16, popup-dismissal 36) **75 passed**; e2e-layout `list-row-furniture` **7 passed**. Whole frontend suite **495 files / 7222 tests passed**; whole `e2e-layout` suite **297 passed**; `tsc --noEmit` clean.
- Harness: `scratchpad/r4mut.sh` — backs files up to `scratchpad/r4bak/`, applies exact-match replacements (aborts unless the needle matches exactly once), runs both suites, restores from the backup copies (never `git checkout`), prints `git status --short`. The layout suite's globalSetup recompiles `fixtures/globals.built.css` from the current tree on every run, so every number below was measured against a sheet built from the tree it describes; the sheet was rebuilt from the restored tree before each probe.

## Findings

### F1. The layout fixture still measures a `kinds` box that no element can produce, and no test reads it

- Label: **`[introduced]`** by `7586865d`. The commit deleted `kinds` (and `kindsTextWidth`, `kindsTruncated`, `count`, `countTruncated`) from `RowMeasurement` in `list-row-furniture.spec.ts` and deleted four of the five from the fixture — `kinds` was left behind at `frontend/e2e-layout/fixtures/list-row-furniture.html:633`.
- Invariant: none. Bucket **B**.
- Observation: `span.sm\:block` is gone from every shape in the fixture's markup table (`grep -n 'sm\\:block'` matches only line 633, the measurement itself), so `box(...)` returns `null` for every row of every shape, forever. The spec's `RowMeasurement` no longer declares the field, so TypeScript cannot see the mismatch either — `measureRows` is typed by the `declare global` block in the spec, and an extra runtime key is invisible to it.
- Mutation **M17** (want=live, as a dead-code characterisation): rename the key to `kindsDEAD` in the fixture. vitest 75/75, e2e 7/7. **Survived** — nothing reads it.
- Remedy: delete line 633. Left in place it is exactly the `null`-returning measurement that a later `kinds!.width` would be written against.

### F2. Nothing holds the count at the right edge of the row any more

- Label: **`[pre-existing]`** — earned. The same reproduction survives at `6f885dbe` (develop): its `FolderListRow.tsx`, fixture, spec, unit test and parity test were checked out into the worktree, `flex-1` dropped from the folder name span in component **and** fixture → vitest 38/38, e2e-layout `list-row-furniture` 7/7. It is **not** pre-existing against the immediate parent: at `e34d60bb` the property was held (`count!.right === row.link.right` in the breakdown block's helper, r3 M15/M16), and that holder went out of the tree with the breakdown.
- Invariant: none of 1–6 states where the count sits. Bucket **B**.
- Observation: the count's right edge is produced entirely by `flex-1` on the *name* span, which is not what any test looks at. Probe (Chromium, sheet built from `7586865d`, frame widths 343/440/700, viewport 740, both pointers, name "Folder"):

  | width | shipped count left/right | with `flex-1` dropped from the name | link right |
  |---|---|---|---|
  | 343 | 257.3 / 299 | 166.9 / **208.6** | 299 |
  | 440 | 354.3 / 396 | 166.9 / **208.6** | 396 |
  | 700 | 614.3 / 656 | 166.9 / **208.6** | 656 |

  Identical on a coarse pointer. With a 17-character name ("Quarterly reports") the count lands at 240.9 / 282.7 instead of the right edge. The whole right half of every folder row goes empty and the count hugs the name — the same regression r2 filed as G4 for the `ml-auto` spelling, now reachable again through a different one.
- Mutations: **M9** (want=kill), drop `flex-1` from the name span in component + fixture → vitest 75/75, e2e 7/7, **survived**. **M11** (component only) and **M12** (fixture only) are both killed by the parity test, so the two files cannot drift apart — only a matched pair gets through, which is what a layout mutation looks like.
- Why nothing sees it: `measure()` builds every row with `LONG_NAME`, and with a name that overflows, `flex-1` and plain `min-w-0 truncate` produce the same box (basis 0 vs basis auto-then-shrunk). The difference only exists for a name that *fits*, and no case in the file builds one.

### F3. `FOLDER_ROW_COARSE_PX`'s comment describes a branch that no longer exists (prose)

- Label: **`[pre-existing]`** — the branch it names (`pointer-coarse:py-3`, the `onContextMenu`-absent row) was deleted in `e187dd98`, one commit before the parent; the comment was written in `a1c77a61` and neither fix round nor `7586865d` touched it.
- Invariant: none. Bucket **B**, prose.
- `list-row-furniture.spec.ts:64` reads *"A folder row with its bottom border: the 44px floor, or a 20px line plus padding."* The second half is false: no folder row is a 20px line plus padding at any width or pointer today. Probe (sheet from `7586865d`, second row's `⋮` group removed and the branch's two classes stripped, i.e. the `onContextMenu`-absent row):

  | pointer | viewport | shipped row | `onContextMenu`-absent row |
  |---|---|---|---|
  | coarse | 383 | 45 | **40** |
  | coarse | 740 | 45 | **36** |
  | fine | 383 | 45 | **40** |
  | fine | 740 | 41 | **36** |

- Reported under R-3's exception because it would lead a reader to a wrong code change: it tells them 45 is reached two ways, so a row that draws no `⋮` is also 45 and needs nothing. It is not, by 5–9px. (That branch has no call site — `FolderContent.tsx:161` always passes `onContextMenu` — so nothing is user-reachable; this is r1 F4's ledger item, restated only because the comment now points at it.)
- Remedy: delete the clause after the comma (`comments.md`: "When a comment is found to be wrong, delete it"). `const FOLDER_ROW_COARSE_PX = 45` with "the 44px floor plus the bottom border" is the part that is true.

### F4. The glyph's size is unpinned anywhere below the row's tallest other child

- Label: **`[pre-existing]`** — earned. `e34d60bb`'s five files checked out into the worktree, `Folder size={18}` → `24` with the fixture's `width`/`height` attrs moved to match: vitest 42/42, e2e-layout `list-row-furniture` 17/17. Survives at the parent too. (r1 recorded the 18→22 half of this as M9.)
- Invariant: none states the glyph's size. Bucket **B**.
- Observation: the row's height is set by the `⋮` button (24px on a fine pointer, 44px on a coarse one), so the glyph is free between 1 and 24px without any measurement moving; it is centred in the `w-24` column, so `name.left` does not move either.
- Mutations: **M6** 18→24 in component + fixture, want=live → vitest 75/75, e2e 7/7, survived. **M7** 18→28, want=kill → e2e 3 failed (fine heights 45/49 ≠ 45/41). Component-only changes are killed by the parity test, which compares the `width`/`height` attributes. So the pair is pinned to each other but not to 18.

### F5. The rename row's count still has no holder

- Label: **`[pre-existing]`** — ledger item r1 F5 / r2 G6, not re-derived beyond confirming it survives here.
- Invariant: 5 ("inline rename behaves as before"), test gap only. Bucket **B**.
- Mutation **M13** (want=kill): replace `{meta}` with `{null}` in the `editing ?` branch (line 108). vitest 75/75. **Survived.** The same replacement in the link branch (line 123, **M21**) is killed twice over — by the parity test's children count and by `getByText(/5/)` — so only the editing branch is unheld, as before.

## Question A — what the removal left behind, and what it took too much of

**Took too much: nothing.** Every deletion is accounted for, and the two files a reader would check are exactly where they should be:

- `FolderCard.tsx` is **byte-identical** to develop: `git diff 6f885dbe 7586865d -- frontend/src/components/FolderCard.tsx` is empty (and so is the diff against `origin/develop`). Import order, `useTranslations` calls and the `meta` join are the originals, not a re-typing. Invariant 4 needs no further evidence than that, and `FolderCard.test.tsx` is untouched (16 tests, green).
- `FolderListRow.tsx` against develop is **+10 / −6**, and every hunk is the row change: the glyph tile becomes a bare `w-24` column, the glyph goes 22 → 18, and the `onContextMenu` branch gains `pointer-coarse:py-0`. No breakdown, no `ml-auto`, no `-ml-2`, no ` `, no second flex sibling, no new state.
- `frontend/src/hooks/useFolderMeta.ts` is gone and **nothing references it** (`grep -rn useFolderMeta frontend/src frontend/e2e-layout` → no hits; `tsc --noEmit` clean). `folderKindBreakdown` survives with `FolderCard.tsx` as its caller and its own unit test, as on develop.
- `popup-dismissal.test.ts`'s source-file count is back to **432 and correct** — the test passes (36/36). `sourceFiles` skips `__tests__`, `*.test.*`, dotfiles and the `frontend/src/addons` link tree, so the generated addon links and `messages/` do not enter the count.
- The parity test's `folder` literal gained `kind_counts` / `dominant_kind`, but both are **required** members of `Folder` (`types/index.ts:129-130`); dropping the `as Folder` cast for a typed literal is what forces them. Not dead weight.

**Left behind: two subtractions the commit missed**, F1 (the dead `kinds` measurement) and F3 (half of a comment). Both are bucket B, neither is reachable by a user.

**Nothing now asserts nothing.** The retained assertions were each shown to run against real values:

| assertion | mutation that kills it | evidence |
|---|---|---|
| `by.folder.row.height === 45` (coarse, ×3 widths) | M18 (constant 45 → 44) | 3 failed, received 45 |
| `by.folder.row.height === w.folderFine` (fine) | M19 (`folderFine` 41 → 45 at 700) | 1 failed, received 41 |
| `by.folder.thumb!.left === file.thumb!.left` | M4 (drop `sm:p-2`) | coarse 700: 10 ≠ 8 |
| `by.folder.name.left === file.name.left` | M1 (`w-24 w-20!`) | 102 ≠ 96-based file value, at 3 widths × 2 pointers |
| `folderMore.right === more.right` + `.width === 44` (coarse) | M2/M3 indirectly; r1 M28b | — |
| `by.folder.controls[0].box.right === more.right` (fine) | M20 (`pointer-fine:pr-4`) | 684/327/272 ≠ file `⋮` right |

None of these can pass vacuously: a missing `.w-24`, a missing `span.truncate` or a missing `button[aria-label]` makes the fixture or the `!` dereference throw rather than skip (r1 M5 and r3 M16 are both recorded kills-by-crash). No element in the folder row is `display:none` any more, so the "box of a hidden element" failure mode that r2/r3 had to guard against is gone with the breakdown.

## Question B — mutation results

See the table at the end. Summary: the three declared layout invariants (1, 2, 3) are each killed by at least one paired component+fixture mutation, on **both** pointers — r1's F3 gap (fine-pointer `⋮` alignment unmeasured) stayed fixed through the removal. Invariant 5 is killed on drag-while-renaming (M14), the `<img>` ban (M15) and the drop-target ring (M16). Invariant 6 is killed on removing the count (M21/M22). Invariant 4 needs no mutation: the file is byte-identical to develop.

What survives and is *meant* to: the glyph size below 24px (F4), the count's position (F2), the rename row's count (F5), and `flex-shrink-0` on the count — **M8** (`flex-shrink-0` → `min-w-0 truncate`) and **M10** (plain removal) both survive, but they are **equivalent mutants here, not a gap**: with `flex-1` (basis 0) on the name the count never has to shrink, so it stays 41.8px wide and untruncated in every probed case, including a name long enough to truncate. This is the one r2/r3 finding (G3, "the count always stays whole") that the removal has made unreachable rather than merely unheld.

## Question C — visually-observable regressions a user can hit

Probed in Chromium against a sheet built from `7586865d`, both pointers, frame widths 343 / 440 / 700:

- **Count flush right: yes.** `countRight === linkRight` at every width and both pointers (299/299, 396/396, 656/656), with a short name and with a long one.
- **A very long name truncates rather than pushing the count out: yes.** `nameTruncated: true`, count box unchanged at 41.8px and still flush right. There is no longer a third element to squeeze, so the r2 G2 / r3 G5b band where the row ended in a bare "·…" fragment cannot occur.
- **Row heights unchanged from what the branch was for:** 45 coarse at every width, 45 fine below `sm`, 41 fine at `sm` and up. Measured, not inferred.
- **Rename row still lays out:** the editing branch is `<div class="min-w-0 flex-1">` (the editor) + the same `flex-shrink-0` count, inside the same `max-w-list-row` container — the count is flush right there for the same reason as in the link branch. Unchanged from develop's shape; `7586865d` only renamed `countLabel` back to `meta`.
- **Drop-target ring still drawn:** M16 (removing the ring classes) fails `FolderListRow.test.tsx`.
- **No regression found.** The only user-visible change from the parent is the intended one: the row no longer says what the folder holds.

## Question D — trajectory

Read in order:

| commit | removes | adds |
|---|---|---|
| `a1c77a61` | the 96×56 glyph tile | the bare `w-24` column; `pointer-coarse:py-0`; **a second `pointer-coarse:py-3` branch** for the no-menu row; a nested `hidden sm:inline` breakdown span; **a new shared file** `useFolderMeta.ts`; 3 unit tests; 6 e2e assertions |
| `e187dd98` | the `py-3` branch; the nested span | the breakdown as its own flex sibling with a new sizing state (`basis-0 flex-grow max-w-max`); `ml-auto` on the count; **4 new e2e predictions** |
| `e34d60bb` | **nothing** | `-ml-2`; a load-bearing U+00A0; **6 new e2e predictions**, run across two pointers |
| `7586865d` | the breakdown span and its sizing state; `ml-auto`; `-ml-2`; the U+00A0; `useFolderMeta.ts` (a whole file); 3 unit tests; 10 e2e tests; 1 spec constant; 5 interface fields; 4 fixture measurement fields | **nothing** |

**The loop is converging, and this round is where it converged.** By `review-workflow.md` R-4's shape test, rounds 2 and 3 were the patching pattern (r3 H2 said so, and r2 predicted the shape a round early). Round 4 is the opposite reading of the same test: it removes a branch, a state and several predictions, and it removes the *cause* — the breakdown sharing the name's width — rather than another consequence of it. Nothing in `7586865d` is a new special case.

Two things the supervisor should weigh, neither of which the reviewer assigns a bucket to:

1. **What survives is the half that was right in round 1.** `FolderListRow.tsx` at `7586865d` differs from `a1c77a61` only by the deleted breakdown and the deleted `pointer-coarse:py-3` branch. The height change — what the branch was for — never needed a fix; all three rounds of findings were about the content change that has now been deleted. The branch would be the same today if `a1c77a61` had shipped the row's height alone.
2. **The residue is the shape of a removal, not of a patch.** F1 and F3 are each a deletion the commit forgot, and the fix for both is to delete more. That is not the same object as "one more branch to handle one more case", and it should not be read as a fourth patched round.

## Mutation table

Paired = component **and** fixture, which is what a real layout change looks like; the parity test kills either half alone (M11, M12).

| # | mutation | want | result |
|---|---|---|---|
| M1 | glyph column `flex w-24 flex-shrink-0 justify-center` → `… w-24 w-20! …` (paired) | kill | killed — e2e 5 failed, `folder.name.left` 102/100 ≠ file's, both pointers, 3 widths (inv 1) |
| M2 | drop `pointer-coarse:py-0` (paired) | kill | killed — coarse heights 65/61/65 ≠ 45 (inv 3) |
| M3 | `pointer-coarse:py-0` → `pointer-coarse:pt-0` (paired) | kill | killed — coarse heights 53/55/55 ≠ 45 |
| M4 | drop `sm:p-2` (paired) | kill | killed — fine 700 height 45 ≠ 41; coarse 700 `thumb.left` 10 ≠ 8 |
| M5 | row `p-2.5` → `p-3` (paired) | kill | killed — fine heights 49 ≠ 45; coarse `thumb.left` 12 ≠ 10 |
| M6 | `Folder size` 18 → 24 (paired) | live | live — F4 (also live at `e34d60bb`) |
| M7 | `Folder size` 18 → 28 (paired) | kill | killed — fine heights 45/49/49 |
| M8 | count span `flex-shrink-0` → `min-w-0 truncate` (paired) | live (equivalent) | live — probe: count still 41.8px, `countTruncated` false, even with `LONG_NAME` |
| M9 | name span drop `flex-1` (paired) | kill | **live** — F2 (also live at `6f885dbe`) |
| M10 | count span drop `flex-shrink-0` (paired) | live (equivalent) | live — see M8 |
| M11 | name span drop `flex-1`, **component only** | kill | killed (parity: `folder > [0] a > [1] div > [0] span: class`) |
| M12 | name span drop `flex-1`, **fixture only** | kill | killed (parity, opposite direction) |
| M13 | editing branch `{meta}` → `{null}` | kill | **live** — F5 (ledger r1 F5 / r2 G6) |
| M14 | `dragEnabled = draggable && !isEditing` → `draggable` | kill | killed (`is a drag source, and stops being one while it is being renamed`) |
| M15 | glyph `<Folder>` → `<img>` | kill | killed (FolderListRow `draws a glyph, and never a photograph`; parity `expected 'img' to be 'svg'`) |
| M16 | drop the drop-target ring classes | kill | killed (`takes a drop, like the card does`) |
| M17 | fixture `kinds:` → `kindsDEAD:` | live (dead field) | live — F1 |
| M18 | spec `FOLDER_ROW_COARSE_PX` 45 → 44 | kill | killed — 3 failed, received 45 (the coarse height assertion runs) |
| M19 | spec `folderFine` 41 → 45 (700px row) | kill | killed — 1 failed, received 41 (the fine height assertion runs) |
| M20 | folder row `+ pointer-fine:pr-4` (paired) | kill | killed — fine `folder ⋮ right` 684/327/272 ≠ file `⋮` right (inv 2; this is r1's F3, still fixed) |
| M21 | link branch `{meta}` → `{null}` | kill | killed (parity children 1 ≠ 2; `getByText(/5/)`) (inv 6) |
| M22 | M21 + fixture count span class → `hidden` | kill | killed (same two) |
| R1 | at `6f885dbe`: name span drop `flex-1` (paired) | — | **live** → F2 is `[pre-existing]` |
| R2 | at `e34d60bb`: `Folder size` 18 → 24 (paired) | — | **live** (42/42, 17/17) → F4 is `[pre-existing]` |

## Notes

- Reproductions at `6f885dbe` and `e34d60bb` were done by writing those commits' versions of the five (resp. six) files into the worktree with `git show <sha>:<path> >`, mutating, running, then copying back from `scratchpad/r4bak/`; `frontend/src/hooks/useFolderMeta.ts`, which exists only at `e34d60bb`, was deleted again afterwards. No `git checkout` was used and nothing was committed or pushed.
- The compiled fixture sheet was rebuilt from the restored tree (a clean `list-row-furniture` run) before every probe, so no probe read a mutated stylesheet.
- Final state: `git -C /Users/libre/Sources/video_share-folder-rows status --short` **empty**; `list-row-furniture` 7/7 and vitest 75/75 re-confirmed on the restored tree.
- Bucket A is empty: no finding breaks invariants 1–6.

TOTAL: 5 findings
