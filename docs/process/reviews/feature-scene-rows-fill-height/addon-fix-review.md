# Addon fix review: F1 and F2 of the Scenes rows review

- Addon: `git -C addons/intelligence diff 9f1b430 7b0f4db` (HEAD of the submodule is `7b0f4db`)
- Core: `git diff c00abab55 b1e269b5a` (HEAD is `b1e269b5a`)
- Standard: SPEC-ADDON-104 with I1 as revised in `invariants.md`; SPEC-ADDON-093 I1 for columns
- Threat model: personal home-LAN tool, one user. A = silently wrong in ordinary use, B = odd input / misuse.

## Verdict on the brief

- **F1 (stuck at c-1 columns with R > 3): fixed.** A temporary probe (deleted) on the real fixture, 1024 wide, classic 14px scrollbar, resized to 1600 and then jumped straight to h for every h from 1595 down to 900 in 5px steps. Every state with R > 3 had `columns = fullWidthColumns = 8`, `scrollbar = 0`, `0 <= slack < step`, `scrollHeight = clientHeight` (for example 1490 → `4x8, slack 95.0, step 95.8`; 1395 → `4x8, slack 0.0`). The heights the old review saw stuck (1520…1485 at `5x7`, 1415…1387 at `4x7`) now read `5x8` and `4x8`. No page error and no "Maximum update depth" message in the console over the run.
- **F2 (label scaled with the picture): fixed.** `scaledTileHeight(tile, picture, scale) = tile - picture + picture*scale` scales only `tile.firstElementChild`, the aspect-ratio span (`hooks/useSceneRows.ts:146-154`, `scenesModel.ts:134-140`); the `gap-1` and the time label sit in `tile - picture` and stay fixed. Both `step` and `fullWidthSlack` use it (`useSceneRows.ts:162, 185`). In the sweep no state predicted from a scrollbar-present measurement over-shot (no R > 3 state with slack < 0).
- **Beyond-brief item 1 (R = 3 without a scrollbar draws `fullWidthColumns`).** Sound. With no scrollbar `fullWidthColumns = sceneColumns(gridRect.width)`, and the grid and the ruler are both `w-full` in the same flex column (`ScenesSectionPresenter.tsx:249, 271-277, 489`), so the settled value equals `sceneColumns(rulerWidth)`; the difference is only that it is read in the same layout pass as R instead of from a separate observer a frame later. I found no 2-cycle: `fullWidthColumns` does not depend on the drawn column count or the scrollbar's presence, R > 3 never uses `scrollbarColumns`, and the R = 3 branch has two stable fixed points (c without a scrollbar, c-1 with one) rather than a loop. The functional `setResult` returns `current` when all four fields match, so a stable measurement does not re-render. In hosts without a scroller (the inline `#scenes-host` arrangements) `measureRows` returns null, `fullWidthColumns` stays 0 and the old `sceneColumns(rulerWidth)` path is used unchanged (probe: collapse at 900, narrow the host to 384, expand with a slowed clip-timestamps answer: the skeleton drew `3@384` in all 72 loading frames).
- **Beyond-brief item 2 (`readRows` takes the `min-h-9` row).** Correct and not looser. Walking up from `button.parentElement` (the inner `flex items-center gap-2` group) until the parent contains the grid stops at the `flex min-h-9 …` row (`ScenesSectionPresenter.tsx:375-379`), whose parent is the `#panel` column holding the grid: the same element the hook gets through `lastPartRef`. The row's bottom is at or below the centred group's bottom and the last part is still chosen by largest bottom, so the measured slack can only go down by the centring offset. That makes the overflow checks (`slack > -0.5` in `expectRowsFillHeight`, `slack >= 0` in the new sweep) stricter. The "another row fits" check (`slack < step + 0.5`) is now judged against the hook's own definition rather than an overstated slack, which removes a false-failure source rather than a true one. `below` is still summed from the last part's parent upward, as the hook does, so the two definitions match.

## Findings

### F1. At R = 3 with a classic scrollbar, a column-boundary width draws c-1 columns beside a scrollbar where c columns fit with no scrollbar (the old F1 mechanism, at R = 3; kept by the fix's R = 3 branch, sanctioned by spec §10)

**Claim.** `columns = scrollbarColumns` whenever `rowCount <= 3 && hasScrollbar` (`ScenesSectionContainer.tsx:566-571`). The scrollbar's presence is itself caused by the column count: once anything makes the scroller overflow for a frame at R = 3, the grid redraws at c-1 wider, taller tiles, those overflow, so the scrollbar stays, so c-1 stays. Nothing asks whether 3 rows at the full-width c would fit; the hook already knows (`fullWidthSlack >= 0` at `useSceneRows.ts:185`) but does not return it.

