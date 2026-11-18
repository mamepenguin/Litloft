// SPEC-CORE-140: when the band shows, and the touch chrome's bottom-only state.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import { installPointerEvent } from "@/test/pointerEvent";
import { DOUBLE_TAP_MS, SKIP_ACCUMULATE_MS } from "../hooks/usePlayerGestures";
import {
  band,
  bandOnHover,
  fetchMock,
  hoverSeekRow,
  installPointerMode,
  leaveSeekRow,
  pieces,
  renderPage,
  restoreMatchMedia,
  routeFetch,
  segmentsResponse,
  settle,
  stubController,
  tick,
  wait,
} from "./watchedBandHarness";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getWatchProgress: vi.fn(),
    saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
  clearProgress: vi.fn(),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: vi.fn(),
}));

beforeEach(() => {
  installPointerEvent();
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5, 1: 5 } }) });
  vi.mocked(getWatchProgress).mockResolvedValue({ position: 0, duration: 0 });
  vi.mocked(saveWatchProgress).mockResolvedValue(undefined);
  vi.mocked(useProfile).mockImplementation(() => ({
    nickname: "kaori",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }));
  localStorage.clear();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreMatchMedia();
});

function shown(): boolean {
  return band() !== null && pieces().length > 0;
}

async function pointerPage(overrides: Parameters<typeof stubController>[0] = {}) {
  installPointerMode("fine");
  const { mc, state } = stubController(overrides);
  const page = renderPage({ mc, fileId: "f1" });
  await settle();
  // The band has data: hovering draws it.
  expect(bandOnHover()).toHaveLength(1);
  expect(band()).toBeNull();
  return { mc, state, page };
}

describe("SPEC-CORE-140 pointer layout: what shows the band (I1)", () => {
  it.each(["mouse", "pen"] as const)(
    "SPEC-CORE-140 a %s over the seek row shows it, and leaving hides it",
    async (pointerType) => {
      await pointerPage();
      hoverSeekRow(pointerType);
      expect(shown()).toBe(true);
      leaveSeekRow(pointerType);
      expect(band()).toBeNull();
    },
  );

  it("SPEC-CORE-140 a touch pointer over the seek row does not show it", async () => {
    await pointerPage();
    hoverSeekRow("touch");
    expect(band()).toBeNull();
  });

  it("SPEC-CORE-140 a pointer drag shows it for as long as the drag lasts, wherever the pointer goes", async () => {
    await pointerPage();
    const seek = screen.getByRole("slider", { name: "Seek" });
    act(() => {
      fireEvent.pointerDown(seek, { pointerType: "mouse", pointerId: 1 });
    });
    expect(shown()).toBe(true);
    leaveSeekRow();
    act(() => {
      fireEvent.change(seek, { target: { value: "50" } });
    });
    wait(5000);
    expect(shown()).toBe(true);
    act(() => {
      fireEvent.pointerUp(seek, { pointerType: "mouse", pointerId: 1 });
    });
    expect(band()).toBeNull();
  });

  it("SPEC-CORE-140 a key scrub on the seek bar shows it until the key is released", async () => {
    await pointerPage();
    const seek = screen.getByRole("slider", { name: "Seek" });
    act(() => {
      fireEvent.keyDown(seek, { key: "ArrowRight" });
    });
    expect(shown()).toBe(true);
    act(() => {
      fireEvent.keyUp(seek, { key: "ArrowRight" });
    });
    expect(band()).toBeNull();
  });

  it.each(["Forward 10 seconds", "Back 10 seconds"])(
    "SPEC-CORE-140 pressing %s shows it for 2 seconds",
    async (name) => {
      await pointerPage({ currentTime: 40 });
      act(() => {
        fireEvent.click(screen.getByRole("button", { name }));
      });
      expect(shown()).toBe(true);
      wait(1999);
      expect(shown()).toBe(true);
      wait(1);
      expect(band()).toBeNull();
    },
  );

  it("SPEC-CORE-140 each skip restarts the 2 seconds", async () => {
    await pointerPage({ currentTime: 40 });
    const forward = screen.getByRole("button", { name: "Forward 10 seconds" });
    act(() => {
      fireEvent.click(forward);
    });
    wait(1500);
    act(() => {
      fireEvent.click(forward);
    });
    wait(1999);
    expect(shown()).toBe(true);
    wait(1);
    expect(band()).toBeNull();
  });

  it("SPEC-CORE-140 nothing else shows it: frame moves, other buttons, focus, pausing", async () => {
    const { state } = await pointerPage();
    const frame = screen.getByTestId("frame");
    const seek = screen.getByRole("slider", { name: "Seek" });

    act(() => {
      fireEvent.pointerMove(frame, { pointerType: "mouse", pointerId: 1 });
      fireEvent.mouseMove(frame);
    });
    expect(band()).toBeNull();

    for (const name of ["Pause", "Mute", "Full screen"]) {
      act(() => {
        fireEvent.click(screen.getByRole("button", { name }));
      });
      expect(band()).toBeNull();
    }

    act(() => {
      seek.focus();
    });
    expect(band()).toBeNull();
    act(() => {
      seek.blur();
    });

    state.paused = true;
    tick(4);
    expect(band()).toBeNull();
  });
});

