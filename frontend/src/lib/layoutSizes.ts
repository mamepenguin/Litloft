/** Narrower than this and a 16:9 video stops being watchable. */
export const PLAYER_MIN_REM = 34.5;

/** The narrowest column where Japanese does not wrap at 12–14 characters a line. */
export const COLUMN_REM = 24;

export const SECTION_GAP_REM = 1.5;

/**
 * Part of the sum because the player is inside it: without this the
 * padding comes out of the player.
 */
export const CANVAS_PADDING_REM = 2;

/**
 * Must stay in step with the `[data-media-width="wide"]` rules in
 * `globals.css`.
 */
export const RAIL_MIN_REM = PLAYER_MIN_REM + COLUMN_REM + SECTION_GAP_REM;

export const INSPECTOR_BESIDE_MIN_REM =
  PLAYER_MIN_REM + CANVAS_PADDING_REM + COLUMN_REM;

/**
 * The canvas's scrollbar is deliberately not a term here: whether there is
 * one depends on the canvas width this decides, and on overlay scrollbars
 * it is 0.
 */
