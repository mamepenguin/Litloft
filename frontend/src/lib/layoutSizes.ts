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
 * A document-side tab that declares `wide` takes this share of the row while
 * it is selected beside the canvas. 40% at 1280 is 416px, about 24 characters
 * a line at 16px, so the pane keeps a floor as well.
 */
export const INSPECTOR_WIDE_SHARE = 0.4;

/** The narrowest wide pane: about 30 characters a line at 16px. */
export const INSPECTOR_WIDE_MIN_REM = 32;

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

/** The player's share of the canvas content when the panels sit beside it. */
export const WORKBENCH_SPLIT_SHARE = 0.6;

/**
 * The canvas width at which the column beside the player reaches
 * `COLUMN_REM`: the right column is `1 - WORKBENCH_SPLIT_SHARE` of the width
 * less the 1rem gap.
 */
export const WORKBENCH_SPLIT_MIN_REM =
  COLUMN_REM / (1 - WORKBENCH_SPLIT_SHARE) + 1;

/** A framed player's cap while a panel is shown under it. */
export const WORKBENCH_PLAYER_SHARE = 0.5;

/** The same cap while the reader asks the panels to take the larger share. */
export const WORKBENCH_PLAYER_FOCUS_SHARE = 0.3;

/**
 * The side space the row needs beside the enlarged frame: one line holds the
 * widest panel toggle and the Enlarge panels button at the coarse size. A
 * `file-preview-actions` entry is not part of the budget, as no addon
 * publishes one.
 */
export const WORKBENCH_ROW_BESIDE_REM = 13;

/**
 * The canvas's scrollbar is deliberately not a term here: whether there is
 * one depends on the canvas width this decides, and on overlay scrollbars
 * it is 0.
 */
