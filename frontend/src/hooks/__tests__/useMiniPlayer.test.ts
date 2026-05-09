import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { shouldShowMini, useMiniPlayer } from "../useMiniPlayer";
import type { MediaController } from "@/lib/mediaController";

describe("shouldShowMini", () => {
  const base = {
    intersecting: false,
    paused: false,
    fullscreen: false,
    osPip: false,
    desktop: true,
  };

  it("returns true when player is off-screen and playing on desktop", () => {
    expect(shouldShowMini(base)).toBe(true);
  });

  it("returns false when player is on-screen", () => {
    expect(shouldShowMini({ ...base, intersecting: true })).toBe(false);
  });

  it("returns false when paused", () => {
    expect(shouldShowMini({ ...base, paused: true })).toBe(false);
  });

  it("returns false when fullscreen", () => {
    expect(shouldShowMini({ ...base, fullscreen: true })).toBe(false);
  });

  it("returns false when in OS PiP", () => {
    expect(shouldShowMini({ ...base, osPip: true })).toBe(false);
  });

  it("returns false on mobile regardless of other state", () => {
    expect(shouldShowMini({ ...base, desktop: false })).toBe(false);
  });
});

// ---------- Hook integration ----------

interface IOInstance {
  cb: IntersectionObserverCallback;
  target?: Element;
  options?: IntersectionObserverInit;
  disconnect: () => void;
  observe: (el: Element) => void;
  unobserve: () => void;
}

let ioInstances: IOInstance[] = [];

function installIntersectionObserverMock() {
  ioInstances = [];
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    class {
      cb: IntersectionObserverCallback;
      target?: Element;
      options?: IntersectionObserverInit;
      disconnect = vi.fn();
      unobserve = vi.fn();
      constructor(
        cb: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        this.cb = cb;
        this.options = options;
        const inst: IOInstance = {
          cb,
          options,
          disconnect: this.disconnect,
          unobserve: this.unobserve,
          observe: (el: Element) => {
            inst.target = el;
            this.target = el;
          },
        };
        ioInstances.push(inst);
      }
      observe(el: Element) {
        this.target = el;
        const inst = ioInstances[ioInstances.length - 1];
        if (inst) inst.target = el;
      }
      takeRecords() {
        return [];
      }
    };
}

function fireIntersect(isIntersecting: boolean) {
  const inst = ioInstances[ioInstances.length - 1];
  if (!inst || !inst.target) return;
  act(() => {
    inst.cb(
      [
        {
          isIntersecting,
          target: inst.target!,
          intersectionRatio: isIntersecting ? 1 : 0,
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: 0,
        },
      ],
      {} as IntersectionObserver,
    );
  });
}

function installMatchMediaMock(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("768") ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeMc(paused: boolean): MediaController {
  return {
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: vi.fn().mockReturnValue(0),
    getDuration: vi.fn().mockReturnValue(100),
    isPaused: vi.fn().mockReturnValue(paused),
  };
}

describe("useMiniPlayer", () => {
  beforeEach(() => {
    installIntersectionObserverMock();
    installMatchMediaMock(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderWithRef(mc: MediaController | null) {
    return renderHook(() => {
      const containerRef = useRef<HTMLDivElement>(null);
      if (!containerRef.current) {
        (containerRef as { current: HTMLDivElement }).current =
          document.createElement("div");
      }
      return {
        hook: useMiniPlayer({ containerRef, mc }),
        containerRef,
      };
    });
  }

  it("returns isMini=false initially", () => {
    const mc = makeMc(false);
    const { result } = renderWithRef(mc);
    expect(result.current.hook.isMini).toBe(false);
  });

  it("becomes mini when intersect fires with isIntersecting=false and playing", () => {
    const mc = makeMc(false);
    const { result } = renderWithRef(mc);
    fireIntersect(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hook.isMini).toBe(true);
  });

  it("does not become mini when paused", () => {
    const mc = makeMc(true);
    const { result } = renderWithRef(mc);
    fireIntersect(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hook.isMini).toBe(false);
  });

  it("does not become mini on mobile", () => {
    installMatchMediaMock(false);
    const mc = makeMc(false);
    const { result } = renderWithRef(mc);
    fireIntersect(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hook.isMini).toBe(false);
  });

  it("exits mini when element re-enters viewport", () => {
    const mc = makeMc(false);
    const { result } = renderWithRef(mc);
    fireIntersect(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hook.isMini).toBe(true);
    fireIntersect(true);
    expect(result.current.hook.isMini).toBe(false);
  });

  it("closeAndStop calls mc.pause and clears mini", () => {
    const mc = makeMc(false);
    const { result } = renderWithRef(mc);
    fireIntersect(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hook.isMini).toBe(true);
    act(() => {
      result.current.hook.closeAndStop();
    });
    expect(mc.pause).toHaveBeenCalled();
  });

  // ---------- root option (PR-1, B1) ----------

  it("creates IntersectionObserver with viewport root when no root option is provided", () => {
    const mc = makeMc(false);
    renderWithRef(mc);
    const inst = ioInstances[ioInstances.length - 1];
    // Default = viewport (root undefined or null in init dict).
    expect(inst.options?.root ?? null).toBeNull();
  });

  it("creates IntersectionObserver with the provided root element", () => {
    const mc = makeMc(false);
    const customRoot = document.createElement("section");
    renderHook(() => {
      const containerRef = useRef<HTMLDivElement>(null);
      if (!containerRef.current) {
        (containerRef as { current: HTMLDivElement }).current =
          document.createElement("div");
      }
      return useMiniPlayer({ containerRef, mc, root: customRoot });
    });
    const inst = ioInstances[ioInstances.length - 1];
    expect(inst.options?.root).toBe(customRoot);
  });

  it("re-creates IntersectionObserver when root option changes", () => {
    const mc = makeMc(false);
    const rootA = document.createElement("section");
    const rootB = document.createElement("article");
    const { rerender } = renderHook(
      ({ root }: { root: Element | null }) => {
        const containerRef = useRef<HTMLDivElement>(null);
        if (!containerRef.current) {
          (containerRef as { current: HTMLDivElement }).current =
            document.createElement("div");
        }
        return useMiniPlayer({ containerRef, mc, root });
      },
      { initialProps: { root: rootA } },
    );
    const initialCount = ioInstances.length;
    expect(ioInstances[initialCount - 1].options?.root).toBe(rootA);

    rerender({ root: rootB });
    expect(ioInstances.length).toBeGreaterThan(initialCount);
    expect(ioInstances[ioInstances.length - 1].options?.root).toBe(rootB);
  });
});
