# Review: search operators PR 2, round 2 (fix `b7b79653e`)

- Worktree `/Users/libre/Sources/video_share-ops2`, HEAD `873dbc4d6` (docs-only on top of `b7b79653e`; `git diff --stat b7b79653e HEAD` touches only the review record).
- Material: `git show b7b79653e`; invariants.md; pr2-r1.md; README.md triage; CLAUDE.md; rules review-workflow, tests.

## Q1 — F2 (lint) and the scene toggle

- `cd frontend && pnpm lint`: exit 0, `0 errors, 68 warnings`. None of the warnings is on `search/page.tsx`; the one on `GlobalSearch.tsx` (line 248, `exhaustive-deps` on `browsing`) is on a line the fix does not touch.
- `pnpm exec tsc --noEmit`: exit 0.
- Probe (SearchPage harness, `#scene-search-hint` presence), identical at `716b40da9` and at `b7b79653e`:
  `q=foo` shown, `q=` shown, `q=foo tag:x` hidden, `q=type:video` hidden, `q=is:liked` hidden, `q=foo type:vid` shown (invalid kind is not an operator).
- Verdict: the fix does what it claimed; no behaviour change on the page.

## Q2 — F1 (spinner on a scoped query that turns impossible)

The `kinds.impossible` return now calls `setLoading(false)`. Every path into that return runs after the previous effect's cleanup has aborted any in-flight listing, so there is never a still-relevant request whose spinner this could hide: the only request that can be out at that moment belongs to an older query and is already aborted.

Probes (scope harness of `GlobalSearch.scope.test.tsx`, Notes scope `type: "text"`), `b7b79653e` vs `716b40da9`:

| probe | b7b79653e | 716b40da9 |
|---|---|---|
| P1 request for `foo type:vid` never resolves, then `foo type:video` | no spinner, "No matching files found" shown, 1 listing call | spinner stays (fails) |
| P2 as P1, then the aborted request resolves late with a row | no row painted, no spinner, no-results shown | spinner stays (fails) |
| P3 as P1, then back to `foo` (reply has 1 row) | during the 300 ms debounce: no-results row; then rows `["n1"]`, no spinner | during debounce: spinner; then rows |
| P4 as P1, then remove the scope (chip button) | second call `{search:"foo", type:"video"}`, rows shown, no spinner | same |
| P5 `foo` typed, debounce pending (no request), then `foo type:video` | no request, no spinner, no-results | same |

- P3 note (not a finding): leaving an impossible query shows "No matching files found" for the debounce window before the spinner. That is the same thing that already happens when typing on from any query that returned zero rows (loading false, merged empty), so it is the ordinary behaviour rather than something the fix adds.
- Reopening the modal: close/reopen does not pass through the impossible return; the empty-query return still leaves `loading` as it was. That return is pre-existing (noted in r1 F1) and not rendered because `hasQuery` is false; M3 below confirms no test observes it either way.
- The new test fails on `716b40da9`'s `useFileSearch.ts` (the only difference in that file is the added line): `1 failed | 36 passed` in `GlobalSearch.scope.test.tsx`. It passes at `b7b79653e`.

## Q3 — F3 (removed parameter)

`navigateToSearchPage` is local to `GlobalSearch.tsx`; its only callers are `handleSubmit` and `handleHistorySubmit`, both passing `term` alone (grep over `frontend/src` and `addons/*/frontend`). It is not passed as a callback anywhere that could supply a second argument. `searchPageHref` keeps its `type` parameter for `scopedSeeAll`. `tsc --noEmit` clean. Truly unused.

Side check: `handleSubmit` falls back to `navigateToSearchPage` (no kind) for a scope without `seeAllHref`. The only scope registered in the tree (`addons/knowledge/frontend/NoteSearchScope.tsx`) has one, and the behaviour is identical at `716b40da9` (the removed parameter was never passed), so the fix changes nothing there. Not a finding.

## Q4 — mutations on the touched lines

Targeted set: `GlobalSearch*`, `AppShell.globalSearch`, `SearchPage`, `components/search` (190 tests), plus throwaway probe tests where noted.

| id | file | mutation | want | result | note |
|---|---|---|---|---|---|
| M0 | useFileSearch | remove the new `setLoading(false)` | kill | killed | the new test |
| M1 | useFileSearch | `setLoading(true)` on the impossible return | kill | killed | the new test |
| M2 | useFileSearch | extra unconditional `setLoading(false)` before the debounce | live | survived | only changes what paints during the debounce window with an empty list |
| M3 | useFileSearch | `setLoading(false)` also on the empty-query return | live | survived | results list not rendered without a query |
| M4 | search page | `filtered = false` | live | survived (suite), killed by probe | painting; = r1 M46 |
| M5 | search page | `filtered = true` | live | survived (suite), killed by probe | pre-existing gap; = r1 M50 |

The removed `type` parameter (F3) has no runtime mutation target; reintroducing a caller that passes it is a type error.

After every mutation the file was restored with `git checkout -- <file>`; probe tests deleted. Full frontend suite after restore: 555 files, 8064 passed / 2 todo. `git status --short` clean.

## Q5 — trajectory

The fix adds no branch, no state and no prediction. F1 adds one state reset on a return that round 1's code already introduced (the `kinds.impossible` early return) — it closes that return's gap rather than handling a new case. F2 hoists an existing expression out of JSX; F3 deletes a parameter. It only closes gaps.

## Findings

None. F1, F2 and F3 each do what the fix claimed; no invariant in invariants.md is touched by the diff (the listing params, the semantic skip and the search-page hand-off are unchanged), and nothing else a user can observe changed apart from the intended spinner/no-results swap.

TOTAL: 0 findings
