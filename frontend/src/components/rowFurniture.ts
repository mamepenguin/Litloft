/**
 * The trailing group on a list row — the star and the `⋮` that repeat once
 * per row — and the spacing around it (`DESIGN.md` §Row Actions).
 *
 * One recipe rather than a class list per row component, because the file
 * rows and the folder rows are drawn into the *same column* on the same
 * screen: `FolderContent` renders `FolderListRow`s above `FileListRow`s at
 * one width, so a trailing edge that moves in one and not the other leaves
 * two `⋮` columns that do not line up.
 *
 * The controls are grown rather than overhung, for the reason
 * `.file-action-row-touch` gives in `globals.css`: the recipe's `::before`
 * overhang keeps an icon at its rendered size and is safe down a column
 * that has already reached the 44px floor, where the row pitch is what
 * separates neighbours, but these two sit edge to edge on one line, so
 * overhangs would overlap and the later sibling would win the hit test for
 * its neighbour's edge.
 *
 * **Utilities are named below as the rule they emit** — `.pointer-coarse\:-ml-3`
 * rather than the class as a class list spells it. Tailwind scans this file's
 * comments as well as its code, so a class written whole in a docstring is a
 * source for it, and `e2e-layout/build-fixture-css.ts` then has a needle for
 * that rule which cannot go missing however the exports below change.
 * `src/__tests__/coarseNeedleSources.test.ts` holds it: the three needles that
 * are meant to be able to fail are spelled once each in this file, on their
 * own export line and nowhere else.
 */

/**
 * The 44px touch floor, on the control's own box.
 *
 * On **every** control in the group, not the largest one: a floor that
 * only some of a row's controls reach is the outcome that buys nothing
 * (§Row Actions). The fine-pointer box is each control's own and is not
 * set here — they differ, and unit I of the follow-up round owns that.
 */
export const ROW_ACTION_FLOOR = "pointer-coarse:h-11 pointer-coarse:w-11";

/**
 * The group the trailing controls sit in.
 *
 * **No gap, on a coarse pointer only.** A 44px target already carries 14px
 * of empty box on each side of a 16px glyph, so a gap between two of them
 * draws the same separation twice and takes it out of the name. That
 * reason is the floor's, and the floor is a coarse-pointer rule: where the
 * boxes stay at their own size — a 28px star, a 24px `⋮` — there is no
 * padding inside them standing in for the gap, and removing it would move
 * the glyphs 12px closer on a screen the report was not about.
 *
 * So the group carries the row's own `gap-3` and cancels it exactly where
 * the boxes grow, and `.pointer-coarse\:-ml-3` cancels the row's gap in
 * front of the group for the same reason — the leading control's 14px
 * stands in for it. Both are written as the row's gap rather than as a
 * distance, so a row that changes its gap does not silently leave a sliver
 * behind.
 */
export const ROW_FURNITURE_GROUP =
  "flex flex-shrink-0 items-center gap-3 pointer-coarse:gap-0 pointer-coarse:-ml-3";

/**
 * What the row itself adds: on a coarse pointer its trailing padding goes,
 * because the last control's own 14px is already standing there.
 *
 * Only the trailing edge. The leading padding is in front of the
 * thumbnail, which has no padding of its own to stand in for it.
 *
 * Applied by the row only where the row draws a control, since a row with
 * an empty trailing edge has nothing standing there. No caller reaches
 * that branch today — every `FileList` call site passes the context menu,
 * and the ones that also select pass the star — so it is a guard on the
 * prop surface rather than a state on any screen.
 */
export const ROW_FURNITURE_PADDING = "pointer-coarse:pr-0";

/**
 * The `⋮` overflow trigger, whole.
 *
 * `opacity-0` rather than `hidden` so it keeps its place and its tab stop,
 * and `pointer-coarse:opacity-100` because `group-hover` compiles inside
 * `@media (hover: hover)` and a touch device gets no reveal at all
 * (§Row Actions).
 */
export const ROW_OVERFLOW_BUTTON =
  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-text-muted opacity-0 transition-opacity hover:bg-bg-elevated hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 " +
  ROW_ACTION_FLOOR;