describe("SPEC-CORE-140 pointer layout: skips reveal the bar (I6)", () => {
  it("SPEC-CORE-140 a skip button reveals the whole bar and the band together", async () => {
    await pointerPage({ currentTime: 40 });
    const bar = document.querySelector<HTMLElement>('[data-testid="control-bar"]')!;
    wait(5000);
    expect(bar.className).toContain("opacity-0");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    });
    expect(bar.className).toContain("opacity-100");
    expect(shown()).toBe(true);
  });
});

// ------------------------------------------------------------- touch

const WITHIN = 50;
const BEYOND = 100;
const FRAME_WIDTH = 400;
const RIGHT_X = 300;

function overlay(): HTMLElement {
  const el = document.querySelector<HTMLElement>("[data-player-gestures]");
  if (!el) throw new Error("gesture overlay not found");
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: FRAME_WIDTH,
      height: 200,
      right: FRAME_WIDTH,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  return el;
}

function firePointer(target: EventTarget, type: string, init: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: 0, clientY: 0, pointerId: 1, pointerType: "touch", ...init });
  act(() => {
    target.dispatchEvent(event);
  });
}

function tap(x = RIGHT_X) {
  firePointer(overlay(), "pointerdown", { clientX: x, clientY: 50 });
  firePointer(window, "pointerup", { clientX: x, clientY: 50 });
}

function doubleTap(x = RIGHT_X) {
  tap(x);
  wait(WITHIN);
  tap(x);
}

const HIDDEN_CLASSES = ["opacity-0", "invisible", "hidden"];

function drawn(el: HTMLElement | null): boolean {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (HIDDEN_CLASSES.some((c) => node!.classList.contains(c))) return false;
  }
  return el !== null;
}

function takesTouches(el: HTMLElement | null): boolean {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.classList.contains("pointer-events-none")) return false;
    if (node.classList.contains("pointer-events-auto")) return true;
  }
  return false;
}

function live(el: HTMLElement | null): boolean {
  return drawn(el) && takesTouches(el);
}

type Chrome = "hidden" | "whole" | "bottom-only" | string;

function chrome(): Chrome {
  const top = document.querySelector<HTMLElement>('[data-testid="top-controls"]');
  const bottom = document.querySelector<HTMLElement>('[data-testid="bottom-controls"]');
  const centre = Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid="transport"] button'),
  );
  const t = live(top);
  const b = live(bottom);
  const c = centre.some(live);
  if (t && b && c) return "whole";
  if (b && !t && !c) return "bottom-only";
  if (!t && !b && !c) return "hidden";
  return `mixed(top=${t},bottom=${b},centre=${c})`;
}

function hairline(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="progress-hairline"]');
}

async function touchPage(overrides: Parameters<typeof stubController>[0] = {}) {
  installPointerMode("coarse");
  const { mc, state } = stubController({ currentTime: 40, ...overrides });
  const page = renderPage({ mc, fileId: "f1" });
  await settle();
  return { mc, state, page };
}

/** Waits out the tap burst so the next tap is a single tap, not a skip. */
const BURST_MS = Math.max(DOUBLE_TAP_MS, SKIP_ACCUMULATE_MS) + BEYOND;

