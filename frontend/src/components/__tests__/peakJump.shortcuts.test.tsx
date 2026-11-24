// SPEC-CORE-151: the `P` key in VideoPlayer (I4, I5).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import { installPointerEvent } from "@/test/pointerEvent";
import { VideoPlayer } from "../VideoPlayer";
import { ShortcutsProvider } from "../ShortcutsProvider";
import {
  band,
  fetchMock,
  flush,
  installPointerMode,
  pieces,
  restoreMatchMedia,
  routeFetch,
  segmentReads,
  segmentsResponse,
  wait,
} from "../player/MediaControls/__tests__/watchedBandHarness";
import {
  FIVE_SPOTS,
  installEveryWidth,
  label,
  restoreWidths,
} from "../player/MediaControls/__tests__/peakJumpHarness";

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

const DURATION = 100;
let nickname: string | null = "kaori";

const realPlatform = Object.getOwnPropertyDescriptor(window.navigator, "platform");

function setPlatform(value: string) {
  Object.defineProperty(window.navigator, "platform", { configurable: true, value });
}

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
  window.scrollTo = vi.fn();
  setPlatform("Win32");
});

afterEach(() => {
  document.querySelectorAll("[data-stray-input]").forEach((el) => el.remove());
  restoreWidths();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreMatchMedia();
  if (realPlatform) Object.defineProperty(window.navigator, "platform", realPlatform);
});

function LowerP({ onP }: { onP: () => void }): null {
  useShortcuts("lower-p", "Lower", [{ key: "p", label: "lower p", handler: onP }]);
  return null;
}

async function renderPlayer(lower?: () => void) {
  const tree = () => (
    <ShortcutsProvider>
      {lower && <LowerP onP={lower} />}
      <VideoPlayer videoId="vid-1" duration={DURATION} />
    </ShortcutsProvider>
  );
  const utils = render(tree());
  const video = utils.container.querySelector("video")!;
  let currentTime = 30;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (v: number) => {
      currentTime = v;
    },
  });
  Object.defineProperty(video, "duration", { configurable: true, get: () => DURATION });
  Object.defineProperty(video, "paused", { configurable: true, get: () => false });
  await flush();
  wait(1000);
  await flush();
  return { ...utils, video, time: () => currentTime, rerender: () => utils.rerender(tree()) };
}

function press(init: Record<string, unknown>, target: Document | Element = document) {
  act(() => {
    fireEvent.keyDown(target, init);
  });
}

function shown(): boolean {
  return band() !== null && pieces().length > 0;
}

describe("SPEC-CORE-151 the P key in VideoPlayer", () => {
  it("SPEC-CORE-151 p jumps through the spots, shows the label, reveals the bar and the band (pointer layout)", async () => {
    installPointerMode("fine");
    const { container, time } = await renderPlayer();
    const bar = container.querySelector<HTMLElement>('[data-testid="control-bar"]')!;
    wait(5000);
    expect(bar.className).toContain("opacity-0");

    press({ key: "p" });
    expect(time()).toBe(50);
    expect(label()).toBe("Most watched 1 / 5");
    expect(bar.className).toContain("opacity-100");
    expect(shown()).toBe(true);

    press({ key: "p" });
    expect(time()).toBe(25);
    expect(label()).toBe("Most watched 2 / 5");
  });

  it("SPEC-CORE-151 Shift+P acts as p", async () => {
    installPointerMode("fine");
    const { time } = await renderPlayer();
    press({ key: "P", shiftKey: true });
    expect(time()).toBe(50);
  });

  it("SPEC-CORE-151 on macOS Ctrl+P acts as p, and Cmd+P stays the browser's", async () => {
    setPlatform("MacIntel");
    installPointerMode("fine");
    const { time } = await renderPlayer();
    press({ key: "p", metaKey: true });
    expect(time()).toBe(30);
    press({ key: "p", ctrlKey: true });
    expect(time()).toBe(50);
  });

  it("SPEC-CORE-151 elsewhere Ctrl+P stays the browser's print", async () => {
    setPlatform("Win32");
    installPointerMode("fine");
    const { time } = await renderPlayer();
    press({ key: "p", ctrlKey: true });
    expect(time()).toBe(30);
    press({ key: "p" });
    expect(time()).toBe(50);
  });

  it("SPEC-CORE-151 p does nothing while an editing element or the seek bar has focus", async () => {
    installPointerMode("fine");
    const { time } = await renderPlayer();
    const input = document.createElement("input");
    input.setAttribute("data-stray-input", "");
    document.body.appendChild(input);
    act(() => {
      input.focus();
    });
    press({ key: "p" }, input);
    expect(time()).toBe(30);

    const seek = screen.getByRole("slider", { name: "Seek" });
    act(() => {
      seek.focus();
    });
    press({ key: "p" }, seek);
    expect(time()).toBe(30);

    act(() => {
      seek.blur();
    });
    press({ key: "p" });
    expect(time()).toBe(50);
  });

  it("SPEC-CORE-151 unavailable, p is not consumed and reaches a lower shortcut; available, it is consumed", async () => {
    nickname = null;
    installPointerMode("fine");
    const lower = vi.fn();
    const { time, rerender } = await renderPlayer(lower);

    expect(segmentReads()).toEqual([]);
    press({ key: "p" });
    expect(time()).toBe(30);
    expect(lower).toHaveBeenCalledTimes(1);

    nickname = "kaori";
    rerender();
    await flush();
    wait(1000);
    await flush();
    expect(segmentReads()).toEqual(["vid-1"]);

    press({ key: "p" });
    expect(time()).toBe(50);
    expect(lower).toHaveBeenCalledTimes(1);
  });

  it("SPEC-CORE-151 on touch, p shows the bottom bar only, with the band", async () => {
    installPointerMode("coarse");
    const { container, time } = await renderPlayer();
    wait(5000);

    press({ key: "p" });

    expect(time()).toBe(50);
    const bottom = container.querySelector<HTMLElement>('[data-testid="bottom-controls"]')!;
    const top = container.querySelector<HTMLElement>('[data-testid="top-controls"]');
    expect(bottom.className).toContain("pointer-events-auto");
    expect(bottom.className).not.toContain("opacity-0");
    expect(top === null || top.className.includes("pointer-events-none")).toBe(true);
    expect(shown()).toBe(true);
  });

  it.each([
    ["compact", 479, "compact-controls-root"],
    ["pointer without the button", 500, "control-bar"],
  ])("SPEC-CORE-151 in the %s layout p still jumps and reveals the bar", async (_name, width, root) => {
    installPointerMode("fine");
    installEveryWidth(width);
    const { container, time } = await renderPlayer();
    const bar = container.querySelector<HTMLElement>(`[data-testid="${root}"]`)!;
    expect(bar).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Jump to most watched" })).toBeNull();
    wait(5000);
    expect(bar.className).toContain("opacity-0");

    press({ key: "p" });
    expect(time()).toBe(50);
    expect(bar.className).toContain("opacity-100");
  });

  it("SPEC-CORE-151 the cheat sheet lists the key as shortcuts.jumpToMostWatched", async () => {
    installPointerMode("fine");
    await renderPlayer();
    press({ key: "?", shiftKey: true });
    const sheet = document.querySelector('[role="dialog"]')!;
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain("Jump to most watched");
  });
});
