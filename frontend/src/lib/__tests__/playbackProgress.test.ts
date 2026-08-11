import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MediaController } from "../mediaController";
import { MEDIA_CLOCK_ACTIVE_MS } from "../mediaClock";
import { usePlaybackProgress } from "../playbackProgress";
import { getWatchProgress, saveWatchProgress } from "../api";
import { getSavedProgress, saveProgress } from "../recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

vi.mock("../api", () => ({
  getWatchProgress: vi.fn(),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../recentlyPlayed", () => ({
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: vi.fn(),
}));

const mockGetWatchProgress = vi.mocked(getWatchProgress);
const mockSaveWatchProgress = vi.mocked(saveWatchProgress);
const mockGetSavedProgress = vi.mocked(getSavedProgress);
const mockSaveProgress = vi.mocked(saveProgress);
const mockUseProfile = vi.mocked(useProfile);

interface StubState {
  currentTime: number;
  duration: number;
  paused: boolean;
  interrupted: boolean;
}

function stubController(overrides: Partial<StubState> = {}) {
  const state: StubState = {
    currentTime: 0,
    duration: 600,
    paused: false,
    interrupted: false,
    ...overrides,
  };
  const mc: MediaController = {
    seek: vi.fn((seconds: number) => {
      state.currentTime = seconds;
    }),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: () => state.currentTime,
    getDuration: () => state.duration,
    isPaused: () => state.paused,
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: vi.fn(),
    getPlaybackRate: () => 1,
    setPlaybackRate: vi.fn(),
    getBufferedFraction: () => 0,
    isInterrupted: () => state.interrupted,
  };
  return { mc, state };
}

/** Advance one clock tick inside act(). */
function tick(times = 1) {
  act(() => {
    vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * times);
  });
}

