import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dirtyRegistry } from "../dirtyRegistry";
import {
  COMMIT_TIMEOUT_MS,
  navigateWithTransition,
  notifyNavigationCommit,
  _resetViewTransitionsForTests,
} from "../viewTransitions";

interface FakeHandle {
  skipTransition: ReturnType<typeof vi.fn>;
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
}

let handles: FakeHandle[] = [];

/**
 * A throwing update callback rejects `finished` and does not come back out
 * of `startViewTransition`, so the caller cannot clean up in a `catch`.
 */
function fakeTransition(cb: () => unknown): FakeHandle {
  let updateCallbackDone: Promise<void>;
  try {
    updateCallbackDone = Promise.resolve(cb()).then(() => undefined);
  } catch (error) {
    updateCallbackDone = Promise.reject(error);
  }
  updateCallbackDone.catch(() => undefined);
  const handle: FakeHandle = {
    skipTransition: vi.fn(),
    ready: updateCallbackDone,
    finished: updateCallbackDone,
    updateCallbackDone,
  };
  handles.push(handle);
  return handle;
}

function installViewTransition(): void {
  (document as unknown as Record<string, unknown>).startViewTransition =
    fakeTransition;
}

function removeViewTransition(): void {
  delete (document as unknown as Record<string, unknown>).startViewTransition;
}

function setReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function card(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function namedElements(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.style.viewTransitionName !== "",
  );
}

