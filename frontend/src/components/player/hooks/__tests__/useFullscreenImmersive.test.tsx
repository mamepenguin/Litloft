import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "../useFullscreen";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { immersive, installShellStub } from "@/test/shellStub";

const COARSE = "(pointer: coarse)";
const LANDSCAPE = "(orientation: landscape)";
const WIDE = { width: 402, height: 874 };

const media = new Map<string, { matches: boolean; listeners: Set<(e: MediaQueryListEvent) => void> }>();

function installMatchMedia() {
  media.clear();
  media.set(COARSE, { matches: true, listeners: new Set() });
  media.set(LANDSCAPE, { matches: false, listeners: new Set() });
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const entry = media.get(query) ?? { matches: false, listeners: new Set() };
    media.set(query, entry);
    return {
      get matches() {
        return entry.matches;
      },
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => entry.listeners.add(cb),
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => entry.listeners.delete(cb),
    };
  }) as unknown as typeof window.matchMedia;
}

function rotate(landscape: boolean) {
  const entry = media.get(LANDSCAPE)!;
  entry.matches = landscape;
  act(() => {
    for (const cb of entry.listeners) cb({ matches: landscape } as MediaQueryListEvent);
  });
}

function setViewport({ width, height }: { width: number; height: number }) {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
}

let frame: HTMLDivElement;
let shell: ReturnType<typeof installShellStub> | null = null;

function renderFullscreen(autoRotateEnabled = true) {
  return renderHook(() => useFullscreen({ frameRef: { current: frame }, autoRotateEnabled }), {
    wrapper: ShortcutsProvider,
  });
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** The shell's answer, and the page's viewport reaching it. */
async function widen() {
  setViewport(WIDE);
  act(() => {
    (window as unknown as { __litloft?: { receive(m: unknown): void } }).__litloft?.receive({
      type: "page.immersive.applied",
      active: true,
      ...WIDE,
    });
  });
  await flush(100);
}

const pinned = () => document.documentElement.dataset.playerFullscreen === "true";
const marked = () => Boolean((window.history.state as Record<string, unknown> | null)?.litloftFullscreen);

beforeEach(() => {
  vi.useFakeTimers();
  installMatchMedia();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  frame = document.createElement("div");
  document.body.appendChild(frame);
  window.history.replaceState(null, "");
  document.body.style.cssText = "";
  setViewport({ width: 402, height: 812 });
});

afterEach(() => {
  frame.remove();
  shell?.remove();
  shell = null;
  delete document.documentElement.dataset.playerFullscreen;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFullscreen in an iOS shell that answers immersive requests", () => {
  beforeEach(() => {
    shell = installShellStub(4);
  });

  it("pins the frame only once the shell has widened the page", async () => {
    const { result } = renderFullscreen();

    await act(async () => result.current.toggle());
    await flush();
    expect(shell!.posted).toEqual([immersive(true)]);
    expect(result.current.isPseudo).toBe(false);
    expect(result.current.isFullscreen).toBe(false);
    expect(pinned()).toBe(false);
    expect(marked()).toBe(false);

    await widen();
    expect(result.current.isPseudo).toBe(true);
    expect(result.current.isFullscreen).toBe(true);
    expect(pinned()).toBe(true);
    expect(marked()).toBe(true);
  });

  it("lets go of the shell only once the frame is back in its slot", async () => {
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    await widen();

    await act(async () => result.current.exit());
    await flush();

    expect(result.current.isPseudo).toBe(false);
    expect(pinned()).toBe(false);
    expect(shell!.posted).toEqual([immersive(true), immersive(false)]);
  });

  it("leaves nothing behind when exited while the shell is still widening", async () => {
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    await flush();

    await act(async () => result.current.exit());
    await widen();

    expect(result.current.isPseudo).toBe(false);
    expect(pinned()).toBe(false);
    expect(marked()).toBe(false);
    expect(shell!.posted).toEqual([immersive(true), immersive(false)]);
  });

  it("ignores a second press while the shell is still widening", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const { result } = renderFullscreen();
    await act(async () => result.current.toggle());
    await flush();

    await act(async () => result.current.toggle());
    await flush();
    await widen();

    expect(shell!.posted).toEqual([immersive(true)]);
    expect(result.current.isPseudo).toBe(true);
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("gives up an entry rotation started once the phone is upright again", async () => {
    const { result } = renderFullscreen();
    rotate(true);
    await flush();
    expect(shell!.posted).toEqual([immersive(true)]);

    rotate(false);
    await widen();

    expect(result.current.isPseudo).toBe(false);
    expect(pinned()).toBe(false);
    expect(shell!.posted).toEqual([immersive(true), immersive(false)]);
  });

  it("lets go of the shell when unmounted while widening", async () => {
    const { result, unmount } = renderFullscreen();
    await act(async () => result.current.toggle());
    await flush();

    unmount();
    await widen();

    expect(pinned()).toBe(false);
    expect(shell!.posted).toEqual([immersive(true), immersive(false)]);
  });

  it("lets go of the shell when unmounted while fullscreen", async () => {
    const { result, unmount } = renderFullscreen();
    await act(async () => result.current.toggle());
    await widen();

    unmount();

    expect(shell!.posted).toEqual([immersive(true), immersive(false)]);
  });

  it("never asks for element fullscreen's sake", async () => {
    let element: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => element });
    Object.defineProperty(frame, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockImplementation(() => {
        element = frame;
        return Promise.resolve();
      }),
    });
    const { result } = renderFullscreen();

    await act(async () => result.current.toggle());
    await flush();

    expect(shell!.posted).toEqual([]);
  });
});

describe("useFullscreen where nothing answers immersive requests", () => {
  it("pins at once in a browser", async () => {
    const { result } = renderFullscreen();

    await act(async () => result.current.toggle());

    expect(result.current.isPseudo).toBe(true);
    expect(pinned()).toBe(true);
  });

  it("asks an older shell but pins at once", async () => {
    shell = installShellStub(3);
    const { result } = renderFullscreen();

    await act(async () => result.current.toggle());

    expect(shell.posted).toEqual([immersive(true)]);
    expect(result.current.isPseudo).toBe(true);
    expect(pinned()).toBe(true);
  });
});
