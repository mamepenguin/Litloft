import { useCallback, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

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

export interface ImeKeyGuard {
  /** Attach to the field's `onCompositionEnd`, or to `compositionend` on a document. */
  onCompositionEnd: () => void;
  /**
   * True when the key belongs to the IME: one still composing, or the one
   * Enter or Escape that ended a composition. That Enter or Escape is
   * consumed, so the next press is the user's.
   */
  isImeKeystroke: (e: KeyboardEvent | ReactKeyboardEvent) => boolean;
}

export function useImeKeyGuard(): ImeKeyGuard {
  const compositionEndedAtRef = useRef(0);

  const onCompositionEnd = useCallback(() => {
    compositionEndedAtRef.current = Date.now();
  }, []);

  const isImeKeystroke = useCallback((e: KeyboardEvent | ReactKeyboardEvent) => {
    const native = "nativeEvent" in e ? e.nativeEvent : e;
    if (native.isComposing || native.keyCode === IME_KEY_CODE) return true;
    if (
      (e.key === "Enter" || e.key === "Escape") &&
      Date.now() - compositionEndedAtRef.current < COMPOSITION_GRACE_MS
    ) {
      compositionEndedAtRef.current = 0;
      return true;
    }
    return false;
  }, []);

  return useMemo(() => ({ onCompositionEnd, isImeKeystroke }), [onCompositionEnd, isImeKeystroke]);
}