/** Drain the microtask queue without advancing fake timers. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  handles = [];
  dirtyRegistry.reset();
  _resetViewTransitionsForTests();
  document.body.innerHTML = "";
  delete document.documentElement.dataset.vt;
  setReducedMotion(false);
  installViewTransition();
});

afterEach(() => {
  removeViewTransition();
  dirtyRegistry.reset();
  _resetViewTransitionsForTests();
  vi.useRealTimers();
});

describe("navigateWithTransition — when no transition may run", () => {
  it("navigates directly when the browser has no startViewTransition", () => {
    removeViewTransition();
    const navigate = vi.fn();
    const hero = card();

    navigateWithTransition("folder-down", navigate, { hero });

    expect(navigate).toHaveBeenCalledOnce();
    expect(namedElements()).toEqual([]);
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });

  it("navigates directly under prefers-reduced-motion", () => {
    setReducedMotion(true);
    const navigate = vi.fn();
    const hero = card();

    navigateWithTransition("folder-down", navigate, { hero });

    expect(navigate).toHaveBeenCalledOnce();
    expect(handles).toHaveLength(0);
    expect(namedElements()).toEqual([]);
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });

  it("navigates directly when the tab is dirty, because the guard may never run the navigation", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const navigate = vi.fn();
    const hero = card();

    navigateWithTransition("folder-up", navigate, { hero });

    expect(navigate).toHaveBeenCalledOnce();
    expect(handles).toHaveLength(0);
    expect(namedElements()).toEqual([]);
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });
});

describe("navigateWithTransition — the transition", () => {
  it("names the hero and sets the direction before the browser captures", () => {
    const hero = card();
    let nameAtCapture = "";
    let vtAtCapture: string | undefined;
    (document as unknown as Record<string, unknown>).startViewTransition = (
      cb: () => unknown,
    ) => {
      nameAtCapture = hero.style.viewTransitionName;
      vtAtCapture = document.documentElement.dataset.vt;
      return fakeTransition(cb);
    };

    navigateWithTransition("folder-down", vi.fn(), { hero });

    expect(nameAtCapture).toBe("file-hero");
    expect(vtAtCapture).toBe("folder-down");
  });

  it("runs the navigation inside the transition callback", () => {
    const order: string[] = [];
    (document as unknown as Record<string, unknown>).startViewTransition = (
      cb: () => unknown,
    ) => {
      order.push("start");
      const handle = fakeTransition(cb);
      order.push("callback-returned");
      return handle;
    };

    navigateWithTransition("folder-down", () => order.push("navigate"), {
      hero: card(),
    });

    expect(order).toEqual(["start", "navigate", "callback-returned"]);
  });

  it("clears the name and the direction once the transition finishes", async () => {
    const hero = card();

    navigateWithTransition("folder-down", vi.fn(), { hero });
    notifyNavigationCommit("/drive/a/movies");
    await flush();

    expect(namedElements()).toEqual([]);
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });

  it("ignores a commit notification for the url it started from", async () => {
    vi.useFakeTimers();
    const hero = card();
    let settled = false;

    navigateWithTransition("folder-down", () => {}, {
      hero,
      startUrl: "/drive/a",
    });
    handles[0].updateCallbackDone.then(() => {
      settled = true;
    });

    notifyNavigationCommit("/drive/a");
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    notifyNavigationCommit("/drive/a/movies");
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });
});

describe("navigateWithTransition — when something else drives the navigation", () => {
  it("does not wait out the timeout for a commit that landed before the callback ran", async () => {
    vi.useFakeTimers();
    let settled = false;
    let handle: FakeHandle;
    (document as unknown as Record<string, unknown>).startViewTransition = (
      cb: () => unknown,
    ) => {
      const updateCallbackDone = Promise.resolve().then(() => cb());
      handle = {
        skipTransition: vi.fn(),
        ready: updateCallbackDone.then(() => undefined),
        finished: updateCallbackDone.then(() => undefined),
        updateCallbackDone: updateCallbackDone.then(() => undefined),
      };
      handles.push(handle);
      return handle;
    };

    navigateWithTransition("folder-down", undefined, {
      startUrl: "/drive/a",
    });
    notifyNavigationCommit("/drive/a/movies");
    handles[0].updateCallbackDone.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(true);
    expect(handles[0].skipTransition).not.toHaveBeenCalled();
  });
});

describe("navigateWithTransition — nothing is left behind", () => {
  it("holds input for no longer than the declared budget", () => {
    expect(COMMIT_TIMEOUT_MS).toBe(250);
  });

  it("skips the transition and cleans up when the navigation never commits", async () => {
    vi.useFakeTimers();
    const hero = card();

    navigateWithTransition("folder-down", vi.fn(), { hero });
    expect(hero.style.viewTransitionName).toBe("file-hero");

    await vi.advanceTimersByTimeAsync(249);
    expect(handles[0].skipTransition).not.toHaveBeenCalled();
    expect(hero.style.viewTransitionName).toBe("file-hero");

    await vi.advanceTimersByTimeAsync(2);

    expect(handles[0].skipTransition).toHaveBeenCalledOnce();
    expect(namedElements()).toEqual([]);
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });

  it("never leaves two elements holding the hero name when a second transition interrupts the first", async () => {
    vi.useFakeTimers();
    const first = card();
    const second = card();

    navigateWithTransition("folder-down", vi.fn(), { hero: first });
    navigateWithTransition("folder-down", vi.fn(), { hero: second });

    expect(namedElements()).toEqual([second]);

    await vi.advanceTimersByTimeAsync(251);
    expect(namedElements()).toEqual([]);
  });

  it("leaves nothing behind when the navigation throws", async () => {
    const hero = card();

    navigateWithTransition(
      "folder-up",
      () => {
        throw new Error("boom");
      },
      { hero },
    );
    await flush();

    expect(namedElements()).toEqual([]);
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });

  it("takes the url it started from off the location when the caller gives none", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/drive/main?file=abc123");
    let settled = false;

    navigateWithTransition("folder-down", () => {}, { hero: card() });
    handles[0].updateCallbackDone.then(() => {
      settled = true;
    });

    notifyNavigationCommit("/drive/main?file=abc123");
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    notifyNavigationCommit("/drive/main?file=def456");
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });

  it("puts the kind on the document for the stylesheet to read", () => {
    let seen: string | undefined;
    (document as unknown as Record<string, unknown>).startViewTransition = (
      cb: () => unknown,
    ) => {
      seen = document.documentElement.dataset.vt;
      return fakeTransition(cb);
    };

    navigateWithTransition("file-open", vi.fn(), { hero: card() });

    expect(seen).toBe("file-open");
  });
});
