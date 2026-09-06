import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useAutoHidingChrome } from "../useAutoHidingChrome";

function stubPointer(mode: "fine" | "coarse") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes(mode),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const idle = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const fire = (type: string) =>
  act(() => {
    document.dispatchEvent(new Event(type, { bubbles: true }));
  });

describe("chrome that withdraws when the frame is left alone", () => {
  it("withdraws at two seconds, not before", () => {
    stubPointer("fine");
    const { result } = renderHook(() => useAutoHidingChrome());
    idle(1999);
    expect(result.current.visible).toBe(true);
    idle(1);
    expect(result.current.visible).toBe(false);
  });

  it("never listens for a press, on either pointer", () => {
    // The viewer's own centre tap toggles the chrome. A press that also
    // restored it here would cancel itself: the bar appears for the
    // length of the press and is gone on release, however many times you
    // try. That was written down as a touch-only hazard and scoped out
    // of the coarse set alone; it cancels wherever both are bound.
    for (const mode of ["fine", "coarse"] as const) {
      stubPointer(mode);
      const { result, unmount } = renderHook(() => useAutoHidingChrome());
      idle(2000);
      expect(result.current.visible).toBe(false);

      fire("pointerdown");
      expect(result.current.visible).toBe(false);
      unmount();
    }
  });

  it("comes back on a mouse move, a key, or focus arriving", () => {
    stubPointer("fine");
    const { result } = renderHook(() => useAutoHidingChrome());
    for (const signal of ["pointermove", "keydown", "focusin"]) {
      idle(2000);
      expect(result.current.visible).toBe(false);
      fire(signal);
      expect(result.current.visible).toBe(true);
    }
  });

  it("reads no pointer movement on a coarse pointer", () => {
    // There is none to read, and binding it would only add a way for the
    // browser's synthesised move to fight the tap.
    stubPointer("coarse");
    const { result } = renderHook(() => useAutoHidingChrome());
    idle(2000);
    fire("pointermove");
    expect(result.current.visible).toBe(false);
    fire("keydown");
    expect(result.current.visible).toBe(true);
  });

  it("restarts the clock when a finger lands on the chrome itself", () => {
    // On a coarse pointer the document hears nothing a reader does, so a
    // bar summoned by a centre tap had a flat two seconds and withdrew
    // mid-reach. `chromeProps.onPointerDown` is bound on the bar, where
    // no toggle handler competes with it.
    stubPointer("coarse");
    const { result } = renderHook(() => useAutoHidingChrome());

    idle(1500);
    act(() => result.current.chromeProps.onPointerDown());
    idle(1500);
    expect(result.current.visible).toBe(true);

    idle(600);
    expect(result.current.visible).toBe(false);
  });

  it("puts withdrawn chrome out of reach as well as out of sight", () => {
    stubPointer("fine");
    const { result } = renderHook(() => useAutoHidingChrome());
    expect(result.current.chromeProps.inert).toBe(false);
    idle(2000);
    expect(result.current.chromeProps.inert).toBe(true);
    expect(result.current.chromeProps["aria-hidden"]).toBe(true);
    expect(result.current.chromeProps.style.pointerEvents).toBe("none");
  });

  it("holds the chrome open, and does not start the clock until the hold ends", () => {
    stubPointer("fine");
    const { result, rerender } = renderHook(
      ({ held }) => useAutoHidingChrome({ held }),
      { initialProps: { held: true } },
    );
    idle(10_000);
    expect(result.current.visible).toBe(true);

    rerender({ held: false });
    idle(2000);
    expect(result.current.visible).toBe(false);
  });
});
