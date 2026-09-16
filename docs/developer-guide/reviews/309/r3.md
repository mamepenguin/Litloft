# Review: compact folder rows, round 3

- Commit under review: `2f8d6d3c` (round-2 fix), parent `799c3b77` (round-1 fix), change `b48be52e`. Worktree `/Users/libre/Sources/video_share-folder-rows`.
- Baseline at `2f8d6d3c`: e2e-layout `list-row-furniture` 17 passed; vitest (FolderListRow, parity, FolderCard) 42 passed.
- Harness: `scratchpad/r3mut.sh` copies component + fixture from `scratchpad/r3bak/`, applies an exact-match replacement (fails if the needle does not match exactly once), runs both suites, restores from the backup, prints `git status --short`. The layout suite recompiles the fixture sheet on every run.

## Findings

(written incrementally below)

### H1. The non-breaking space that fixes G5a has no holder, and the obvious tidy-up makes the separator worse than round 2

- Label: `[introduced]` (the U+00A0 prefix is new in `2f8d6d3c`)
- Invariant: none (no invariant covers separator spacing; G5a was triaged as a fix, not an invariant). Bucket B unless the supervisor says otherwise.
- Why the character matters: the breakdown is a blockified flex item with `white-space: nowrap`, so a leading ordinary space is collapsed away at the start of its line. Probe (sheet built from the clean tree, both pointers identical, 440 and 700px, name "Folder"), gap from the end of the count's text to the dot / from the dot to the next word:
  | breakdown text | before dot | after dot |
  |---|---|---|
  | U+00A0 then `· Video 2 · Image 1` (shipped) | 3.38 | 3.38 |
  | U+0020 then `· Video 2 · Image 1` (ordinary space) | **0** | 3.38 |
  | `· Video 2 · Image 1` (round-2 text, now without the gap) | **0** | 3.38 |
  So the two edits a reader is likeliest to make — writing `{` · ${kinds}`}` or going back to `· {kinds}` — draw `3 items· Video 2`, the dot touching the count (round 2 had 8px there).
