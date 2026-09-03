/**
 * Telling an IME's keystroke from the user's own.
 *
 * Measured, not guessed: `compositionend` fires first, then `keydown`
 * with the confirming key already reporting `isComposing: false` and a
 * normal `keyCode`. Checking `isComposing` alone therefore does not
 * separate "I confirmed a conversion" from "I pressed Enter", and a
 * shortcut bound to Enter or Escape fires on the keystroke that ended
 * the conversion — committing a rename the user was still typing, or
 * throwing away a dialog when they meant to cancel a candidate list.
 *
 * These live here rather than inside one component because both the
 * shortcut stack and the inline rename field have to agree about it,
 * and two numbers that must match are one definition.
 */

/**
 * How long after a composition ends an Enter or Escape is still assumed
 * to belong to the IME. The confirming key arrives in the same event
 * burst (measured at ~0 ms); someone who ended the composition another
 * way and then reached for the keyboard takes an order of magnitude
 * longer.
 */
export const COMPOSITION_GRACE_MS = 100;

/** Legacy "this key belongs to the IME" signal, still emitted by some browsers. */
export const IME_KEY_CODE = 229;
