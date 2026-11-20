// SPEC-CORE-151: when the jump control is there, what a press shows, and the touch layout (I4, I5, I6, I7).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import { installPointerEvent } from "@/test/pointerEvent";
import {
  band,
  bandOnHover,
  fetchMock,
  flush,
  installPointerMode,
  pagehide,
  pieces,
  play,
  rangeSends,
  renderPage,
  respond,
  restoreMatchMedia,
  routeFetch,
  segmentReads,
  segmentsResponse,
  settle,
  stubController,
  tick,
  wait,
} from "./watchedBandHarness";
import {
  FIVE_SPOTS,
  JUMP,
  RIGHT_X,
  WITHIN,
  chrome,
  installFrameWidth,
  jumpButton,
  label,
  labelElement,
  lastSeek,
  layoutOf,
  pressJump,
  resizeFrame,
  restoreWidths,
  storageSnapshot,
  takesTouches,
  tap,
} from "./peakJumpHarness";

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

let nickname: string | null = "kaori";

beforeEach(() => {
  installPointerEvent();
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  routeFetch({ segments: async () => segmentsResponse({ segments: FIVE_SPOTS }) });
  vi.mocked(getWatchProgress).mockResolvedValue({ position: 0, duration: 0 });
  vi.mocked(saveWatchProgress).mockResolvedValue(undefined);
  nickname = "kaori";
  vi.mocked(useProfile).mockImplementation(() => ({
    nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }));
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => null,
  });
});

afterEach(() => {
  restoreWidths();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreMatchMedia();
});

function shown(): boolean {
  return band() !== null && pieces().length > 0;
}

async function pointerPage(overrides: Parameters<typeof stubController>[0] = {}, width = 900) {
  installPointerMode("fine");
  installFrameWidth(width);
  const { mc, state } = stubController({ currentTime: 40, ...overrides });
  const page = renderPage({ mc, fileId: "f1" });
  await settle();
  return { mc, state, page };
}

async function touchPage(overrides: Parameters<typeof stubController>[0] = {}) {
  installPointerMode("coarse");
  installFrameWidth(400);
  const { mc, state } = stubController({ currentTime: 40, ...overrides });
  const page = renderPage({ mc, fileId: "f1" });
  await settle();
  return { mc, state, page };
}

function buttonsIn(selector: string): HTMLElement[] {
  const root = document.querySelector<HTMLElement>(selector);
  if (!root) throw new Error(`${selector} not rendered`);
  return Array.from(root.querySelectorAll<HTMLElement>("button"));
}

function nameOf(el: HTMLElement): string {
  return el.getAttribute("aria-label") ?? el.textContent ?? "";
}

