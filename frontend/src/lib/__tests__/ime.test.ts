import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { COMPOSITION_GRACE_MS, useImeKeyGuard } from "@/lib/ime";

const T0 = 1_000_000;

function key(k: string, { isComposing = false, keyCode }: { isComposing?: boolean; keyCode?: number } = {}) {
  const e = new KeyboardEvent("keydown", { key: k, isComposing });
  // jsdom does not take `keyCode` from the init dictionary.
  if (keyCode !== undefined) Object.defineProperty(e, "keyCode", { value: keyCode });
  return e;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useImeKeyGuard", () => {
  function endComposition() {
    const now = vi.spyOn(Date, "now").mockReturnValue(T0);
    const { result } = renderHook(() => useImeKeyGuard());
    result.current.onCompositionEnd();
    now.mockReturnValue(T0 + COMPOSITION_GRACE_MS - 1);
    return result.current;
  }

  it("lets other keys through inside the grace window without spending the swallow", () => {
    const guard = endComposition();
    for (const k of ["Tab", "Backspace", "ArrowDown", "a"]) {
      expect(guard.isImeKeystroke(key(k))).toBe(false);
    }
    expect(guard.isImeKeystroke(key("Enter"))).toBe(true);
    expect(guard.isImeKeystroke(key("Enter"))).toBe(false);
  });

  it("swallows one Escape inside the grace window", () => {
    const guard = endComposition();
    expect(guard.isImeKeystroke(key("Escape"))).toBe(true);
    expect(guard.isImeKeystroke(key("Escape"))).toBe(false);
  });

  it("claims every key the IME still owns", () => {
    const { result } = renderHook(() => useImeKeyGuard());
    expect(result.current.isImeKeystroke(key("ArrowDown", { isComposing: true }))).toBe(true);
    expect(result.current.isImeKeystroke(key("Enter", { keyCode: 229 }))).toBe(true);
  });
});
