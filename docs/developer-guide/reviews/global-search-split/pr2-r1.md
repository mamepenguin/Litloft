# Review: GlobalSearch split PR-2 (render), round 1

- Reviewed: `170df31a5a4a1f3170a1a6fa60f76941668cbf16` (range `d67ca05d7..170df31a5`), worktree `/Users/libre/Sources/video_share-gs-split`
- Material: diff, old `GlobalSearch.tsx` at `d67ca05d7`, CLAUDE.md, review-workflow.md, frontend-conventions.md, tests.md, comments.md, invariants.md, PR-1 r1.md

## Static reading (in progress)

- `hasResults` (old no-results gate) is `merged.length > 0` at `d67ca05d7:GlobalSearch.tsx:338`, so the new `merged.length === 0` gate is equivalent.
- `jumps` = `[...pageJumps, ...folderJumps]` (`useLauncherRows.ts`), so `jumps.length === pageJumps.length + folderJumps.length` always; the offsets are equivalent.
- No-drive div: old phone `"py-12 text-center text-sm text-text-muted"`, old desktop `"py-8 text-center text-sm text-text-muted"`; new template yields the same strings in the same order.
- `SearchEmptyState mobile={true}/{false}`, `ScopedFooter mobile / mobile={false}` -> `mobile={mobile}` with the same booleans.
- Translation namespaces in the new components (`search`, `shortcuts`, `pageJump`) match the ones the old code used for the same keys.

## Baseline at 170df31a5

- Full `pnpm exec vitest run`: 554 files, 8028 passed, 2 todo.
- `pnpm exec tsc --noEmit`: clean.
- eslint on the three touched files: one warning, `react-hooks/exhaustive-deps` on the recent-reply reset effect (`GlobalSearch.tsx:241`), the known pre-existing one.

## Old/new parity probe

A temporary test (removed afterwards) put `d67ca05d7:GlobalSearch.tsx` beside the new one as `GlobalSearchOld.tsx` and rendered both under identical mocks, in 18 scenarios x {desktop, phone} = 36 cases, comparing `document.body.innerHTML` and `router.push` calls at every step:
no drive (unscoped / scoped), empty state (recent + terms, 3x ArrowDown, click a term), empty state scoped, whitespace-only query, legend (typed -> open -> close -> Shortcuts button), loading (names and semantic both pending, + ArrowDown), loading scoped, results with Go to + Folders + files + semantic hit (9x ArrowDown through every row incl. see-all, click see-all), results without jumps (+ Enter), semantic pending, semantic pending with folder jumps, no results, no files but folder jumps, scoped results (+ArrowDown, click), scoped none, scoped see-all, browse (/ -> ArrowDown -> non-matching filter).
Each scenario was checked to actually reach the branch it names (markers: "Go to", "Folders", "View all", spinner, "No matching files found", "Navigate to a drive page", "Also searching by meaning", legend, phone sheet class, desktop `max-h-[50vh]`).

Result: **36/36 identical.** No DOM, class string, attribute or navigation difference in any branch on either viewport.

The probe is a kill detector for the mutation table below (column "probe").

## Mutation table

Declared before running. `want` is the expectation for the committed suite (GlobalSearch*.test.tsx, AppShell.globalSearch, Header, imeEnterGuard, accent-budget, uploadZoneHosts, ime-enter-guard, core-search-vocabulary). Each mutation restored with `git checkout -- <file>`.

