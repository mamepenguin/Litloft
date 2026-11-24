// SPEC-CORE-151: the `P` key in ShellVideoPlayer (I4).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { getWatchProgress, saveWatchProgress } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import { installPointerEvent } from "@/test/pointerEvent";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import type { MediaController } from "@/lib/mediaController";
import {
  fetchMock,
  installPointerMode,
  restoreMatchMedia,
  routeFetch,
  segmentsResponse,
  settle,
  stubController,
} from "../MediaControls/__tests__/watchedBandHarness";
import { FIVE_SPOTS, label, lastSeek } from "../MediaControls/__tests__/peakJumpHarness";

const shell = vi.hoisted(() => ({ mc: null as MediaController | null }));

vi.mock("../hooks/useFullscreen", () => ({
  useFullscreen: () => ({ isFullscreen: false, isPseudo: false, toggle: () => {}, exit: () => {} }),
}));
vi.mock("@/hooks/useShellMedia", () => ({
  useShellMedia: () => ({ mc: shell.mc, channel: null, failed: false, waiting: false }),
}));
vi.mock("@/hooks/useShellCaptions", () => ({
  useShellCaptions: () => ({
    tracks: [],
    selected: -1,
    cues: [],
    select: vi.fn(),
    get: () => "off",
    set: vi.fn(),
  }),
}));
vi.mock("@/hooks/useShellSurface", () => ({ useShellSurface: vi.fn() }));
vi.mock("@/lib/autoplay", () => ({ useAutoplayPreference: () => [false, vi.fn()] }));

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

import { ShellVideoPlayer } from "../ShellVideoPlayer";

beforeEach(() => {
  installPointerEvent();
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  routeFetch({ segments: async () => segmentsResponse({ segments: FIVE_SPOTS }) });
  vi.mocked(getWatchProgress).mockResolvedValue({ position: 0, duration: 0 });
  vi.mocked(saveWatchProgress).mockResolvedValue(undefined);
  vi.mocked(useProfile).mockImplementation(() => ({
    nickname: "kaori",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }));
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreMatchMedia();
});

function press(key: string) {
  act(() => {
    fireEvent.keyDown(document, { key });
  });
}

describe("SPEC-CORE-151 the P key in ShellVideoPlayer", () => {
  it("SPEC-CORE-151 p jumps to the most watched spot, as the arrow keys seek", async () => {
    installPointerMode("fine");
    const { mc } = stubController({ currentTime: 30 });
    shell.mc = mc;
    render(
      <ShortcutsProvider>
        <ShellVideoPlayer videoId="vid-1" />
      </ShortcutsProvider>,
    );
    await settle();

    press("ArrowRight");
    expect(lastSeek(mc)).toBe(40);

    press("p");
    expect(lastSeek(mc)).toBe(50);
    expect(label()).toBe("Most watched 1 / 5");
  });
});