function withProfile() {
  mockUseProfile.mockReturnValue({
    nickname: "kaori",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

function withoutProfile() {
  mockUseProfile.mockReturnValue({
    nickname: null,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGetWatchProgress.mockResolvedValue({ position: 0, duration: 0 });
  mockGetSavedProgress.mockReturnValue(0);
  withProfile();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePlaybackProgress", () => {
  describe("resume", () => {
    it("restores the stored position once a usable duration is known", async () => {
      mockGetWatchProgress.mockResolvedValue({ position: 120, duration: 600 });
      const { mc, state } = stubController({ duration: 0 });

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));

      // The upper bound of the resume window needs a length, so nothing
      // happens while the player has not reported one.
      tick();
      await act(async () => {});
      expect(mc.seek).not.toHaveBeenCalled();

      state.duration = 600;
      tick();
      await act(async () => {});

      expect(mc.seek).toHaveBeenCalledWith(120);
    });

    it("resumes only once, even as playback keeps moving", async () => {
      mockGetWatchProgress.mockResolvedValue({ position: 120, duration: 600 });
      const { mc, state } = stubController();

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});
      expect(mc.seek).toHaveBeenCalledTimes(1);

      state.currentTime = 200;
      tick(4);
      await act(async () => {});

      expect(mc.seek).toHaveBeenCalledTimes(1);
    });

    it("ignores a position inside the threshold at either end", async () => {
      // Too close to the start to be worth restoring.
      mockGetWatchProgress.mockResolvedValue({ position: 2, duration: 600 });
      const first = stubController();
      renderHook(() => usePlaybackProgress({ mc: first.mc, fileId: "f1" }));
      tick();
      await act(async () => {});
      expect(first.mc.seek).not.toHaveBeenCalled();

      // Effectively finished: resuming would drop the viewer at the end.
      mockGetWatchProgress.mockResolvedValue({ position: 599, duration: 600 });
      const second = stubController();
      renderHook(() => usePlaybackProgress({ mc: second.mc, fileId: "f2" }));
      tick();
      await act(async () => {});
      expect(second.mc.seek).not.toHaveBeenCalled();
    });

    it("lets initialTime outrank the stored position", async () => {
      // A viewer who clicked a timestamped citation must not be snapped
      // back to where they left off.
      mockGetWatchProgress.mockResolvedValue({ position: 120, duration: 600 });
      const { mc } = stubController();

      renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1", initialTime: 42 }),
      );
      tick();
      await act(async () => {});

      expect(mc.seek).toHaveBeenCalledWith(42);
      expect(mc.seek).toHaveBeenCalledTimes(1);
      // No point paying for the round-trip we are going to ignore.
      expect(mockGetWatchProgress).not.toHaveBeenCalled();
    });

    it("reads the browser-local fallback when no profile is set", async () => {
      withoutProfile();
      mockGetSavedProgress.mockReturnValue(90);
      const { mc } = stubController();

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});

      expect(mockGetSavedProgress).toHaveBeenCalledWith("f1");
      expect(mockGetWatchProgress).not.toHaveBeenCalled();
      expect(mc.seek).toHaveBeenCalledWith(90);
    });

    it("never resumes media whose length never becomes usable", async () => {
      // A live stream. Guessing a position would be worse than not
      // resuming at all.
      mockGetWatchProgress.mockResolvedValue({ position: 120, duration: 600 });
      const { mc } = stubController({ duration: Infinity });

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick(8);
      await act(async () => {});

      expect(mc.seek).not.toHaveBeenCalled();
    });

    it("does not let a periodic save race the restore it is waiting for", async () => {
      // The read is a network round-trip. If playback crosses the save
      // interval before it lands, an unguarded periodic save writes the
      // position being resumed *from*, clobbering the marker itself.
      let resolveRead: (p: { position: number; duration: number }) => void;
      mockGetWatchProgress.mockReturnValue(
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      );
      const { mc, state } = stubController({ currentTime: 1 });

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();

      state.currentTime = 30;
      tick(4);
      expect(mockSaveWatchProgress).not.toHaveBeenCalled();

      await act(async () => {
        resolveRead!({ position: 300, duration: 600 });
      });
      expect(mc.seek).toHaveBeenCalledWith(300);

      // Saving resumes normally once the restore has settled.
      state.currentTime = 320;
      tick();
      expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 320, 600);
    });

    it("does not clobber the stored position by unmounting mid-restore", async () => {
      mockGetWatchProgress.mockReturnValue(new Promise(() => {}));
      const { mc, state } = stubController({ currentTime: 1 });

      const { unmount } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();

      state.currentTime = 12;
      unmount();

      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    });

    it("applies an explicit start without waiting for a length", async () => {
      // A citation jump has no window to check, so it needs no duration
      // and no round-trip.
      const { mc } = stubController({ duration: 0 });

      renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1", initialTime: 42 }),
      );
      tick();
      await act(async () => {});

      expect(mc.seek).toHaveBeenCalledWith(42);
    });

    it("does not immediately re-save the position it just restored", async () => {
      mockGetWatchProgress.mockResolvedValue({ position: 120, duration: 600 });
      const { mc } = stubController();

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});
      expect(mc.seek).toHaveBeenCalledWith(120);

      // Seeding the save threshold with the restored position is what
      // stops the next tick writing back a position never played.
      tick();
      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    });
  });

  describe("periodic save", () => {
    it("writes once playback has moved past the interval", async () => {
      const { mc, state } = stubController({ currentTime: 1 });
      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});

      state.currentTime = 4;
      tick();
      expect(mockSaveWatchProgress).not.toHaveBeenCalled();

      state.currentTime = 7;
      tick();
      expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 7, 600);
    });

    it("writes to the browser-local store when no profile is set", async () => {
      withoutProfile();
      const { mc, state } = stubController({ currentTime: 1 });
      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});

      state.currentTime = 30;
      tick();

      expect(mockSaveProgress).toHaveBeenCalledWith("f1", 30, 600);
      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    });

    it("writes nothing while the backend is interrupted", async () => {
      // During an ad the player's clock belongs to the ad, so persisting
      // it would overwrite the resume point with an ad offset.
      const { mc, state } = stubController({ currentTime: 1 });
      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});

      state.interrupted = true;
      state.currentTime = 300;
      tick(4);

      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    });

    it("writes nothing when the length is not a usable number", async () => {
      const { mc, state } = stubController({ duration: NaN, currentTime: 1 });
      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});

      state.currentTime = 60;
      tick(4);

      // A NaN duration used to reach the server on the native path.
      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
      expect(mockSaveProgress).not.toHaveBeenCalled();
    });
  });

  describe("completion", () => {
    it("records the final position instead of deleting the record", async () => {
      const { mc, state } = stubController({ currentTime: 598 });
      const { result } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});

      state.currentTime = 600;
      act(() => result.current.notifyEnded());

      // The row is what distinguishes "watched to the end" from "never
      // opened"; the 90% gate keeps it out of continue-watching anyway.
      // Spec 2026-08-10-media-import-watch-surface.md §4.2.
      expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 600, 600);
    });

    it("falls back to the length when the clock reads zero at the end", async () => {
      const { mc } = stubController({ currentTime: 0 });
      const { result } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});

      act(() => result.current.notifyEnded());

      expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 600, 600);
    });

    it("fabricates nothing when the length is not a usable number", async () => {
      // Live streams and media that never probed their length land here.
      // Leaving the last periodic save standing beats inventing a
      // completed state.
      const { mc } = stubController({ duration: Infinity, currentTime: 900 });
      const { result } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});

      act(() => result.current.notifyEnded());

      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
      expect(mockSaveProgress).not.toHaveBeenCalled();
    });

    it("ignores an end reported while the backend is interrupted", async () => {
      // YouTube's ENDED fires for a pre-roll too. Without this guard the
      // ad's length is stamped onto the video as a completed watch.
      const { mc, state } = stubController({ currentTime: 15, duration: 15 });
      const { result } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});
      mockSaveWatchProgress.mockClear();

      state.interrupted = true;
      act(() => result.current.notifyEnded());

      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    });
  });

  describe("teardown", () => {
    it("saves the position on unmount", async () => {
      const { mc, state } = stubController({ currentTime: 1 });
      const { unmount } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});

      // Between periodic saves — this is the window audio used to lose.
      state.currentTime = 4;
      unmount();

      expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 4, 600);
    });

    it("does not re-save a position already written", async () => {
      const { mc, state } = stubController({ currentTime: 1 });
      const { unmount } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});

      state.currentTime = 40;
      tick();
      expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);

      unmount();
      expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    });

    it("does not save on unmount while interrupted", async () => {
      const { mc, state } = stubController({ currentTime: 1 });
      const { unmount } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});

      // Leaving mid-ad must not stamp the ad's offset onto the resume
      // point.
      state.interrupted = true;
      state.currentTime = 20;
      unmount();

      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    });

    it("releases the clock on unmount", async () => {
      const { mc } = stubController();
      const { unmount } = renderHook(() =>
        usePlaybackProgress({ mc, fileId: "f1" }),
      );
      tick();
      await act(async () => {});

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("host re-rendering", () => {
    it("never re-renders its host, however long playback runs", async () => {
      const { mc, state } = stubController({ currentTime: 1 });
      let renders = 0;

      renderHook(() => {
        renders += 1;
        return usePlaybackProgress({ mc, fileId: "f1" });
      });
      await act(async () => {});
      const settled = renders;

      state.currentTime = 30;
      tick(8);
      state.currentTime = 90;
      tick(8);

      // All state lives in refs on purpose. Routing it through useState
      // would re-render the whole player four times a second for
      // bookkeeping nobody displays.
      expect(renders).toBe(settled);
      expect(mockSaveWatchProgress).toHaveBeenCalled();
    });
  });

  describe("failure handling", () => {
    it("keeps playing when the stored position cannot be read", async () => {
      mockGetWatchProgress.mockRejectedValue(new Error("offline"));
      const { mc, state } = stubController({ currentTime: 1 });

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});

      expect(mc.seek).not.toHaveBeenCalled();

      // Resume failing must not take periodic saving down with it.
      state.currentTime = 40;
      tick();
      expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 40, 600);
    });

    it("swallows a rejected save", async () => {
      mockSaveWatchProgress.mockRejectedValue(new Error("offline"));
      const { mc, state } = stubController({ currentTime: 1 });

      renderHook(() => usePlaybackProgress({ mc, fileId: "f1" }));
      tick();
      await act(async () => {});

      state.currentTime = 40;
      expect(() => tick()).not.toThrow();
      await act(async () => {});
    });

    it("does nothing at all without a controller", async () => {
      renderHook(() => usePlaybackProgress({ mc: null, fileId: "f1" }));
      tick(4);
      await act(async () => {});

      expect(mockGetWatchProgress).not.toHaveBeenCalled();
      expect(mockSaveWatchProgress).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
