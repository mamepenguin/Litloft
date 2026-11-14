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

export const INSPECTOR_BESIDE_MIN_REM =
  PLAYER_MIN_REM + CANVAS_PADDING_REM + COLUMN_REM;

/**
 * The stacked form, where the two share the row's height instead of its
 * width. A framed player at most fills half the row, controls included. The
 * canvas's 60% cap lives in the stylesheet with the rest of the form.
 */
export const STACKED_PLAYER_SHARE = 0.5;

/**
 * The width at which two workbench panels sit side by side. Below it they
 * stack, and share the panel region's height equally.
 */
export const WORKBENCH_COLUMNS_MIN_REM = 41;

/** The panel region's floor. Below it the page scrolls instead of shrinking. */
export const WORKBENCH_MIN_REM = 18;

/** A framed player's cap while a panel is shown under it. */
export const WORKBENCH_PLAYER_SHARE = 0.5;

/** The same cap while the reader asks the panels to take the larger share. */
export const WORKBENCH_PLAYER_FOCUS_SHARE = 0.3;

/**
 * The side space the row needs beside the enlarged frame: one line holds the
 * widest panel toggle, the Enlarge panels button and a short preview action.
 */
export const WORKBENCH_ROW_BESIDE_REM = 17;

/**
 * The canvas's scrollbar is deliberately not a term here: whether there is
 * one depends on the canvas width this decides, and on overlay scrollbars
 * it is 0.
 */
