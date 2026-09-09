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
 * overhang keeps an icon at its rendered size and is safe where the row
 * pitch is what separates neighbours, but these two sit edge to edge on
 * one line, so overhangs would overlap and the later sibling would win the
 * hit test for its neighbour's edge.
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
 * **No gap.** A 44px target already carries 14px of empty box on each side
 * of a 16px glyph, so a gap between two of them draws the same separation
 * twice and takes it out of the name.
 *
 * `pointer-coarse:-ml-3` cancels the row's own `gap-3` in front of the
 * group for the same reason — the leading control's 14px stands in for it.
 * It is written as the row's gap negated rather than as a distance, so a
 * row that changes its gap does not silently leave a sliver behind.
 */
export const ROW_FURNITURE_GROUP =
  "flex flex-shrink-0 items-center pointer-coarse:-ml-3";

/**
 * What the row itself adds: on a coarse pointer its trailing padding goes,
 * because the last control's own 14px is already standing there.
 *
 * Only the trailing edge. The leading padding is in front of the
 * thumbnail, which has no padding of its own to stand in for it.
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
