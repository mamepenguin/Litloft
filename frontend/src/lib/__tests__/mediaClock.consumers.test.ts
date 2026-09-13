import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";
import type { MediaController } from "../mediaController";
import { MEDIA_CLOCK_ACTIVE_MS } from "../mediaClock";
import { useMediaControlsState } from "@/components/player/MediaControls/hooks/useMediaControlsState";
import { useMiniPlayer } from "@/hooks/useMiniPlayer";

function makeMc(overrides: Partial<MediaController> = {}): MediaController {
  return {
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: vi.fn().mockReturnValue(10),
    getDuration: vi.fn().mockReturnValue(100),
    isPaused: vi.fn().mockReturnValue(false),
    isMuted: vi.fn().mockReturnValue(false),
    getVolume: vi.fn().mockReturnValue(1),
    setVolume: vi.fn(),
    getPlaybackRate: vi.fn().mockReturnValue(1),
    setPlaybackRate: vi.fn(),
    getBufferedFraction: vi.fn().mockReturnValue(0.5),
    ...overrides,
  };
}

/**
 * `vi.getTimerCount()` is no use here: the control bar also keeps an
 * auto-hide `setTimeout` pending. Spies are installed after `useFakeTimers`
 * so they wrap the faked globals.
 */
function spyOnIntervals() {
  return {
    set: vi.spyOn(globalThis, "setInterval"),
    clear: vi.spyOn(globalThis, "clearInterval"),
  };
}

let intervalSpies: ReturnType<typeof spyOnIntervals>;

function liveIntervals(): number {
  return (
    intervalSpies.set.mock.calls.length -
    intervalSpies.clear.mock.calls.length
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  intervalSpies = spyOnIntervals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("mediaClock consumers", () => {
  it("runs a single interval for the control bar and the mini player", () => {
    const mc = makeMc();
    const containerRef = createRef<HTMLElement>();

    const controls = renderHook(() => useMediaControlsState({ mc }));
    const mini = renderHook(() => useMiniPlayer({ containerRef, mc }));

    expect(liveIntervals()).toBe(1);

    controls.unmount();
    expect(liveIntervals()).toBe(1);

    mini.unmount();
    expect(liveIntervals()).toBe(0);
  });

  it("keeps the two consumers agreeing about whether playback is running", () => {
    const isPaused = vi.fn().mockReturnValue(false);
    const mc = makeMc({ isPaused });
    const containerRef = createRef<HTMLElement>();

    const controls = renderHook(() => useMediaControlsState({ mc }));
    const mini = renderHook(() => useMiniPlayer({ containerRef, mc }));

    expect(controls.result.current.paused).toBe(false);

    isPaused.mockReturnValue(true);
    act(() => {
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
    });

    expect(controls.result.current.paused).toBe(true);
    expect(mini.result.current.isMini).toBe(false);
  });

  it("still reports the fields the shared snapshot excludes", () => {
    const mc = makeMc({
      getVolume: vi.fn().mockReturnValue(0.25),
      getBufferedFraction: vi.fn().mockReturnValue(0.75),
      isMuted: vi.fn().mockReturnValue(true),
      getPlaybackRate: vi.fn().mockReturnValue(1.5),
      getCaptions: vi.fn().mockReturnValue("on" as const),
    });

    const { result } = renderHook(() => useMediaControlsState({ mc }));

    expect(result.current).toMatchObject({
      volume: 0.25,
      bufferedFraction: 0.75,
      muted: true,
      playbackRate: 1.5,
      captions: "on",
    });
  });

  it("prefers the file's duration hint over whatever the player reports", () => {
    const mc = makeMc({ getDuration: vi.fn().mockReturnValue(30) });

    const { result } = renderHook(() =>
      useMediaControlsState({ mc, durationHint: 600 }),
    );

    expect(result.current.duration).toBe(600);
  });
});
