import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePointerMode } from "../usePointerMode";

type Listener = () => void;

/**
 * Installs a matchMedia backed by explicit answers for both pointer
 * queries, so tests can express "neither matches" — the shape jsdom
 * and very old browsers actually produce.
 */
function installMatchMedia(initial: { coarse: boolean; fine: boolean }) {
  // One set per query, not one shared set: the hook subscribes the same
  // callback to both, and a shared Set would silently dedupe it and
  // under-report what was actually registered.
  const listeners = new Map<string, Set<Listener>>();
  let current = initial;
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const bucket = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, bucket);
    return {
      get matches() {
        return query.includes("coarse") ? current.coarse : current.fine;
      },
      media: query,
      addEventListener: (_: string, listener: Listener) => bucket.add(listener),
      removeEventListener: (_: string, listener: Listener) => bucket.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
  return {
    set(next: { coarse: boolean; fine: boolean }) {
      current = next;
      listeners.forEach((bucket) => bucket.forEach((listener) => listener()));
    },
    get listenerCount() {
      let total = 0;
      listeners.forEach((bucket) => {
        total += bucket.size;
      });
      return total;
    },
  };
}

// One test deletes matchMedia outright, which restoreAllMocks cannot
// undo — it is a property redefinition, not a spy. Left in place it
// leaks into whatever file the worker runs next.
const realMatchMedia = window.matchMedia;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: realMatchMedia,
  });
});

describe("usePointerMode", () => {
  it("starts unknown so the server and client agree on first paint", () => {
    // Reading matchMedia during render would make the markup differ
    // between the server (no matchMedia at all) and the client.
    installMatchMedia({ coarse: true, fine: false });
    let firstRenderValue: string | null = null;
    renderHook(() => {
      const mode = usePointerMode();
      firstRenderValue ??= mode;
      return mode;
    });
    expect(firstRenderValue).toBe("unknown");
  });

  it("reports a coarse pointer after mounting", () => {
    installMatchMedia({ coarse: true, fine: false });
    const { result } = renderHook(() => usePointerMode());
    expect(result.current).toBe("coarse");
  });

  it("reports a fine pointer after mounting", () => {
    installMatchMedia({ coarse: false, fine: true });
    const { result } = renderHook(() => usePointerMode());
    expect(result.current).toBe("fine");
  });

  it("stays unknown when neither query matches", () => {
    // Not a hypothetical: this is what jsdom answers by default, and
    // the gestures must stay inert rather than guess an input mode.
    installMatchMedia({ coarse: false, fine: false });
    const { result } = renderHook(() => usePointerMode());
    expect(result.current).toBe("unknown");
  });

  it("prefers coarse on a device that reports both", () => {
    installMatchMedia({ coarse: true, fine: true });
    const { result } = renderHook(() => usePointerMode());
    expect(result.current).toBe("coarse");
  });

  it("follows the device changing input mode", () => {
    const media = installMatchMedia({ coarse: true, fine: false });
    const { result } = renderHook(() => usePointerMode());
    expect(result.current).toBe("coarse");
    act(() => media.set({ coarse: false, fine: true }));
    expect(result.current).toBe("fine");
  });

  it("unsubscribes from both queries on unmount", () => {
    const media = installMatchMedia({ coarse: true, fine: false });
    const { unmount } = renderHook(() => usePointerMode());
    expect(media.listenerCount).toBe(2);
    unmount();
    expect(media.listenerCount).toBe(0);
  });

  it("survives an environment without matchMedia", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { result } = renderHook(() => usePointerMode());
    expect(result.current).toBe("unknown");
  });
});
