/**
 * One recipe rather than a class list per row component, because the file
 * rows and the folder rows are drawn into the *same column* on the same
 * screen, so a trailing edge that moves in one and not the other leaves
 * two `⋮` columns that do not line up.
 *
 * The controls are grown rather than overhung: these two sit edge to edge on
 * one line, so overhangs would overlap and the later sibling would win the
 * hit test for its neighbour's edge.
 *
 * Tailwind scans this file's comments as well as its code, so a class written
 * whole in a comment here is a source for it and a layout needle that cannot
 * go missing.
 */

/**
 * On **every** control in the group, not the largest one: a floor that
 * only some of a row's controls reach buys nothing.
 */
export const ROW_ACTION_FLOOR = "pointer-coarse:h-11 pointer-coarse:w-11";

/**
 * No gap on a coarse pointer only: a 44px target already carries 14px of
 * empty box on each side of a 16px glyph, so a gap would draw the same
 * separation twice. The gaps are cancelled as the row's gap rather than as a
 * distance, so a row that changes its gap does not silently leave a sliver
 * behind.
 */
export const ROW_FURNITURE_GROUP =
  "flex flex-shrink-0 items-center gap-3 pointer-coarse:gap-0 pointer-coarse:-ml-3";

/**
 * Only the trailing edge. The leading padding is in front of the
 * thumbnail, which has no padding of its own to stand in for it.
 */
export const ROW_FURNITURE_PADDING = "pointer-coarse:pr-0";

/**
 * `opacity-0` rather than `hidden` so it keeps its place and its tab stop,
 * and `pointer-coarse:opacity-100` because `group-hover` compiles inside
 * `@media (hover: hover)` and a touch device gets no reveal at all.
 */
export const ROW_OVERFLOW_BUTTON =
  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-text-muted opacity-0 transition-opacity hover:bg-bg-elevated hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 " +
  ROW_ACTION_FLOOR;
