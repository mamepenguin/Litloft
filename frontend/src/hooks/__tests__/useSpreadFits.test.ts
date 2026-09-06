import { describe, expect, it, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSpreadFits } from "../useSpreadFits";

const original = { w: window.innerWidth, h: window.innerHeight };

function setViewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", {
    value: h,
    configurable: true,
  });
}

afterEach(() => {
  setViewport(original.w, original.h);
  vi.unstubAllGlobals();
});

describe("whether two pages fit side by side", () => {
  it("answers the frame's shape, not a width in pixels", () => {
    // Two tall pages side by side make a wide one, so the frame has to
    // be at least as wide as it is tall. A pixel threshold would say the
    // wrong thing on a short window.
    setViewport(1200, 700);
    expect(renderHook(() => useSpreadFits()).result.current).toBe(true);

    setViewport(800, 900);
    expect(renderHook(() => useSpreadFits()).result.current).toBe(false);

    // The boundary itself: square counts as wide enough.
    setViewport(900, 900);
    expect(renderHook(() => useSpreadFits()).result.current).toBe(true);
  });

  it("follows the window as it is resized", () => {
    // The acceptance criterion this exists for: narrow the window and
    // the pages come apart, widen it and they pair again, without the
    // reader touching the switch.
    setViewport(1200, 700);
    const { result } = renderHook(() => useSpreadFits());
    expect(result.current).toBe(true);

    act(() => {
      setViewport(800, 900);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(false);

    act(() => {
      setViewport(1200, 700);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(true);
  });
});