describe("SPEC-CORE-151 availability (I4)", () => {
  it("SPEC-CORE-151 no profile, no button; a profile set later brings it", async () => {
    nickname = null;
    const { page } = await pointerPage();
    expect(screen.getByRole("button", { name: "Forward 10 seconds" })).toBeInTheDocument();
    expect(jumpButton()).toBeNull();

    nickname = "kaori";
    page.update({});
    await settle();
    expect(jumpButton()).not.toBeNull();
  });

  it.each([
    ["0", 0],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("SPEC-CORE-151 a duration of %s has no button; a positive one has", async (_n, duration) => {
    const { state } = await pointerPage({ duration });
    expect(jumpButton()).toBeNull();

    state.duration = 100;
    tick(2);
    await flush();
    expect(jumpButton()).not.toBeNull();
  });

  it("SPEC-CORE-151 a disabled seek bar (ad break) removes the button and hides a label at once; it returns after", async () => {
    const { state } = await pointerPage();
    pressJump();
    expect(label()).toBe("Most watched 1 / 5");

    state.interrupted = true;
    tick(2);
    expect(jumpButton()).toBeNull();
    expect(label()).toBeNull();

    state.interrupted = false;
    tick(2);
    expect(jumpButton()).not.toBeNull();
  });

  it("SPEC-CORE-151 watched-once parts make no spot; a send that makes a part level 2 brings the button", async () => {
    routeFetch({ segments: async () => segmentsResponse({ segments: { 0: 5, 1: 5 } }) });
    const { mc, state } = await pointerPage({ currentTime: 0 });
    expect(bandOnHover().length).toBeGreaterThan(0);
    expect(jumpButton()).toBeNull();

    play(state, 10);
    pagehide();
    await flush();

    expect(jumpButton()).not.toBeNull();
    pressJump();
    expect(lastSeek(mc)).toBe(0);
    expect(label()).toBe("Most watched 1 / 1");
  });

  it("SPEC-CORE-151 with the band read failed, only this page's sends make spots", async () => {
    routeFetch({ segments: async () => respond(500) });
    const { mc, state } = await pointerPage({ currentTime: 0 });
    expect(segmentReads()).toEqual(["f1"]);
    expect(jumpButton()).toBeNull();

    play(state, 10);
    pagehide();
    await flush();
    expect(jumpButton()).toBeNull();

    state.currentTime = 0;
    tick();
    play(state, 10);
    pagehide();
    await flush();

    expect(jumpButton()).not.toBeNull();
    pressJump();
    expect(lastSeek(mc)).toBe(0);
  });

  it("SPEC-CORE-151 a change of file hides a label at once", async () => {
    const { page } = await pointerPage();
    pressJump();
    expect(label()).toBe("Most watched 1 / 5");

    page.update({ fileId: "f2" });
    expect(label()).toBeNull();
  });

  it("SPEC-CORE-151 a change of nickname hides a label at once", async () => {
    const { page } = await pointerPage();
    pressJump();
    expect(label()).toBe("Most watched 1 / 5");

    nickname = "rin";
    page.update({});
    expect(label()).toBeNull();
  });
});

describe("SPEC-CORE-151 the pointer layout (I7, D1)", () => {
  it("SPEC-CORE-151 the button sits immediately after +10, named from player.jumpToMostWatched, with the (P) title", async () => {
    await pointerPage();
    expect(jumpButton(), "the jump button").not.toBeNull();
    const buttons = buttonsIn('[data-testid="control-bar"]');
    const forward = buttons.findIndex((b) => nameOf(b) === "Forward 10 seconds");
    expect(forward).toBeGreaterThanOrEqual(0);
    const next = buttons[forward + 1];
    expect(next).toBe(jumpButton());
    expect(next).toHaveAttribute("title", `${JUMP} (P)`);
  });

  it("SPEC-CORE-151 the button is drawn only from a 524px frame; 480-523 keeps the pointer layout without it, below 480 is compact", async () => {
    await pointerPage({}, 523);
    expect(layoutOf()).toBe("pointer");
    expect(jumpButton()).toBeNull();

    resizeFrame(524);
    expect(layoutOf()).toBe("pointer");
    expect(jumpButton()).not.toBeNull();

    resizeFrame(480);
    expect(layoutOf()).toBe("pointer");
    expect(jumpButton()).toBeNull();

    resizeFrame(479);
    expect(layoutOf()).toBe("compact");
    expect(jumpButton()).toBeNull();

    resizeFrame(900);
    expect(jumpButton()).not.toBeNull();
  });
});

describe("SPEC-CORE-151 what a press shows (I5)", () => {
  it("SPEC-CORE-151 the label shows the press's k / N for 2 seconds, in a polite live region", async () => {
    await pointerPage();
    pressJump();
    expect(label()).toBe("Most watched 1 / 5");
    const region = labelElement()!.closest('[role="status"]');
    expect(region).not.toBeNull();
    const live = region!.getAttribute("aria-live");
    expect(live === null || live === "polite").toBe(true);

    wait(1999);
    expect(label()).toBe("Most watched 1 / 5");
    wait(1);
    expect(label()).toBeNull();
  });

  it("SPEC-CORE-151 a further press restarts the label's 2 seconds with the new values", async () => {
    await pointerPage();
    pressJump();
    wait(1500);
    pressJump();
    expect(label()).toBe("Most watched 2 / 5");
    wait(1999);
    expect(label()).toBe("Most watched 2 / 5");
    wait(1);
    expect(label()).toBeNull();
  });

  it("SPEC-CORE-151 a press is a skip: the whole bar and the band show, the band for 2 seconds", async () => {
    await pointerPage();
    const bar = document.querySelector<HTMLElement>('[data-testid="control-bar"]')!;
    wait(5000);
    expect(bar.className).toContain("opacity-0");
    expect(band()).toBeNull();

    // The button sits in the faded bar; a pointer press still reaches it.
    pressJump();
    expect(bar.className).toContain("opacity-100");
    expect(shown()).toBe(true);
    wait(1999);
    expect(shown()).toBe(true);
    wait(1);
    expect(band()).toBeNull();
  });
});

describe("SPEC-CORE-151 no request, no storage (I6)", () => {
  it("SPEC-CORE-151 presses make no GET or POST and change no stored value", async () => {
    const { mc } = await pointerPage({ paused: true });
    const reads = segmentReads().length;
    const sends = rangeSends().length;
    const stored = storageSnapshot();

    pressJump();
    pressJump();
    pressJump();
    expect(lastSeek(mc)).toBe(10);
    wait(2500);
    await flush();

    expect(segmentReads()).toHaveLength(reads);
    expect(rangeSends()).toHaveLength(sends);
    expect(storageSnapshot()).toBe(stored);
  });
});

describe("SPEC-CORE-151 the touch layout (I5, I7, D2)", () => {
  it("SPEC-CORE-151 the button sits immediately before full screen in the bottom bar, without a title", async () => {
    await touchPage({ paused: true });
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
    expect(jumpButton(), "the jump button").not.toBeNull();
    const buttons = buttonsIn('[data-testid="bottom-controls"]');
    const full = buttons.findIndex((b) => nameOf(b) === "Full screen");
    expect(full).toBeGreaterThan(0);
    expect(buttons[full - 1]).toBe(jumpButton());
    expect(jumpButton()).not.toHaveAttribute("title");
  });

  it("SPEC-CORE-151 a press from the whole chrome ends in bottom-only with the band, hidden 2 s after while playing", async () => {
    const { mc } = await touchPage();
    wait(5000);
    tap(200);
    wait(1000);
    expect(chrome()).toBe("whole");

    pressJump();
    expect(lastSeek(mc)).toBe(50);
    expect(chrome()).toBe("bottom-only");
    expect(shown()).toBe(true);
    wait(1900);
    expect(chrome()).toBe("bottom-only");
    wait(200);
    expect(chrome()).toBe("hidden");
  });

  it("SPEC-CORE-151 in bottom-only the button takes touches, keeps bottom-only and restarts the 2 s", async () => {
    await touchPage();
    wait(5000);
    tap(200);
    wait(1000);
    pressJump();
    expect(chrome()).toBe("bottom-only");
    wait(1000);

    const button = jumpButton()!;
    expect(takesTouches(button)).toBe(true);
    act(() => {
      button.focus();
      fireEvent.click(button);
    });
    expect(label()).toBe("Most watched 2 / 5");
    expect(chrome()).toBe("bottom-only");
    wait(1900);
    expect(chrome()).toBe("bottom-only");
    wait(200);
    expect(chrome()).toBe("hidden");
  });

  it("SPEC-CORE-151 pressing the touch button clears the double-tap sequence", async () => {
    const { mc } = await touchPage({ paused: true });
    tap(RIGHT_X);
    pressJump();
    expect(vi.mocked(mc.seek)).toHaveBeenCalledTimes(1);
    wait(WITHIN);
    tap(RIGHT_X);
    expect(vi.mocked(mc.seek)).toHaveBeenCalledTimes(1);
  });
});
