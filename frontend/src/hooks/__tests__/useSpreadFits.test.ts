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
    // Two tall pages side by side make a wide one; a pixel threshold would
    // say the wrong thing on a short window.
    setViewport(1200, 700);
    expect(renderHook(() => useSpreadFits()).result.current).toBe(true);

    setViewport(800, 900);
    expect(renderHook(() => useSpreadFits()).result.current).toBe(false);

    setViewport(900, 900);
    expect(renderHook(() => useSpreadFits()).result.current).toBe(true);
  });

  it("follows the window as it is resized", () => {
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
