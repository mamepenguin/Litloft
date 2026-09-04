/**
 * The widths the file-detail layout is built out of.
 *
 * In rem, and resolved against the root font size when measured, so a
 * reader who scales text gets the layout these numbers were chosen for.
 *
 * They live here because they were being written out separately in
 * every place that needed them — `RAIL_MIN_REM = 60` had the player
 * minimum and the rail width folded into one literal, `globals.css`
 * spelled the same sum twice, and the inspector's own width existed
 * once as a constant and once as a Tailwind class. Changing the player
 * minimum took four edits and nothing failed if you made three.
 *
 * `DESIGN.md` §8.5 is the prose. The parity test in
 * `src/__tests__/inspectorThresholdParity.test.ts` keeps the two honest.
 */

/**
 * Narrower than this and a 16:9 video stops being watchable.
 *
 * The floor for every kind the shell hosts, not only for video: one
 * skeleton means one minimum, and the video is the occupant that stops
 * working first.
 */
export const PLAYER_MIN_REM = 34.5;

/**
 * The inspector, and the companion rail beside a player.
 *
 * Two different parts arriving at the same number for the same reason
 * rather than by sharing a value — it is the narrowest column where
 * Japanese does not wrap at 12–14 characters a line. `DESIGN.md` §8.5
 * keeps them as separate rows so a later change to one does not read as
 * a change to both; they are one constant here because the arithmetic
 * that consumes them is the same arithmetic.
 */
export const COLUMN_REM = 24;

/** The standard section gap, between the player and a rail beside it. */
export const SECTION_GAP_REM = 1.5;

/**
 * Padding the canvas puts around its own contents.
 *
 * Part of the sum because the player is inside it: without this the
 * threshold hands the canvas exactly the player minimum and the padding
 * comes out of the player, which is 32px it never had.
 */
export const CANVAS_PADDING_REM = 2;

/**
 * Width at which a rail may sit beside the player, inside the canvas.
 *
 * Must stay in step with the `[data-media-width="wide"]` rules in
 * `globals.css`.
 */
export const RAIL_MIN_REM = PLAYER_MIN_REM + COLUMN_REM + SECTION_GAP_REM;

/**
 * Width at which the inspector may sit beside the canvas.
 *
 * Measured on the row that holds both. A sum, not a feel: change either
 * minimum and this recomputes itself, which is the point of writing it
 * as a sum.
 */
export const INSPECTOR_BESIDE_MIN_REM =
  PLAYER_MIN_REM + CANVAS_PADDING_REM + COLUMN_REM;

/**
 * The canvas's scrollbar is **not** a term here, and adding one would be
 * a mistake worth naming.
 *
 * It is real: `<main>` is the scroller and sits inside the measured
 * row, so on a platform with classic scrollbars its 15–17px comes out
 * of the player, leaving a boundary band about that wide where the
 * player gets ~535px. Measuring it looks like the honest fix and is
 * not: `offsetWidth - clientWidth` is zero when there is no scrollbar,
 * and whether there *is* one depends on how tall the content is, which
 * depends on how wide the canvas is, which is what the placement
 * decides. That is the answer depending on the answer, which is the
 * same trap as measuring the canvas instead of the row.
 *
 * A constant would not be it either — it is 0 on macOS's overlay
 * scrollbars, so every reader there would lose 16px of canvas to a
 * gutter that is not on their screen.
 *
 * So the band stands, knowingly, at a seventeenth of the width the
 * padding term was worth.
 */