| id | file | mutation | want |
|---|---|---|---|
| M01 | GlobalSearch | body no-drive padding ternary swapped | live (padding) |
| M02 | GlobalSearch | body SearchEmptyState `mobile={true}` | live |
| M03 | GlobalSearch | ScopedFooter `mobile={false}` | live |
| M04 | GlobalSearch | `browseList(false)` in body | live |
| M05 | GlobalSearch | `resultsList(false)` in body | live |
| M06 | GlobalSearch | legend branch disabled | kill |
| M07 | GlobalSearch | no-drive branch disabled | kill |
| M08 | GlobalSearch | onToggleLegend no-op | kill |
| M09 | GlobalSearch | onOpenShortcuts no-op | kill |
| M10 | GlobalSearch | footer always SearchFooter | kill |
| M11 | GlobalSearch | SRL `total={0}` | kill |
| M12 | GlobalSearch | SRL `semanticPending={false}` | kill |
| M13 | GlobalSearch | SearchFooter `semanticPending={false}` | kill |
| M14 | GlobalSearch | SRL onSubmit no-op | kill |
| M15 | GlobalSearch | SRL onEnterFolder no-op | kill |
| M16 | GlobalSearch | SRL `scope={null}` | kill |
| M17 | SearchFooter | drop `aria-expanded` | kill |
| M18 | SearchFooter | pending note never shown | kill |
| M19 | SearchFooter | shortcuts button toggles legend | kill |
| M20 | SearchResultsList | Folders `offset={0}` | kill |
| M21 | SearchResultsList | file `data-search-item` drops folderJumps.length | kill |
| M22 | SearchResultsList | MergedResultItem isSelected drops folderJumps.length | kill |
| M23 | SearchResultsList | see-all highlight index off by one | kill |
| M24 | SearchResultsList | see-all submits "" | kill |
| M25 | SearchResultsList | no-results gate loses `!semanticPending` | kill |
| M26 | SearchResultsList | spinner gate `loading` only | kill |
| M27 | SearchResultsList | container class mobile/desktop swapped | live (layout) |
| M28 | SearchResultsList | spinner size swapped | live (layout) |
| M29 | SearchResultsList | ScopedResultItem `query=""` | kill |
| M30 | SearchResultsList | scoped result branch disabled | kill |
| M31 | SearchResultsList | JumpRows `mobile={false}` (both) | live |
| M32 | SearchResultsList | Folders heading uses Go to | kill |
| M33 | SearchResultsList | spinner padding swapped | live (layout) |
| M34 | SearchResultsList | no-results padding swapped | live (layout) |

### Results

