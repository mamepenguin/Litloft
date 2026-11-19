// SPEC-CORE-140: the player's arrow-key shortcuts are skips (I1, I5, I6).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
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
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreMatchMedia();
});

async function renderPlayer() {
  const utils = render(
    <ShortcutsProvider>
      <VideoPlayer videoId="vid-1" duration={DURATION} />
    </ShortcutsProvider>,
  );
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
  return { ...utils, video, time: () => currentTime };
}

function press(key: string) {
  act(() => {
    fireEvent.keyDown(document, { key });
  });
}

function shown(): boolean {
  return band() !== null && pieces().length > 0;
}

describe("SPEC-CORE-140 arrow keys in VideoPlayer", () => {
  it.each([
    ["ArrowRight", 40],
    ["ArrowLeft", 20],
    ["ArrowUp", 90],
    ["ArrowDown", 0],
  ])(
    "SPEC-CORE-140 %s still seeks, reveals the whole bar and shows the band for 2 s (pointer layout)",
    async (key, expected) => {
      installPointerMode("fine");
      const { container, time } = await renderPlayer();
      expect(segmentReads()).toEqual(["vid-1"]);
      const bar = container.querySelector<HTMLElement>('[data-testid="control-bar"]')!;
      wait(5000);
      expect(bar.className).toContain("opacity-0");
      expect(band()).toBeNull();

      press(key);

      expect(time()).toBe(expected);
      expect(bar.className).toContain("opacity-100");
      expect(shown()).toBe(true);
      wait(1999);
      expect(shown()).toBe(true);
      wait(1);
      expect(band()).toBeNull();
    },
  );

  it("SPEC-CORE-140 an arrow key on touch shows the bottom bar only, with the band", async () => {
    installPointerMode("coarse");
    const { container, time } = await renderPlayer();
    wait(5000);

    press("ArrowRight");

    expect(time()).toBe(40);
    const bottom = container.querySelector<HTMLElement>('[data-testid="bottom-controls"]')!;
    const top = container.querySelector<HTMLElement>('[data-testid="top-controls"]');
    expect(bottom.className).toContain("pointer-events-auto");
    expect(bottom.className).not.toContain("opacity-0");
    expect(top === null || top.className.includes("pointer-events-none")).toBe(true);
    expect(container.querySelector('[data-testid="progress-hairline"]')).toBeNull();
    expect(shown()).toBe(true);
  });
});