- Why no test sees it: the parity test deliberately does not compare `text`; `FolderListRow.test.tsx` uses `getByText`, whose default normaliser trims and collapses `\s` (which includes U+00A0); the layout suite measures the fixture's own text, and `kindsTextWidth` is read off the same span, so any text passes it.
- Mutations (all want=live as characterisation, since no invariant is declared; recorded because G5a's fix rests on them): M11 both files drop the prefix — 17/17, 42/42, survived. M12 both files ordinary space — survived. M13 component only ordinary space — survived. M14 component only drop prefix — survived.

### H2. Trajectory: the second consecutive round adds predictions to the breakdown block, and this one also adds two compensations

- Label: `[introduced]`
- Invariant: none; this is the cross-round question (see "Question C"). Raised for the supervisor, not assigned a bucket by the reviewer.
- Observation in brief: `2f8d6d3c` removes nothing from the component; it adds `-ml-2` (a margin whose only job is to cancel the container's `gap-2` for one sibling) and a load-bearing U+00A0 (whose only job is to survive whitespace collapse at the start of that sibling). Both compensate consequences of `799c3b77` splitting the breakdown out of the count into its own flex item. The spec file grows by six predictions. Round 2's report predicted exactly this shape.

### H3. Squeezed breakdown fragment (G5b)
- `[pre-existing]` ledger item G5b, not re-derived.

### H4. Rename row shows the count only (G6/F5)
- `[pre-existing]` ledger item G6/F5, not re-derived; `2f8d6d3c` does not touch the editing branch.

## Question A — did `2f8d6d3c` do what it claimed?

- **G1** (breakdown tests fine-pointer only): fixed. The block now runs under both pointers and asserts `m.coarse`. Round 2's survivors are killed: M9 `pointer-coarse:block` (coarse "is not drawn below sm": count right 210.6 ≠ 299), M10 `pointer-coarse:hidden` (coarse "shows whole" 440/700: width 0).
- **G2** (squeezed breakdown kept the 8px gap): fixed in behaviour. Probe sweep, both pointers, columns 440/456/520/700, names 1–86 characters (344 cases per pointer), breakdown present vs removed: name truncation state identical in every case; whenever the name is truncated the breakdown box is 0; the count's width never changes; the breakdown's left edge is never left of the count's right edge (no overlap). Held: M1 drop `-ml-2` (8 failures, count right 648 ≠ 656), M2 `-ml-1` (652 ≠ 656), M3 `-ml-4` (count right 554.7 ≠ breakdown left 546.7, i.e. the overlap is caught), M26 container `gap-3` with `-ml-2` left alone (652 ≠ 656) — so the margin's coupling to the parent's gap is held by `NAME_GAP_PX`.
- **G3** (count truncation unheld): fixed. M17 `flex-shrink-0 → min-w-0 truncate` killed (`countTruncated` true), M18 `min-w-0 whitespace-nowrap` (overflowing, unclipped) also killed. MM4 shows `countTruncated` is the only holder (forcing it false revives M17) — a single holder, not a vacuous one.
- **G4** (count position unheld): fixed. M15 `ml-auto ml-0!` (class still matches the selector, margin gone) killed: count right 317.9 ≠ 396/656. M16 plain removal is killed too, but by a TypeError (`span.ml-auto` matches nothing, `count!` is null) — a crash, still a fail. M4 drop `max-w-max` killed by `toBeCloseTo(kindsTextWidth)` (447.4 vs 109.3).
- **G5a** (lopsided separator): fixed in behaviour (3.38 / 3.38px measured), unheld (H1).
- **Vacuity of the new measurements**: `kindsTruncated` and `kindsTextWidth` are independent holders — M22 `max-w-[100px]` is killed by `kindsTruncated`; with it forced false (MM1) by `toBeCloseTo` (100 vs 109.3, precision 0 = diff < 0.5); with `kindsTextWidth` replaced by the element's own box (MM2, the derived-expectation trap) still killed by `kindsTruncated`; only with both disabled (MM3, want=live) does it survive. The `null` fallbacks cannot pass silently: every test that reads `kinds`/`count` also dereferences the box with `!`. The below-`sm` `width === 0` on a `display:none` box is not vacuous in practice because the helper's `count.right === link.right` fails first whenever the breakdown is displayed (M8, M9).
- **Parity**: still binds classes in both directions (M23 component-only drop `-ml-2`, M24 fixture-only, M25 component-only `ml-0!` all fail parity). It does not bind text (H1).
- Broke: nothing measured. Row heights, ⋮ alignment and name x are unchanged (whole suite green; M-series never tripped the older describe blocks).

## Question B — visual regressions

- Overlap of breakdown onto count: none at any probed width (sweep above); `-ml-4` would overlap and is caught.
- Count flush right when the breakdown is absent (no `kinds`): 396/396 at 440, 656/656 at 700, both pointers. Below `sm` with the breakdown present: held by the helper at 343 (297 / 299 = link right).
- With the breakdown showing, the count sits directly against the breakdown box (286.69 = 286.69) and the visible separator is symmetric.
- Rename row: not changed by this commit (H4).
- Nothing user-visible regressed; the only exposure is H1, which is latent until someone edits the string.

## Question C — trajectory

Read in order:

- `b48be52e` (change): count and breakdown in one span (`{count}<span class="hidden sm:inline"> · {kinds}</span>`), plus a no-menu `pointer-coarse:py-3` branch.
- `799c3b77` (round-1 fix): **removed** the py-3 branch and the nested span. **Added** the breakdown as a separate flex sibling with a new sizing state (`basis-0 flex-grow max-w-max`), `ml-auto` on the count, and four predictions (fine ⋮ alignment; below-sm absence; shows whole; gives way).
- `2f8d6d3c` (round-2 fix): **removed** nothing from the component. **Added** `-ml-2` and the U+00A0 prefix, and in the spec: the whole breakdown block duplicated across pointers, plus `countTruncated`, `count.right === link.right` in the helper, `kindsTruncated`, `kinds.width ≈ kindsTextWidth`, `kinds.right === link.right`, `count.right === kinds.left`, `count.left − name.right === NAME_GAP_PX` (six new predictions, run in two pointers).

**Yes: two rounds in a row have added predictions to the same breakdown block, and this round's component changes are compensations, not a new layout.** `-ml-2` exists only to undo the container gap for one sibling, and U+00A0 exists only to undo whitespace collapse at the start of that sibling. Both are side effects of `799c3b77`'s decision to make the breakdown its own flex item; round 2's G2 and G5a were those side effects, and round 3 handles each with one more special case rather than removing the cause. Each is small and held (except H1), and nothing regressed, but by the shape test in `review-workflow.md` R-4 this is the pattern named there: the design is being patched. The alternative shape the author would need to consider is one where the breakdown's separator and spacing are not split across a container gap and a sibling's text at all. The supervisor assigns the bucket.

## Mutation table

| # | mutation (component + fixture unless noted) | want | result |
|---|---|---|---|
| M1 | breakdown: drop `-ml-2` | kill | killed (8: count right 648≠656, 388≠396; count right 278.7≠breakdown left 286.7) |
| M2 | breakdown: `-ml-2` → `-ml-1` | kill | killed (8: 652≠656) |
| M3 | breakdown: `-ml-2` → `-ml-4` (overlaps count) | kill | killed (8: 554.7≠546.7, 664≠656) |
| M4 | breakdown: drop `max-w-max` | kill | killed (toBeCloseTo 447.4 vs 109.3) |
| M5 | breakdown: drop `basis-0` | kill | killed (gives way: 358.1≠396) |
| M6 | breakdown: drop `flex-grow` | kill | killed (shows whole: width 0) |
| M7 | breakdown: drop `min-w-0` | live (equivalent: `truncate` gives min size 0) | live |
| M8 | breakdown: drop `hidden` | kill | killed (e2e below sm both pointers; unit class assertion) |
| M9 | breakdown: add `pointer-coarse:block` | kill | killed (coarse below sm: 210.6≠299) |
| M10 | breakdown: add `pointer-coarse:hidden` | kill | killed (coarse shows whole: width 0) |
| M11 | U+00A0 prefix removed | live (no invariant) | live — H1 |
| M12 | U+00A0 → ordinary space | live (no invariant) | live — H1 (before-dot 0px) |
| M13 | component only: U+00A0 → ordinary space | live (no invariant; parity ignores text) | live — H1 |
| M14 | component only: U+00A0 removed | live | live — H1 |
| M15 | count: `ml-auto ml-0!` | kill | killed (317.9≠396/656) |
| M16 | count: drop `ml-auto` | kill | killed (TypeError: selector matches nothing) |
| M17 | count: `flex-shrink-0` → `min-w-0 truncate` | kill | killed (countTruncated) |
| M18 | count: `flex-shrink-0` → `min-w-0 whitespace-nowrap` | kill | killed (countTruncated) |
| M19 | name: add `flex-1` | kill | killed (546.7≠656) |
| M20 | name: drop `min-w-0` | live (equivalent) | live |
| M21 | name: add `flex-shrink-0` | kill | killed (721≠396) |
| M22 | breakdown: `max-w-max` → `max-w-[100px]` | kill | killed (kindsTruncated) |
| M23 | component only: drop `-ml-2` | kill | killed (parity) |
| M24 | fixture only: drop `-ml-2` | kill | killed (e2e + parity) |
| M25 | component only: count `ml-0!` | kill | killed (parity) |
| M26 | link container `gap-2` → `gap-3`, `-ml-2` unchanged | kill | killed (652≠656) |
| MM1 | fixture JS: `kindsTruncated` → false, + M22 | kill | killed (toBeCloseTo 100 vs 109.3) |
| MM2 | fixture JS: `kindsTextWidth` → element box width, + M22 | kill | killed (kindsTruncated) |
| MM3 | MM1 + MM2 together, + M22 | live (both holders disabled) | live |
| MM4 | fixture JS: `countTruncated` → false, + M17 | live (characterises the sole holder) | live |

## Notes
- Probes: `scratchpad/r3probe/probe.cjs`, run only after an e2e run on the restored tree, so the sheet was compiled from `2f8d6d3c`'s sources; probe edits were DOM-only text/element removal and use no classes absent from the sheet.
- Tree restored from `scratchpad/r3bak/` after every mutation; final `git status --short` empty.

TOTAL: 4 findings
