# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-verify:V-1
- unspecified_behavior
- unspecified_behavior

## Needs a human

### open_c (claude-verify:V-1)

Question: formatRelativeAge picks a unit by fixed day thresholds: 30-day months below 365 days, then 365-day years. A book added 360 to 364 days ago therefore reads "12 months ago" / "12か月前" instead of "1 year ago". 28 to 29 days reads "4 weeks ago". The tests do not cover any boundary (they check 3, 14, 240 and 730 days only).
Impact: In normal use the relative-age line on a Reading card can show the odd "12 months ago" for about 5 days a year per book. This is cosmetic and is not a wrong date order.
Evidence: frontend/src/lib/format.ts:39-41: `if (diffDay < 30) weeks; if (diffDay < 365) return text(-Math.floor(diffDay / 30), "month"); return years`. For diffDay=360, Math.floor(360/30)=12, so the result is month -12. frontend/src/lib/__tests__/format.test.ts:58-62 covers no boundary values.
Note: formatRelativeAge picks a unit by fixed day thresholds: 30-day months below 365 days, then 365-day years. A book added 360 to 364 days ago therefore reads "12 months ago" / "12か月前" instead of "1 year ago". 28 to 29 days reads "4 weeks ago". The tests do not cover any boundary (they check 3, 14, 240 and 730 days only).

### unspecified_behavior

Note: Global PageHeader wraps its trail and title rows below the sm breakpoint on every page, not only the Reading and Video apps.; The Video app's See all link gains a trailing ChevronRight icon (shared ShelfBlock). No invariant or revision names this for Video.; A ReadingCard without a thumbnail now prints the title inside the cover instead of a file-type icon. I29 does not cover this.; The Tag menu's empty value text changes from 'Tag' to 'None specified'.
- claude-read: Global PageHeader wraps its trail and title rows below the sm breakpoint on every page, not only the Reading and Video apps.
- claude-read: The Video app's See all link gains a trailing ChevronRight icon (shared ShelfBlock). No invariant or revision names this for Video.
- claude-read: A ReadingCard without a thumbnail now prints the title inside the cover instead of a file-type icon. I29 does not cover this.
- claude-read: The Tag menu's empty value text changes from 'Tag' to 'None specified'.
- claude-verify: PageHeader's trail row now wraps below sm (flex-wrap sm:flex-nowrap), so breadcrumb and actions may stack on narrow pages for every app-wide caller.
- claude-verify: formatRelativeAge shows '12 months ago' for 360-364 days.

### unspecified_behavior

Note: PageHeader's trail row now wraps below sm (flex-wrap sm:flex-nowrap), so breadcrumb and actions may stack on narrow pages for every app-wide caller.; formatRelativeAge shows '12 months ago' for 360-364 days.
- claude-read: Global PageHeader wraps its trail and title rows below the sm breakpoint on every page, not only the Reading and Video apps.
- claude-read: The Video app's See all link gains a trailing ChevronRight icon (shared ShelfBlock). No invariant or revision names this for Video.
- claude-read: A ReadingCard without a thumbnail now prints the title inside the cover instead of a file-type icon. I29 does not cover this.
- claude-read: The Tag menu's empty value text changes from 'Tag' to 'None specified'.
- claude-verify: PageHeader's trail row now wraps below sm (flex-wrap sm:flex-nowrap), so breadcrumb and actions may stack on narrow pages for every app-wide caller.
- claude-verify: formatRelativeAge shows '12 months ago' for 360-364 days.

## Findings

A: 0
B: 6
C: 1

### claude-read:TP-1 — bucket B, MEDIUM, open

