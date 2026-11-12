# Addon code review: Scenes rows follow the scroller height

- Repository: `addons/intelligence`
- Reviewed: `git diff 84028c0 9f1b430` (commit `9f1b430`)
- Standard: SPEC-ADDON-104 (`docs/specs/scene-rows-fill-height.md`) with I1 as revised in `invariants.md`
- Threat model: personal home-LAN tool, owner is the only user. A = silently wrong in ordinary use, B = odd input / misuse.

## Findings

### F1. With a classic scrollbar, a transient overflow at a column-boundary width leaves the panel stuck at c-1 columns, overflowing, with the scrollbar showing (I5, I2, spec §10)

**Claim.** R is computed "at the full width", but the columns that are actually drawn are not. `columns` comes from `useRulerWidth`, which measures the ruler beside whatever scrollbar is showing (`ScenesSectionContainer.tsx:545-546`, `hooks/useRulerWidth.ts`). `useSceneRows` scales the tile to full width for its own arithmetic only (`hooks/useSceneRows.ts:106-125, 148`) and returns rows alone. If a shrink makes the current R overflow for a moment, the scrollbar appears, `useRulerWidth`'s observer reports the narrower ruler, and at a width where `sceneColumns(full) = c` but `sceneColumns(full - scrollbar) = c - 1`, the grid redraws with c - 1 wider, taller tiles. The hook then settles on the R that fits **at c columns without a scrollbar**. Drawn at c - 1 columns, those R rows overflow, so the scrollbar stays, so the ruler stays narrow, so c - 1 stays. Nothing in the loop re-evaluates columns at full width. The spec's no-feedback argument ("an R above 3 fits without a scrollbar, so none appears") assumes the drawn c is the full-width c whenever R > 3. The code does not do that.

**Evidence (reproduced).** I ran a temporary Playwright probe on the real fixture (`openHost(PANEL_1600)` + `classicScrollbars`, Chromium without `--hide-scrollbars`, desktop 1024 wide, DPR 1; the file has since been deleted). It resized to 1600 and then shrank to h, and repeated that for each h:
- h = 1590: from 1600 → `6 rows × 8 cols, no scrollbar, slack 7.3` (correct). Shrinking 1591 → 1590 instead gives `6 × 7, scrollbar 14px`, and the scroller overflows. The same size reaches two different states depending on history.
- h = 1520…1485: `5 × 7, scrollbar, slack -10 … -45`. At 8 columns, 5 rows fit there (1527 gives `5 × 8, slack 40`).
- h = 1415…1387: `4 × 7, scrollbar, slack -10 … -38`. At 8 columns, 4 rows fit (1422 gives `4 × 8, slack 31`).
- At h = 1415 and h = 1500, the stuck state survived a re-render (hovering the ruler) and a 1px grow. Only some later resizes happen to clear it.

That is a share of all heights between 1000 and 1600 at this width. The R-5 record (decisions.md item 9) already shows that 1024 is such a boundary width: 8 columns without the scrollbar, 7 with it.

**Conditions.** Classic scrollbars (Windows/Linux, or macOS with a mouse attached or "always show scrollbars"). A panel or tab width within one scrollbar width of a column boundary (about 12% of widths at 14px; 1024×* on the canonical page is one). Any shrink of the scroller from a state with R > 3 to a height where the current R briefly overflows: dragging the window shorter, turning a second panel on in the stacked workbench, or the stale note or an action error appearing.

