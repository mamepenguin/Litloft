import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useInspectorOpen } from "../useInspectorOpen";

const driveKey = (drive: string) => `inspector-open:${drive}`;

/** jsdom does not honor `window.innerWidth` writes through assignment in
 *  every release; redefine the property for predictable mocking. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const minMatch = query.match(/min-width:\s*(\d+)px/);
    const maxMatch = query.match(/max-width:\s*(\d+)px/);
    let matches = false;
    if (minMatch) matches = width >= Number(minMatch[1]);
    if (maxMatch) matches = width <= Number(maxMatch[1]);
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  setViewportWidth(1440);
});

afterEach(() => {
  localStorage.clear();
});

describe("useInspectorOpen", () => {
  it("defaults to open on wide viewport (>= 1120px) when no localStorage", () => {
    setViewportWidth(1440);
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(true);
  });

  it("defaults to closed on narrow viewport (< 1120px) when no localStorage", () => {
    setViewportWidth(1100);
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(false);
  });

  it("treats the 1120px boundary as open (>= threshold)", () => {
    setViewportWidth(1120);
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(true);
  });

  it("keeps 1119px closed, so the boundary is a boundary", () => {
    // The pair is the point. An assertion only on the open side passes
    // for any threshold at or below the width it names.
    setViewportWidth(1119);
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(false);
  });

  it("opens the band the media layout needed", () => {
    for (const width of [1120, 1200, 1279]) {
      setViewportWidth(width);
      const { result } = renderHook(() => useInspectorOpen("work"));
      expect({ width, open: result.current.open }).toEqual({ width, open: true });
    }
  });

  it("localStorage 'true' takes precedence on a narrow viewport", () => {
    setViewportWidth(1024);
    localStorage.setItem(driveKey("work"), "true");
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(true);
  });

  it("localStorage 'false' takes precedence on a wide viewport", () => {
    setViewportWidth(1600);
    localStorage.setItem(driveKey("work"), "false");
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(false);
  });

  it("toggle() flips the state and persists to localStorage", () => {
    setViewportWidth(1440);
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem(driveKey("work"))).toBe("false");

    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem(driveKey("work"))).toBe("true");
  });

  it("setOpen(false) closes and persists; setOpen(true) opens and persists", () => {
    setViewportWidth(1440);
    const { result } = renderHook(() => useInspectorOpen("work"));

    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem(driveKey("work"))).toBe("false");

    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem(driveKey("work"))).toBe("true");
  });

  it("different drives have independent persisted state", () => {
    setViewportWidth(1440);
    localStorage.setItem(driveKey("work"), "false");
    localStorage.setItem(driveKey("photos"), "true");
    const work = renderHook(() => useInspectorOpen("work"));
    const photos = renderHook(() => useInspectorOpen("photos"));
    expect(work.result.current.open).toBe(false);
    expect(photos.result.current.open).toBe(true);
  });

  it("re-reads localStorage when the drive prop changes", () => {
    setViewportWidth(1440);
    localStorage.setItem(driveKey("work"), "false");
    localStorage.setItem(driveKey("photos"), "true");

    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) => useInspectorOpen(drive),
      { initialProps: { drive: "work" } },
    );
    expect(result.current.open).toBe(false);

    rerender({ drive: "photos" });
    expect(result.current.open).toBe(true);
  });

  it("ignores corrupt localStorage values and falls back to viewport default", () => {
    setViewportWidth(1440);
    localStorage.setItem(driveKey("work"), "garbage");
    const { result } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(true);
  });

  it("survives unmount/remount (page boundary crossing)", () => {
    setViewportWidth(1024);
    const { result, unmount } = renderHook(() => useInspectorOpen("work"));
    expect(result.current.open).toBe(false);

    act(() => result.current.setOpen(true));
    unmount();

    const { result: result2 } = renderHook(() => useInspectorOpen("work"));
    expect(result2.current.open).toBe(true);
  });
});