**Evidence (reproduced, probe deleted).** Real fixture, `PANEL_1600` arrangement, 1024 wide, classic 14px scrollbar:
- Incremental shrink from 1330: 1314 → `3x8, sb 0, slack 14.9`. 1312 → `3x7, sb 14, slack -13.0`. At 8 columns 1312 would leave slack 12.9 (no overflow). A per-frame record across the 1314 → 1312 resize shows `8c sb=0`, then one frame `7c sb=0 gw=950` (a transient narrowing during the resize), then `7c sb=14` for every following frame.
- Fresh loads at 1312, 1305, 1300 and 1298 all land on `3x7, sb 14` too (the first render draws `sceneColumns(0) = 3` huge columns, which overflow, so the first measurement already has a scrollbar). Shrinking from 1600 to those heights, a hover and a 1px grow all stay at `3x7`.
- Below about 1299, 3 rows at 8 columns overflow as well, so `3x7` beside the scrollbar is then the intended state.

So at this width there is a band of about 13px of heights (up to about 3 × the 8.7px tile-height difference between 7 and 8 columns, ~26px, at other widths) where the panel shows one column fewer, a scrollbar, and a few px of scroll, although the full-width layout fits.

**Not introduced by this fix.** At 9f1b430 the R = 3 columns came from `sceneColumns(rulerWidth)`, which is the same width beside the scrollbar, and spec §10 says "When `R = 3` and the scroller overflows, the drawn `c` follows the width left beside the scrollbar, as it does today". But here the overflow exists only because of that c-1, so this is a design question for the human rather than a code defect against the spec. The new sweep (`scenes-section-rows-scrollbar-desktop.spec.ts:48-76`) does not reach it: it stops at 1380, where R is still 4, and it skips the column check whenever R = 3 with a scrollbar.

**Conditions.** Classic scrollbars (Windows/Linux, macOS with a mouse or "always show"), a panel width within one scrollbar width of a column boundary (about 12% of widths), and a scroller height in the band just above where 3 rows at c stop fitting. Reached by a fresh load or any resize into the band.

**Frequency** 2 (classic scrollbars only, narrow band). **Impact** 3 (one column fewer and a scrollbar with a few px of scroll; usable). **Bucket** A. Score 6, below the fix threshold; raised because it is a design decision (spec §10 wording).

**Proposed fix (if the human wants it).** Return `fitsAtFullWidth = fullWidthSlack >= 0` from `measureRows` and use `scrollbarColumns` only when `rows <= 3 && hasScrollbar && !fitsAtFullWidth`. Drawn at c the content then fits, the scrollbar goes, and the next measurement (no scrollbar, c) agrees, so there is no new loop; when 3 rows at c do not fit, c-1 beside the scrollbar is kept as today. Extend the sweep down through the R = 3 band (to about 1290 at 1024 wide) and assert `slack_at_full >= 0 ⇒ columns = fullWidthColumns and scrollbar = 0`. Amend spec §10's sentence accordingly.

## Checked, no finding

- Stale `fullWidthColumns` when the hook is inactive: the loading skeleton uses it if > 0. For host-driven panels and tabs the re-show passes through an `expanded` render first (`nativeState` stays `ready` while hidden), which measures before paint; a probe that closed Scenes, opened Transcript beside it and reopened Scenes drew `3@462` from the first skeleton frame. File changes keep the same host width. Inline hosts have no scroller, so they never use the hook's columns.
- Same-frame correctness (I7): a change of `fullWidthColumns` from the layout-effect measurement re-renders synchronously before paint; RO-driven changes may show one frame of the previous columns, which spec §1.8/§9 allows.
- `scale` is 1 whenever there is no scrollbar, even if the drawn columns differ from `fullColumns` (only possible for one render after leaving the c-1 state). That under-estimates R for that render (taller c-1 tiles), the safe direction, and the next measurement corrects it.
- The four R·c readers still agree; `windowStartFor`, `windowTimes`, the presenter and the Ruler all take the same `columns`.
- All 222 Scenes unit tests pass (`NO_COLOR=1 pnpm exec vitest run src/addons/intelligence/ScenesSection`). All 39 Scenes e2e cases pass (`pnpm exec playwright test -c playwright-components.config.ts scenes-section`), including the new sweep.

## Not verified

- That the new sweep test fails on 9f1b430. Checking the old `ScenesSection` files out into the submodule to run it was refused by the permission system, so its RED is not shown here.
- Browser zoom other than 100% (the old F3 band), real network pictures and ratios, iOS Safari, the phone sheet on a touch device, and the stacked inspector form.
- Widths other than 1024 for the R = 3 band; the band size at other boundaries is estimated from the 8.7px tile-height difference, not measured.

TOTAL: 1 findings
