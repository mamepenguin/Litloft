import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "../useFullscreen";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";

// ---------- matchMedia harness ----------

interface FakeMediaQuery {
  matches: boolean;
  listeners: Set<(e: MediaQueryListEvent) => void>;
}

const mediaQueries = new Map<string, FakeMediaQuery>();

function installMatchMedia(initial: Record<string, boolean>) {
  mediaQueries.clear();
  for (const [query, matches] of Object.entries(initial)) {
    mediaQueries.set(query, { matches, listeners: new Set() });
  }
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const entry = mediaQueries.get(query) ?? { matches: false, listeners: new Set() };
    mediaQueries.set(query, entry);
    return {
      get matches() {
        return entry.matches;
      },
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
        entry.listeners.add(cb),
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
        entry.listeners.delete(cb),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as unknown as typeof window.matchMedia;
}

function setMedia(query: string, matches: boolean) {
  const entry = mediaQueries.get(query);
  if (!entry) throw new Error(`query not installed: ${query}`);
  entry.matches = matches;
  act(() => {
    for (const cb of entry.listeners) {
      cb({ matches } as MediaQueryListEvent);
    }
  });
}

const COARSE = "(pointer: coarse)";
const LANDSCAPE = "(orientation: landscape)";

// ---------- fullscreen harness ----------

let fullscreenElement: Element | null = null;
let frame: HTMLDivElement;
let requestFullscreen: ReturnType<typeof vi.fn> | null;
// The implementation is (re)installed in beforeEach: restoreAllMocks
// strips it, and a bare vi.fn() returns undefined, which blows up on
// the `.catch()` the hook chains onto it.
const exitFullscreen = vi.fn();

// jsdom has no scrollTo; the hook calls it whenever it unlocks the
// background, so stub it globally rather than per test.
const scrollTo = vi.fn();

function setNativeSupport(mode: "ok" | "reject" | "absent") {
  if (mode === "absent") {
    requestFullscreen = null;
    // jsdom leaves this undefined already; be explicit for clarity.
    Object.defineProperty(frame, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    return;
  }
  requestFullscreen = vi.fn().mockImplementation(() => {
    if (mode === "reject") return Promise.reject(new Error("denied"));
    fullscreenElement = frame;
    return Promise.resolve();
  });
  Object.defineProperty(frame, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
}

function renderFullscreen(autoRotateEnabled = true) {
  // Escape now leaves pseudo-fullscreen through the shortcut stack, so
  // the hook is rendered under the provider the app mounts around
  // everything. Without it the stack is a no-op and Escape does
  // nothing — which is the failure this wrapper exists to rule out.
  return renderHook(
    () => useFullscreen({ frameRef: { current: frame }, autoRotateEnabled }),
    { wrapper: ShortcutsProvider },
  );
}

beforeEach(() => {
  fullscreenElement = null;
  exitFullscreen.mockReset().mockImplementation(() => {
    fullscreenElement = null;
    return Promise.resolve();
  });
  scrollTo.mockReset();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  frame = document.createElement("div");
  document.body.appendChild(frame);
  installMatchMedia({ [COARSE]: true, [LANDSCAPE]: false });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exitFullscreen,
  });
  setNativeSupport("absent");
  window.history.replaceState(null, "");
  document.body.style.cssText = "";
  delete document.documentElement.dataset.playerFullscreen;
});

afterEach(() => {
  frame.remove();
  vi.restoreAllMocks();
});

// ---------- tests ----------

describe("useFullscreen — native vs pseudo", () => {
  it("uses the native API when the platform has one", async () => {
    setNativeSupport("ok");
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isPseudo).toBe(false);
  });

  it("falls back to pseudo when the API is missing (iPhone)", async () => {
    setNativeSupport("absent");
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(result.current.isPseudo).toBe(true);
    expect(result.current.isFullscreen).toBe(true);
  });

  it("falls back to pseudo when the API rejects", async () => {
    // Orientation change is not a user gesture, so a real
    // requestFullscreen can reject even where the API exists.
    setNativeSupport("reject");
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(result.current.isPseudo).toBe(true);
  });

  it("does not fall back to pseudo on a fine pointer", async () => {
    // A desktop without element fullscreen effectively does not exist;
    // pseudo there would only collide with the mini player.
    setMedia(COARSE, false);
    setNativeSupport("absent");
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(result.current.isPseudo).toBe(false);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("reports native fullscreen only for its own frame", async () => {
    setNativeSupport("ok");
    const { result } = renderFullscreen();
    fullscreenElement = document.createElement("div");
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(false);
  });
});

describe("useFullscreen — exiting", () => {
  it("toggles back out of pseudo", async () => {
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(result.current.isPseudo).toBe(true);
    await act(async () => result.current.toggle());
    expect(result.current.isPseudo).toBe(false);
  });

  it("exits native through the document API", async () => {
    setNativeSupport("ok");
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await act(async () => result.current.exit());
    expect(exitFullscreen).toHaveBeenCalled();
  });

  it("leaves pseudo on Escape", async () => {
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    act(() => {
      // Dispatched on `document`, which is where ShortcutsProvider
      // listens. The old code bound `window` directly; an event
      // dispatched on `window` never reaches a document listener, so
      // the target is part of what changed here.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.isPseudo).toBe(false);
  });

  it("ignores other keys", async () => {
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    });
    expect(result.current.isPseudo).toBe(true);
  });
});

describe("useFullscreen — orientation", () => {
  it("enters on rotation to landscape while playing", async () => {
    const { result } = renderFullscreen(true);
    await act(async () => {
      setMedia(LANDSCAPE, true);
    });
    expect(result.current.isPseudo).toBe(true);
  });

  it("stays put when playback is not running", async () => {
    const { result } = renderFullscreen(false);
    await act(async () => {
      setMedia(LANDSCAPE, true);
    });
    expect(result.current.isPseudo).toBe(false);
  });

  it("stays put on a fine pointer", async () => {
    setMedia(COARSE, false);
    const { result } = renderFullscreen(true);
    await act(async () => {
      setMedia(LANDSCAPE, true);
    });
    expect(result.current.isPseudo).toBe(false);
  });

  it("leaves again when rotated back to portrait", async () => {
    const { result } = renderFullscreen(true);
    await act(async () => {
      setMedia(LANDSCAPE, true);
    });
    await act(async () => {
      setMedia(LANDSCAPE, false);
    });
    expect(result.current.isPseudo).toBe(false);
  });

  it("keeps a manually opened fullscreen when rotated to portrait", async () => {
    // Rotating back must not eject someone who asked for fullscreen
    // explicitly while holding the phone upright.
    const { result } = renderFullscreen(true);
    await act(async () => result.current.toggle());
    await act(async () => {
      setMedia(LANDSCAPE, true);
    });
    await act(async () => {
      setMedia(LANDSCAPE, false);
    });
    expect(result.current.isPseudo).toBe(true);
  });
});

describe("useFullscreen — history", () => {
  it("pushes an entry so the back gesture has something to consume", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ litloftFullscreen: true });
  });

  it("leaves fullscreen on a back navigation instead of leaving the page", async () => {
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    window.history.replaceState(null, "");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(result.current.isPseudo).toBe(false);
  });

  it("ignores a popstate that lands back on our own entry", async () => {
    // Something else pushed on top of us and was popped; we are still
    // the current entry, so fullscreen should survive.
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    // history.state is still our marker because nothing actually moved.
    expect(result.current.isPseudo).toBe(true);
  });

  it("unwinds its own entry when closed from the UI", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    await act(async () => result.current.exit());
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("unwinds an explicit exit even when its owner unmounts immediately", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result, unmount } = renderFullscreen();
    await act(async () => result.current.toggle());
    act(() => {
      result.current.exit();
      unmount();
    });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not unwind after the entry was already consumed by a back navigation", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    window.history.replaceState(null, "");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(result.current.isPseudo).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it("does not navigate when the component unmounts", async () => {
    // Unwinding here could cancel whatever navigation unmounted us.
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result, unmount } = renderFullscreen();
    await act(async () => result.current.toggle());
    unmount();
    expect(back).not.toHaveBeenCalled();
  });
});

describe("useFullscreen — document side effects", () => {
  it("marks the document so the mini player can stand down", async () => {
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(document.documentElement.dataset.playerFullscreen).toBe("true");
    await act(async () => result.current.exit());
    expect(document.documentElement.dataset.playerFullscreen).toBeUndefined();
  });

  it("locks the background and restores the scroll position", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 420 });
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    expect(document.body.style.overflow).toBe("hidden");
    // overflow:hidden alone still scrolls the background on iOS.
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-420px");
    await act(async () => result.current.exit());
    expect(document.body.style.position).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 420);
  });

  it("cleans up everything on unmount", async () => {
    const { result, unmount } = renderFullscreen();
    await act(async () => result.current.toggle());
    unmount();
    expect(document.documentElement.dataset.playerFullscreen).toBeUndefined();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
  });
});
