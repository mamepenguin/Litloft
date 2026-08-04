import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MediaController } from "@/lib/mediaController";
import { useMediaControlsState } from "../useMediaControlsState";

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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useMediaControlsState", () => {
  describe("without a controller", () => {
    it("reports a neutral snapshot instead of throwing", () => {
      const { result } = renderHook(() => useMediaControlsState({ mc: null }));
      expect(result.current.currentTime).toBe(0);
      expect(result.current.duration).toBe(0);
      expect(result.current.bufferedFraction).toBe(0);
      expect(result.current.paused).toBe(true);
    });

    it("keeps controls visible so the frame never looks dead", () => {
      const { result } = renderHook(() => useMediaControlsState({ mc: null }));
      advance(10_000);
      expect(result.current.controlsVisible).toBe(true);
    });
  });

  describe("polling", () => {
    it("reads the controller immediately on mount", () => {
      const mc = makeMc();
      const { result } = renderHook(() => useMediaControlsState({ mc }));
      expect(result.current.currentTime).toBe(10);
      expect(result.current.bufferedFraction).toBe(0.5);
    });

    it("polls every 250ms while playing", () => {
      const getCurrentTime = vi.fn().mockReturnValue(10);
      const mc = makeMc({ getCurrentTime });
      renderHook(() => useMediaControlsState({ mc }));
      const baseline = getCurrentTime.mock.calls.length;
      advance(1000);
      expect(getCurrentTime.mock.calls.length - baseline).toBe(4);
    });

    it("drops to a 1s poll while paused rather than stopping entirely", () => {
      // Stopping would strand the UI if playback resumed from a
      // keyboard shortcut or an ad ending, which never notify us.
      const getCurrentTime = vi.fn().mockReturnValue(10);
      const mc = makeMc({ getCurrentTime, isPaused: vi.fn().mockReturnValue(true) });
      renderHook(() => useMediaControlsState({ mc }));
      const baseline = getCurrentTime.mock.calls.length;
      advance(750);
      expect(getCurrentTime.mock.calls.length - baseline).toBe(0);
      advance(250);
      expect(getCurrentTime.mock.calls.length - baseline).toBe(1);
    });

    it("stops polling once unmounted", () => {
      const getCurrentTime = vi.fn().mockReturnValue(10);
      const mc = makeMc({ getCurrentTime });
      const { unmount } = renderHook(() => useMediaControlsState({ mc }));
      unmount();
      const baseline = getCurrentTime.mock.calls.length;
      advance(2000);
      expect(getCurrentTime.mock.calls.length).toBe(baseline);
    });
  });

  describe("duration resolution", () => {
    it("prefers durationHint over the player's own duration", () => {
      const mc = makeMc({ getDuration: vi.fn().mockReturnValue(30) });
      const { result } = renderHook(() =>
        useMediaControlsState({ mc, durationHint: 600 }),
      );
      expect(result.current.duration).toBe(600);
    });

    it("falls back to the player when the hint is missing or unusable", () => {
      for (const hint of [null, undefined, 0, Number.NaN]) {
        const mc = makeMc({ getDuration: vi.fn().mockReturnValue(30) });
        const { result } = renderHook(() =>
          useMediaControlsState({ mc, durationHint: hint }),
        );
        expect(result.current.duration).toBe(30);
      }
    });

    it("reports 0 when neither source knows the duration yet", () => {
      const mc = makeMc({ getDuration: vi.fn().mockReturnValue(Number.NaN) });
      const { result } = renderHook(() => useMediaControlsState({ mc }));
      expect(result.current.duration).toBe(0);
    });
  });

  describe("interrupted", () => {
    it("is false when the controller implements no detector", () => {
      const { result } = renderHook(() => useMediaControlsState({ mc: makeMc() }));
      expect(result.current.interrupted).toBe(false);
    });

    it("reflects the controller's detector", () => {
      const mc = makeMc({ isInterrupted: vi.fn().mockReturnValue(true) });
      const { result } = renderHook(() => useMediaControlsState({ mc }));
      expect(result.current.interrupted).toBe(true);
    });
  });

  describe("scrubbing", () => {
    it("shows the dragged position instead of the playhead", () => {
      const mc = makeMc();
      const { result } = renderHook(() => useMediaControlsState({ mc }));
      expect(result.current.displayTime).toBe(10);
      act(() => result.current.beginScrub(80));
      expect(result.current.scrubbing).toBe(true);
      expect(result.current.displayTime).toBe(80);
      act(() => result.current.updateScrub(90));
      expect(result.current.displayTime).toBe(90);
    });

    it("does not let polling overwrite the dragged position", () => {
      const mc = makeMc();
      const { result } = renderHook(() => useMediaControlsState({ mc }));
      act(() => result.current.beginScrub(80));
      advance(1000);
      expect(result.current.displayTime).toBe(80);
    });

    it("seeks once on release and hands the playhead back", () => {
      const mc = makeMc();
      const { result } = renderHook(() => useMediaControlsState({ mc }));
      act(() => result.current.beginScrub(80));
      act(() => result.current.endScrub());
      expect(mc.seek).toHaveBeenCalledTimes(1);
      expect(mc.seek).toHaveBeenCalledWith(80);
      expect(result.current.scrubbing).toBe(false);
      expect(result.current.displayTime).toBe(10);
    });

    it("is a no-op on release when no scrub was in progress", () => {
      const mc = makeMc();
      const { result } = renderHook(() => useMediaControlsState({ mc }));
      act(() => result.current.endScrub());
      expect(mc.seek).not.toHaveBeenCalled();
    });
  });

  describe("auto-hide", () => {
    it("hides the controls after the idle delay while playing", () => {
      const mc = makeMc();
      const { result } = renderHook(() =>
        useMediaControlsState({ mc, autoHideMs: 3000 }),
      );
      expect(result.current.controlsVisible).toBe(true);
      advance(3000);
      expect(result.current.controlsVisible).toBe(false);
    });

    it("restarts the delay on interaction", () => {
      const mc = makeMc();
      const { result } = renderHook(() =>
        useMediaControlsState({ mc, autoHideMs: 3000 }),
      );
      advance(2000);
      act(() => result.current.revealControls());
      advance(2000);
      expect(result.current.controlsVisible).toBe(true);
      advance(1000);
      expect(result.current.controlsVisible).toBe(false);
    });

    it("keeps the controls up while paused", () => {
      const mc = makeMc({ isPaused: vi.fn().mockReturnValue(true) });
      const { result } = renderHook(() =>
        useMediaControlsState({ mc, autoHideMs: 3000 }),
      );
      advance(10_000);
      expect(result.current.controlsVisible).toBe(true);
    });

    it("re-shows the controls when playback pauses", () => {
      const isPaused = vi.fn().mockReturnValue(false);
      const mc = makeMc({ isPaused });
      const { result } = renderHook(() =>
        useMediaControlsState({ mc, autoHideMs: 3000 }),
      );
      advance(3000);
      expect(result.current.controlsVisible).toBe(false);
      isPaused.mockReturnValue(true);
      advance(250);
      expect(result.current.controlsVisible).toBe(true);
    });

    it("keeps the controls up while a scrub is in progress", () => {
      const mc = makeMc();
      const { result } = renderHook(() =>
        useMediaControlsState({ mc, autoHideMs: 3000 }),
      );
      act(() => result.current.beginScrub(50));
      advance(10_000);
      expect(result.current.controlsVisible).toBe(true);
    });
  });
});
