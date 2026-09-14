import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

import { COMPOSITION_GRACE_MS } from "@/lib/ime";

const T0 = 1_000_000;

/**
 * Chromium's order for confirming a conversion with Enter: `compositionend`,
 * then a `keydown` reporting `isComposing: false` and `keyCode: 13`.
 * `afterGrace` puts the Enter just past the window instead of inside it.
 *
 * Returns what `fireEvent.keyDown` returns: false when the default was prevented.
 */
export function confirmConversionThenEnter(
  input: HTMLElement,
  text: string,
  { afterGrace = false }: { afterGrace?: boolean } = {},
): boolean {
  const now = vi.spyOn(Date, "now").mockReturnValue(T0);
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.compositionEnd(input, { data: text });
  now.mockReturnValue(afterGrace ? T0 + COMPOSITION_GRACE_MS : T0 + COMPOSITION_GRACE_MS - 1);
  try {
    return fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  } finally {
    now.mockRestore();
  }
}