**Frequency** 3 for a classic-scrollbar setup, 0 with overlay scrollbars. **Impact** 3: one column fewer, the body scrolls by a few tens of px, and the scrollbar stays. The layout is wrong but still usable, and I5 (equals I1's value with classic scrollbars) and I2 (does not scroll when R > 3) fail. **Bucket** A.

**Proposed fix.** Draw the columns at the same full width the rows are computed at whenever R > 3. For example, have `useSceneRows` return `{ rows, fullColumns }` and use `columns = rows > 3 ? fullColumns : sceneColumns(rulerWidth)`, or compute `columns` from `rulerWidth + scrollbarWidth` when the measured R exceeds 3. Add the probe as an e2e case: shrink from 1600 to h for a sweep of h at 1024 wide with a classic scrollbar, and assert `rows > 3 ⇒ scrollbar = 0 and slack ≥ 0`. The existing `scenes-section-rows-scrollbar-desktop.spec.ts` only resizes to 900 and 1600, where R = 3 or the state happens to be correct.

### F2. The full-width scale multiplies the whole tile, including its fixed-height label, so the full-width row step is off when the full width changes the column count

**Claim.** `step = tileRect.height * scale + rowGap` and `fullWidthSlack = slack - drawnRows * (tileRect.height * scale - tileRect.height)` (`hooks/useSceneRows.ts:125, 148`) scale the time label (`gap-1` + a 16px `text-xs` line, about 20px) with the picture width, but only the picture scales. When the full width adds a column (the F1 boundary), `scale ≈ 0.88`. The step is then underestimated by about 2.4px and the slack overestimated by about 2.4px per drawn row, so a measurement taken while the scrollbar is showing can return one row more than fits at full width. With the same column count, `scale > 1` gives the safe direction (one row too few, which the next scrollbar-free measurement corrects).

**Conditions.** As F1, at a column-boundary width, when the leftover at the true R is within about `2.4 × R` px of a full step. F1 dominates in practice: F1's fix removes the scrollbar-present measurement path for R > 3, and with it most of this one.

**Frequency** 1. **Impact** 3. **Bucket** A.

**Proposed fix.** Scale only the picture: read the picture span (`tile.firstElementChild`) and compute `tileHeightFull = tileRect.height - pictureHeight + pictureHeight * scale`. Or compute it from `fullTileWidth / aspectRatio + (tileRect.height - pictureHeight)`.

### F3. The row step comes from `tile height + computed row-gap`, not the drawn row pitch, so a knife-edge height can make R alternate inside one layout effect

**Claim.** `rowGap` is read from `getComputedStyle(grid).rowGap` (exact "12px"), and the tile height from `getBoundingClientRect`. Under browser zoom other than 100%, Chrome lays out in zoomed LayoutUnits, so the real row pitch differs from `tileHeight + 12` by a few thousandths of a px. The I6 argument (`sceneRows(R, slack - k*step, step) = R`, `__tests__/ScenesSectionRows.test.ts:26-37`) needs the drawn rows to move the last part by exactly `step`. If the slack at R falls in `[k·step, k·pitch)`, then measuring at R gives R + k, and measuring at R + k gives R. Each `setRows` in the layout effect forces a synchronous re-render followed by another measurement, so this loops until React throws "Maximum update depth exceeded", which takes the section (or the page, depending on the error boundary) down.

**Conditions.** Browser zoom ≠ 100% and a scroller height in a band about 0.003·k px wide. A continuous window drag passes through many heights. Not reproduced.

**Frequency** 0–1. **Impact** 5 if it happens (the section errors out). **Bucket** B.

**Proposed fix.** Measure the pitch from two drawn row tops (or from the grid height and row count) instead of adding the computed gap. Add a small hysteresis so the measurement cannot flip between two adjacent values: grow only when `slack ≥ step + 0.5`, shrink only when `slack < -0.5`. A cheap safety net is to stop changing R more than once per frame from the layout-effect path.

### F4. Only the last part, the header, the ruler slider, the grid, the first tile, the root and the scroller are observed. A non-last part that changes height without a React render is missed

**Claim.** Spec §1.8 asks for re-measuring when the placeholder, card, stale note or action row change size. The code observes only `lastPart` (`hooks/useSceneRows.ts:38-49`). In the workbench the root is stretched (`globals.css:1062-1065`), so it does not report either. A height change in a part above the last part only moves the last part, and ResizeObserver does not report moves. Example: the stale note rewrapping when a web font finishes loading while the action row is the last part. The ruler's label row (`h-3.5`) is not observed either, but it only changes with a render.

**Conditions.** A size change without any render, while playback is paused. Every render re-measures, and playback renders at 4 Hz, so this mostly self-heals. The error is at most one row until the next render.

**Frequency** 1. **Impact** 2. **Bucket** B.

**Proposed fix.** Observe every drawn part (placeholder, card, stale note, action row) as the spec lists, or observe the `#panel` body wrapper (`ScenesSectionPresenter.tsx:249`), which is content-sized.

## Checked, no finding

- Scroller choice (`findScroller`): it stops before `html`/`body`, takes the nearest `overflow-y: auto|scroll`, finds `.media-detail-workbench-body`, the inspector tab panel (`panel` form) and `mobile-inspector-content`, and skips the workbench panel (`overflow: hidden`).
- Measurability: a hidden panel or tab gives a zero root rect, so R keeps its value, and `active` is false there anyway. jsdom gives null.
- Slack: measured in content coordinates (`+ scrollTop`). It includes ancestor padding, border and margin and the scroller's own bottom padding, as revised I1 asks (the sheet's `calc(env(...) + 16px)` and the workbench body's `0.875rem`).
- Last-part precedence (action > stale > card > placeholder > grid) matches DOM order, and the placeholder and card are mutually exclusive. Callback-ref hand-off is safe because React detaches in the mutation phase and attaches in the layout phase. When nothing gets the ref, it falls back to the grid.
- I7: the measurement is a layout effect in the container, after the children's refs attach. The flushSync rows → expanded commit and the Visual Index / ratio renders all re-measure before paint. Resize-only changes go through ResizeObserver and land a frame later, which spec §1.8 and §9 allow.
- The four R·c readers agree: `windowStartFor`, `windowTimes`, presenter `windowRows` and Ruler `windowRows` all use `rowCount * columns`. The skeleton stays `3 * columns` (`ScenesSectionPresenter.tsx:612`).
- I4: drawn rows and the card's presence do not depend on the point. The card is clamped to `min-h-[7.6rem]`, which equals its two-plus-two clamped lines.
- No unbounded growth with fewer than R·c frames: drawn rows are stable, so R is stable.
- Observers are disconnected in cleanup. The effect has no deps array on purpose (spec §1.8: re-measure every render). Each render recreates the observer, which costs one extra measure through the initial RO notification. That is acceptable at 4 Hz playback renders and pointer-move browse renders (not a finding).
- Keyboard, seek, browse lifetime, `.loft` failure handling and Visual Index state logic are untouched by the diff. All 218 Scenes unit tests pass at 9f1b430 (`NO_COLOR=1 pnpm exec vitest run src/addons/intelligence/ScenesSection`).

## Not verified

- F3 was not reproduced (it needs browser zoom and a sub-pixel band).
- At 1024×1583, after shrinking from 1600, the probe read `5 rows, slack 96.2 against step 95.8`. That looks like room for a sixth row, and a re-render did not change it. I suspect the e2e helper rather than the hook. `readRows` takes the action row as `button.parentElement`, the inner centred button group, not the `min-h-9` row the hook uses, so it can overstate the slack by the centring offset. If so, `expectRowsFillHeight` is slightly lenient. Not confirmed.
- I did not test real pictures or ratios arriving over the network, iOS Safari, the phone-sheet drag on a touch device, or the stacked inspector form (`data-inspector-fit="stacked"`, where `main` is content-sized up to 60%). I did not check whether any host can switch a mounted section from a bounded to a content-sized scroller (R would then keep its larger value rather than return to 3).
- I read the design artboards' content only through spec D1–D7 and decisions.md, not the HTML files.

TOTAL: 4 findings