describe("SPEC-CORE-140 touch layout: bottom-only (I5)", () => {
  it("SPEC-CORE-140 a double tap from hidden shows the bottom bar with the band, and hides it 2 s after", async () => {
    const { mc } = await touchPage();
    wait(5000);
    expect(chrome()).toBe("hidden");

    doubleTap();
    expect(mc.seek).toHaveBeenCalled();
    expect(chrome()).toBe("bottom-only");
    expect(hairline()).toBeNull();
    expect(shown()).toBe(true);

    wait(1900);
    expect(chrome()).toBe("bottom-only");
    expect(shown()).toBe(true);
    wait(200);
    expect(chrome()).toBe("hidden");
    expect(band()).toBeNull();
  });

  it("SPEC-CORE-140 a double tap from the whole chrome also ends in bottom-only", async () => {
    await touchPage();
    wait(5000);
    tap();
    wait(BURST_MS);
    expect(chrome()).toBe("whole");

    doubleTap();
    expect(chrome()).toBe("bottom-only");
    expect(shown()).toBe(true);
  });

  it("SPEC-CORE-140 2 s after a skip while paused, the whole chrome shows", async () => {
    await touchPage({ paused: true });
    doubleTap();
    expect(chrome()).toBe("bottom-only");
    wait(2100);
    expect(chrome()).toBe("whole");
  });

  it("SPEC-CORE-140 a further tap of the burst restarts the 2 s", async () => {
    expect(SKIP_ACCUMULATE_MS).toBeGreaterThan(WITHIN * 2);
    const { mc } = await touchPage();
    wait(5000);
    doubleTap();
    const gap = Math.min(500, SKIP_ACCUMULATE_MS - WITHIN);
    wait(gap);
    const seeks = vi.mocked(mc.seek).mock.calls.length;
    tap();
    expect(vi.mocked(mc.seek).mock.calls.length).toBeGreaterThan(seeks);
    wait(1900);
    expect(chrome()).toBe("bottom-only");
    wait(200);
    expect(chrome()).toBe("hidden");
  });

  it("SPEC-CORE-140 in bottom-only the full-screen button works, keeps bottom-only and restarts the 2 s", async () => {
    const { mc } = await touchPage();
    wait(5000);
    doubleTap();
    wait(1000);

    const fullscreen = screen.getByRole("button", { name: "Full screen" });
    expect(takesTouches(fullscreen)).toBe(true);
    act(() => {
      fireEvent.click(fullscreen);
    });
    expect(mc.toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(chrome()).toBe("bottom-only");

    wait(1900);
    expect(chrome()).toBe("bottom-only");
    wait(200);
    expect(chrome()).toBe("hidden");
  });

  it("SPEC-CORE-140 a scrub started in bottom-only stays there and restarts the 2 s when it ends", async () => {
    await touchPage();
    wait(5000);
    doubleTap();
    wait(1000);

    const seek = screen.getByRole("slider", { name: "Seek" });
    expect(takesTouches(seek)).toBe(true);
    act(() => {
      fireEvent.pointerDown(seek, { pointerType: "touch", pointerId: 2 });
      fireEvent.change(seek, { target: { value: "70" } });
    });
    wait(3000);
    expect(chrome()).toBe("bottom-only");
    expect(shown()).toBe(true);
    act(() => {
      fireEvent.pointerUp(seek, { pointerType: "touch", pointerId: 2 });
    });
    wait(1900);
    expect(chrome()).toBe("bottom-only");
    expect(shown()).toBe(true);
    wait(200);
    expect(chrome()).toBe("hidden");
    expect(band()).toBeNull();
  });

  it("SPEC-CORE-140 a single tap in bottom-only brings the whole chrome", async () => {
    expect(BURST_MS).toBeLessThan(1900);
    await touchPage();
    wait(5000);
    doubleTap();
    wait(BURST_MS);
    expect(chrome()).toBe("bottom-only");

    tap(FRAME_WIDTH / 2);
    expect(chrome()).toBe("whole");
  });

  it("SPEC-CORE-140 pausing in bottom-only brings the whole chrome", async () => {
    const { state } = await touchPage();
    wait(5000);
    doubleTap();
    expect(chrome()).toBe("bottom-only");

    state.paused = true;
    tick(2);
    expect(chrome()).toBe("whole");
  });

  it("SPEC-CORE-140 a double tap during an ad break leaves the chrome as it was; after it, the skip shows bottom-only", async () => {
    const { mc, state } = await touchPage({ interrupted: true });
    wait(5000);
    const before = chrome();

    doubleTap();
    expect(chrome()).toBe(before);
    expect(band()).toBeNull();
    expect(mc.seek).not.toHaveBeenCalled();

    state.interrupted = false;
    tick(2);
    wait(5000);
    doubleTap();
    expect(chrome()).toBe("bottom-only");
  });

  it("SPEC-CORE-140 a single tap reveals the chrome without the band", async () => {
    await touchPage();
    wait(5000);
    doubleTap();
    expect(shown()).toBe(true);
    wait(2100);
    expect(band()).toBeNull();

    tap(FRAME_WIDTH / 2);
    expect(chrome()).toBe("whole");
    expect(band()).toBeNull();
  });
});