`suite` = committed tests at 170df31a5; `probe` = old/new parity probe; `parent` = the same textual mutation applied to `GlobalSearch.tsx` at `d67ca05d7` (worktree, same suite minus `ime-enter-guard.test.ts`, which fails there only because the scratch worktree's `src/addons` is a copied tree rather than the submodule link tree; control mutation K06p = legend branch disabled at the parent KILLs, so the parent runner is sensitive).

| id | want | suite | probe | parent | note |
|---|---|---|---|---|---|
| M01 | live | live | kill | live | layout value |
| M02 | live | live | kill | live | |
| M03 | live | live | kill | | |
| M04 | live | live | kill | | |
| M05 | live | live | kill | live | |
| M06 | kill | kill | kill | | |
| M07 | kill | **live** | kill | live | F1 |
| M08 | kill | kill | kill | | |
| M09 | kill | kill | kill | | |
| M10 | kill | kill (tsc also errors) | kill | | |
| M11 | kill | **live** | kill | live | F1 |
| M12 | kill | kill | kill | | |
| M13 | kill | kill | kill | | |
| M14 | kill | **live** | kill | live | F1 |
| M15 | kill | **live** | live | live | F1; probe never clicks a folder row's enter button. Equivalence holds by reading: the prop is `enterFolder` in both. |
| M16 | kill | kill | kill | | |
| M17 | kill | **live** | kill | live | F1 |
| M18 | kill | kill | kill | | |
| M19 | kill | kill | kill | | |
| M20 | kill | **live** | kill | live | F1 |
| M21 | kill | **live** | kill | live | F1 |
| M22 | kill | **live** | kill | live | F1 |
| M23 | kill | **live** | kill | live | F1 |
| M24 | kill | **live** | kill | live | F1 |
| M25 | kill | kill | kill | | |
| M26 | kill | **live** | live | live | F1; the probe has no "loading with results already shown" step. Old and new gates are textually identical. |
| M27 | live | live | kill | | layout |
| M28 | live | live | kill | | layout |
| M29 | kill | kill | kill | | |
| M30 | kill | kill | kill | | |
| M31 | live | live | kill | | |
| M32 | kill | kill | kill | | |
| M33 | live | live | kill | | layout |
| M34 | live | live | kill | | layout |

Tree restored after every mutation; `git status --short` clean at the end; HEAD still `170df31a5`. Probe files and the parent worktree removed.

## Answers to the brief's questions

- **Observable difference old vs new**: none found. 36/36 probe cases identical (DOM + navigation) across legend, no drive (scoped/unscoped), browse, empty state (scoped/unscoped), whitespace query, loading (scoped/unscoped), results with/without jumps, semantic pending, no results with/without jumps, scoped results / none / see-all, on both the phone sheet and the desktop modal. Every per-branch value that differed between the old phone and desktop spellings (no-drive `py-12`/`py-8`, `SearchEmptyState mobile`, `ScopedFooter mobile`, `browseList`/`resultsList` argument) is kept: M01-M05 each change only one viewport's value and the probe kills every one.
- **`jumps.length` -> `pageJumps.length + folderJumps.length`**: equivalent everywhere. `jumps` is `[...pageJumps, ...folderJumps]` in `useLauncherRows.ts`, and `jumps` is not filtered anywhere between the hook and the old render. Probe walks ArrowDown through Go to -> Folders -> files -> see-all and matches at every step.
- **Moved comment on `SearchFooter`** ("Outside the scroll area on purpose ..."): still true. Both callers render `footer(mobile)` as a sibling of the scroll container (phone: after `div.flex-1.overflow-y-auto`; desktop: after the list, whose `max-h-[50vh] overflow-y-auto` div is the scroller). It states a property of where the caller places the component rather than of the component itself, but it does not lead a reader to a wrong change. Not a finding.
- `core-search-vocabulary.test.ts` counts: old `GlobalSearch` 10 distinct keys; new 7 (`badgeLegend` stays, drawn by the shortcut registration) + `SearchFooter` 2 (`badgeLegend`, `semanticPending`) + `SearchResultsList` 2 (`noResults`, `viewAllResults`). Matches the file.
- tsc clean, full vitest green, lint only the known warning.

## Findings

### F1 [pre-existing] Low - the committed suite does not hold several render details this refactor moved

- Invariant: none broken. It bears on invariant 3 ("what the modal renders ... is unchanged"): the committed suite alone would not have caught these breaking during the move. The parity probe did, and for this change it shows no difference.
- Reproduction: mutations M07, M11, M14, M15, M17, M20-M24, M26 survive the committed suite at `170df31a5`, and the same textual mutation of the old inline code survives at `d67ca05d7` (column `parent`), so these are gaps that were already there, not a weakening.
- Observation, by user-visible effect:
  - no-drive message not rendered (M07);
  - see-all row shows the wrong total (M11), or does nothing / submits an empty query when clicked (M14, M24);
  - clicking a folder row's enter control does nothing (M15);
  - legend toggle loses `aria-expanded` (M17);
  - keyboard highlight and `data-search-item` indices wrong when Folders rows are present (M20-M23): folder rows get indices that overlap Go to, file rows / see-all highlight a different row than Enter opens;
  - spinner replaces already-shown results while a new query loads (M26).
- The known survivor set from PR-1 `r1.md` (M1/M29, M2, M4, M7, M9, M16, M18) was not re-derived. Known pre-existing items: the `react-hooks/exhaustive-deps` warning on the recent-reply reset effect is still there (one line, `GlobalSearch.tsx:241`), and the `@/addons/*` resolution problem in worktrees was not touched.

TOTAL: 1 findings