Claim: The diff edits the app-wide `frontend/src/components/PageHeader.tsx`, which is not in the touch-point list; the list names only the apps' own header (`AppHeader` in appshell) as a shared piece.
Impact: PageHeader draws the header of 15+ non-Reading pages (FolderBrowser, DriveHome, TrashView, MissingView, InboxPresenter, CollectionDetail, ImageQueryViewPresenter, HomeHeader, settings, admin pages). Below the `sm` breakpoint, the trail row and the title row now wrap (`flex-wrap ... sm:flex-nowrap`), and the action groups get `max-w-full`. On a narrow page whose actions do not fit, the actions now move to a second line instead of squeezing the breadcrumb. That changes the layout of every drive page on a phone, and no invariant or touch point covers it.
Evidence: frontend/src/components/PageHeader.tsx:71, :80, :101, :106, :115, :129 (wrap classes added). Grep for `<PageHeader` finds 15 production callers outside the Reading and Video apps. The new e2e-components/page-header-actions.spec.ts checks only three synthetic arrangements at 320/390/1280 px. It checks no real caller, and it does not check that a breadcrumb such as the one in folder listings still fits on one row.
Repro: not_reproduced. Reading the code: at 320 px, PageHeader with a breadcrumb plus two whitespace-nowrap action buttons wider than the leftover width now puts the action div on a new line, because the row is flex-wrap and the breadcrumb nav is `flex-1 min-w-0`. Before this change the actions stayed on the row.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add PageHeader to the touch points and give a reason. Alternatively, limit the wrap to the Reading and Video header (AppHeader) and leave the global component as it was.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff edits the shared `frontend/src/lib/cardGrid.ts`, which is not in the touch-point list. It changes the signatures of `columnsFor`, `cardGridTemplate` and `useCardColumns`, and adds `BOOK_GRID`. The touch points only have ShelfBlock laid out *on* lib/cardGrid.ts.
Impact: Every Home and Drive grid (FileGrid, SectionRow, FolderContent, RightPaneFolder, MissingFileGrid, TrashFileGrid) goes through the edited functions. The behavior is the same with the default metrics, but the module that decides card columns everywhere was changed outside the planned scope.
Evidence: frontend/src/lib/cardGrid.ts:24-46 (new constants and HOME_GRID), :57 (columnsFor metrics), :67 (cardGridTemplate metrics; the fallback template is now built inline instead of using `cardGridColumns`), :75-97 (useCardColumns metrics, callback deps [minWidthPx, gapPx]). Callers found by Grep: SectionRow.tsx:21, FileGrid.tsx:56, FolderContent.tsx:112, RightPaneFolder.tsx:30, MissingFileGrid.tsx:45, TrashFileGrid.tsx:50.
Repro: not_reproduced. With no metrics, columnsFor and cardGridTemplate reduce to the previous formulas (HOME_GRID spread). card-grid.test.ts:156-157 pins the Home column counts at 1213 and 1480 px.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, LOW, open

Claim: The diff changes the population guard in `frontend/src/__tests__/card-grid.test.ts`. That guard keeps every grid in the app on lib/cardGrid: it widens the `useCardColumns(` regex and adds a per-file gap allowlist for ShelfBlock.tsx and ReadingGrid.tsx. It is an app-wide test guard, which the touch-point list does not name.
Impact: ShelfBlock.tsx is on the allowlist as a whole file. A 20px gap there now passes for any grid in that file, including the Video (non-book) branch. If ShelfBlock someday drew `gap-5` for Video while counting columns with the Home gap, the guard would not catch the mismatch.
Evidence: frontend/src/__tests__/card-grid.test.ts:57 and :120 (regex widened from `useCardColumns\(\)` to `useCardColumns\(`), :209-225 (bookGapSites allowlist keyed by file path, not by the metrics passed).
Repro: Mutation, in my head: ShelfBlock.tsx:60 `book ? "gap-5" : "gap-3"` → `"gap-5"` for both. The `uses the column gap the helper counts with` test still passes, because the file is on the allowlist. Only the Video layout fixture parity ("grid gap-3" is no longer asserted for Video ul at reading-video-faces.html, since only reading shelves changed) might catch it. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-4 — bucket B, LOW, open

