import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { installPointerEvent } from "@/test/pointerEvent";

import { useAutoHidingChrome } from "../useAutoHidingChrome";

installPointerEvent();

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
    // restored it here would cancel itself.
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

  it("comes back for a moving mouse on any device, never for a moving finger", () => {
    // A trackpad on a tablet whose primary pointer is a finger is still a
    // mouse, and has no other way to bring the bar back.
    const move = (pointerType: string) =>
      act(() => {
        document.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, pointerType }),
        );
      });
    for (const mode of ["fine", "coarse"] as const) {
      stubPointer(mode);
      const { result, unmount } = renderHook(() => useAutoHidingChrome());
      idle(2000);
      move("touch");
      expect(result.current.visible).toBe(false);
      move("mouse");
      expect(result.current.visible).toBe(true);
      idle(2000);
      // A hovering pen is a pointer the reader is moving, as a mouse is.
      move("pen");
      expect(result.current.visible).toBe(true);
      unmount();
    }
  });

  it("restarts the clock when a finger lands on the chrome itself", () => {
    // On a coarse pointer the document hears nothing a reader does.
    // `chromeProps.onPointerDown` is bound on the bar, where no toggle
    // handler competes with it.
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
