/**
 * `compositionend` fires first, then `keydown` with the confirming key
 * already reporting `isComposing: false` and a normal `keyCode`, so checking
 * `isComposing` alone does not separate "I confirmed a conversion" from
 * "I pressed Enter".
 */

/**
 * The confirming key arrives in the same event burst; someone who ended
 * the composition another way and then reached for the keyboard takes an
 * order of magnitude longer.
 */
export const COMPOSITION_GRACE_MS = 100;

/** Legacy "this key belongs to the IME" signal, still emitted by some browsers. */
export const IME_KEY_CODE = 229;