Claim: The diff edits the app-wide `frontend/src/components/ToolbarMenu.tsx` by adding a `filled` variant. ToolbarMenu is not in the touch-point list.
Impact: ToolbarMenu draws toolbar menus across the app. The new prop is optional and defaults to false, so existing callers render as before. Still, a shared component's markup changed outside the planned scope.
Evidence: frontend/src/components/ToolbarMenu.tsx:139-140 (prop), :201-229 (filled branch drops the Icon and adds ChevronDown). The only `filled` callers are TargetMenu.tsx:154 and readingapp/LibraryControls.tsx.
Repro: not_reproduced. Reading the code: with filled=false, the className and children are byte-identical to the previous ones.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-5 — bucket B, INFO, open

Claim: The diff adds `formatRelativeAge` to the shared `frontend/src/lib/format.ts`, which is not in the touch-point list.
Impact: It is additive and only ReadingCard uses it, so the impact is small. One rounding edge: an age of 360–364 days shows as "12 months ago", not "1 year ago".
Evidence: frontend/src/lib/format.ts:21-42; ReadingCard.tsx:71 uses it; format.test.ts covers 3, 14, 240 and 730 days only.
Repro: not_reproduced. diffDay=362 → floor(362/30)=12 → "12 months ago".
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-6 — bucket B, INFO, open

Claim: The diff adds a spec and arrangements under `frontend/e2e-components/` (page-header-actions.spec.ts, fixtures/app.tsx, the spec-viewport.spec.ts list) and the matching componentFixtureParity.test.tsx entries. The touch-point list names only a new spec under `frontend/e2e-layout/`.
Impact: This is a test-suite location the plan did not declare. It exists only because of the unplanned PageHeader edit (TP-1).
Evidence: frontend/e2e-components/page-header-actions.spec.ts (new), frontend/e2e-components/fixtures/app.tsx:1956-2031, frontend/e2e-components/spec-viewport.spec.ts:48, frontend/src/components/__tests__/componentFixtureParity.test.tsx:226-228. docs/process/risk-and-human-review.md does not list e2e-components as protected (Grep found no match).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-verify:V-1 — bucket C, LOW, open

Claim: formatRelativeAge picks a unit by fixed day thresholds: 30-day months below 365 days, then 365-day years. A book added 360 to 364 days ago therefore reads "12 months ago" / "12か月前" instead of "1 year ago". 28 to 29 days reads "4 weeks ago". The tests do not cover any boundary (they check 3, 14, 240 and 730 days only).
Impact: In normal use the relative-age line on a Reading card can show the odd "12 months ago" for about 5 days a year per book. This is cosmetic and is not a wrong date order.
Evidence: frontend/src/lib/format.ts:39-41: `if (diffDay < 30) weeks; if (diffDay < 365) return text(-Math.floor(diffDay / 30), "month"); return years`. For diffDay=360, Math.floor(360/30)=12, so the result is month -12. frontend/src/lib/__tests__/format.test.ts:58-62 covers no boundary values.
Repro: Work through format.ts:40 by hand with diffDay 360: floor(360/30)=12, which gives Intl.RelativeTimeFormat('en').format(-12,'month') = "12 months ago".
Introduced: introduced
Reviewer bucket: C | Author bucket: 

## Not verified

- claude-read: I did not run any test, e2e spec or build. All claims come from reading the code.
- claude-read: I did not check how each of the 15 PageHeader callers actually renders at 320–639 px after the wrap change.
- claude-read: I did not read docs/specs/reading-app.md or frontend-conventions.md in full to see whether PageHeader, ToolbarMenu or cardGrid edits are pre-authorised there.
- claude-read: I did not check whether the e2e-components Playwright config picks up the new spec automatically.
- claude-verify: I could not see the git diff itself. 'Edited by this change' rests on r1/classification.json zones_touched and the current file contents, not on a base-vs-head comparison.
- claude-verify: I did not run any test or the e2e/layout specs.
- claude-verify: I did not render real PageHeader callers (folder breadcrumb) at narrow widths.

TOTAL: 7 findings
