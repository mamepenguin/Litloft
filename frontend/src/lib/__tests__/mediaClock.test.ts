import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  subscribeMediaClock,
  getMediaClockSnapshot,
  useMediaClock,
  MEDIA_CLOCK_ACTIVE_MS,
  MEDIA_CLOCK_IDLE_MS,
} from "../mediaClock";
import type { MediaController } from "../mediaController";

/**
 * Mutable backing state for a stub controller. The clock only reads
 * four things, so the stub only has to be honest about those; the rest
 * of the MediaController surface is present to satisfy the type and is
 * never called.
 */
interface StubState {
  currentTime: number;
  duration: number;
  paused: boolean;
  interrupted: boolean;
  /** When set, every getter throws — the YouTube media-swap case. */
  throwing: boolean;
}

function stubController(
  overrides: Partial<StubState> = {},
): { mc: MediaController; state: StubState } {
  const state: StubState = {
    currentTime: 0,
    duration: 100,
    paused: false,
    interrupted: false,
    throwing: false,
    ...overrides,
  };
  const guard = <T>(read: () => T): T => {
    if (state.throwing) throw new Error("player is swapping media");
    return read();
  };
  const mc: MediaController = {
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: () => guard(() => state.currentTime),
    getDuration: () => guard(() => state.duration),
    isPaused: () => guard(() => state.paused),
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: vi.fn(),
    getPlaybackRate: () => 1,
    setPlaybackRate: vi.fn(),
    getBufferedFraction: () => 0,
    isInterrupted: () => guard(() => state.interrupted),
  };
  return { mc, state };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("mediaClock", () => {
  describe("interval sharing", () => {
    it("runs one interval for two subscribers on the same controller", () => {
      const { mc } = stubController();

      const stopA = subscribeMediaClock(mc, vi.fn());
      const stopB = subscribeMediaClock(mc, vi.fn());

      expect(vi.getTimerCount()).toBe(1);

      stopA();
      stopB();
    });

    it("stops the interval once the last subscriber leaves", () => {
      const { mc } = stubController();

      const stopA = subscribeMediaClock(mc, vi.fn());
      const stopB = subscribeMediaClock(mc, vi.fn());

      stopA();
      // Still one subscriber left — the clock must keep running.
      expect(vi.getTimerCount()).toBe(1);

      stopB();
      // A live timer strongly references its entry, so failing to clear
      // it here would defeat the WeakMap keying entirely.
      expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps a separate interval and snapshot per controller", () => {
      const a = stubController({ currentTime: 10 });
      const b = stubController({ currentTime: 50 });

      const stopA = subscribeMediaClock(a.mc, vi.fn());
      const stopB = subscribeMediaClock(b.mc, vi.fn());

      expect(vi.getTimerCount()).toBe(2);

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);

      expect(getMediaClockSnapshot(a.mc).currentTime).toBe(10);
      expect(getMediaClockSnapshot(b.mc).currentTime).toBe(50);

      // One controller tearing down must not stop the other's clock.
      stopA();
      expect(vi.getTimerCount()).toBe(1);

      stopB();
    });
  });

  describe("rate policy", () => {
    it("ticks at the active rate while playing", () => {
      const { mc } = stubController({ paused: false });
      const listener = vi.fn();
      const stop = subscribeMediaClock(mc, listener);

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).toHaveBeenCalledTimes(2);

      stop();
    });

    it("drops to the idle rate when playback pauses, and back on resume", () => {
      const { mc, state } = stubController({ paused: false });
      const listener = vi.fn();
      const stop = subscribeMediaClock(mc, listener);

      state.paused = true;
      // The tick that observes the pause still happens at the active
      // rate; the slowdown applies from the next one.
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).toHaveBeenCalledTimes(1);

      listener.mockClear();
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(MEDIA_CLOCK_IDLE_MS - MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).toHaveBeenCalledTimes(1);

      // A paused player can start again without telling us — a keyboard
      // shortcut, an ad ending, autoplay — which is why the clock never
      // stops entirely while subscribed.
      state.paused = false;
      listener.mockClear();
      vi.advanceTimersByTime(MEDIA_CLOCK_IDLE_MS);
      expect(listener).toHaveBeenCalledTimes(1);

      listener.mockClear();
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).toHaveBeenCalledTimes(1);

      stop();
    });
  });

  describe("snapshot identity", () => {
    it("returns the identical reference while nothing changes", () => {
      const { mc } = stubController();
      const stop = subscribeMediaClock(mc, vi.fn());

      const first = getMediaClockSnapshot(mc);
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 3);
      const second = getMediaClockSnapshot(mc);

      // A fresh object per call would make useSyncExternalStore
      // re-render forever.
      expect(second).toBe(first);

      stop();
    });

    it("returns a new reference once a value actually moves", () => {
      const { mc, state } = stubController();
      const stop = subscribeMediaClock(mc, vi.fn());

      const first = getMediaClockSnapshot(mc);
      state.currentTime = 12;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      const second = getMediaClockSnapshot(mc);

      expect(second).not.toBe(first);
      expect(second.currentTime).toBe(12);

      stop();
    });

    it("reads the controller once up front so the first snapshot is real", () => {
      const { mc } = stubController({ currentTime: 7, paused: true });

      // No tick has run yet: a consumer that mounts and reads before the
      // first interval fires must not see a zeroed placeholder.
      expect(getMediaClockSnapshot(mc)).toMatchObject({
        currentTime: 7,
        paused: true,
      });
    });

    it("reports an unusable duration as 0", () => {
      const { mc } = stubController({ duration: NaN });
      expect(getMediaClockSnapshot(mc).duration).toBe(0);

      const live = stubController({ duration: Infinity });
      expect(getMediaClockSnapshot(live.mc).duration).toBe(0);
    });

    it("treats a controller with no isInterrupted as never interrupted", () => {
      const { mc } = stubController();
      const noDetector: MediaController = { ...mc };
      delete (noDetector as { isInterrupted?: unknown }).isInterrupted;

      expect(getMediaClockSnapshot(noDetector).interrupted).toBe(false);
    });
  });

  describe("notification", () => {
    it("notifies on every tick, not only when the snapshot changes", () => {
      const { mc } = stubController();
      const listener = vi.fn();
      const stop = subscribeMediaClock(mc, listener);

      // Nothing moves, so the snapshot reference is stable — but a
      // consumer sampling fields the shared snapshot excludes (volume,
      // captions) still needs the tick.
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 3);

      expect(listener).toHaveBeenCalledTimes(3);
      expect(getMediaClockSnapshot(mc)).toBe(getMediaClockSnapshot(mc));

      stop();
    });

    it("does not deliver the in-flight tick to a listener that subscribes during it", () => {
      const { mc } = stubController();
      const latecomer = vi.fn();
      let stopLate = () => {};
      const first = vi.fn(() => {
        stopLate = subscribeMediaClock(mc, latecomer);
      });
      const stopFirst = subscribeMediaClock(mc, first);

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);

      // Iterating the live Set would hand this tick to a subscriber
      // whose own effect had not finished yet.
      expect(first).toHaveBeenCalledTimes(1);
      expect(latecomer).not.toHaveBeenCalled();

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(latecomer).toHaveBeenCalledTimes(1);

      stopFirst();
      stopLate();
    });

    it("does not deliver a tick to a listener unsubscribed earlier in the same tick", () => {
      const { mc } = stubController();
      const doomed = vi.fn();
      let stopDoomed = () => {};
      const first = vi.fn(() => stopDoomed());
      const stopFirst = subscribeMediaClock(mc, first);
      stopDoomed = subscribeMediaClock(mc, doomed);

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);

      expect(first).toHaveBeenCalledTimes(1);
      expect(doomed).not.toHaveBeenCalled();

      stopFirst();
    });

    it("stops notifying a listener after it unsubscribes", () => {
      const { mc } = stubController();
      const stays = vi.fn();
      const leaves = vi.fn();
      const stopStays = subscribeMediaClock(mc, stays);
      const stopLeaves = subscribeMediaClock(mc, leaves);

      stopLeaves();
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);

      expect(stays).toHaveBeenCalledTimes(1);
      expect(leaves).not.toHaveBeenCalled();

      stopStays();
    });
  });

  describe("failure handling", () => {
    it("keeps the previous snapshot when the controller throws", () => {
      const { mc, state } = stubController({ currentTime: 30 });
      const stop = subscribeMediaClock(mc, vi.fn());

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      const before = getMediaClockSnapshot(mc);
      expect(before.currentTime).toBe(30);

      state.throwing = true;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 2);

      // Blanking the reading would make every consumer flicker to zero
      // while the player swaps media.
      expect(getMediaClockSnapshot(mc)).toBe(before);

      stop();
    });

    it("does not notify listeners on a tick that threw", () => {
      const { mc, state } = stubController();
      const listener = vi.fn();
      const stop = subscribeMediaClock(mc, listener);

      state.throwing = true;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 2);

      // Consumers that sample extra fields in their listener would hit
      // the same throw, so a failed read is not a tick worth reporting.
      expect(listener).not.toHaveBeenCalled();

      stop();
    });

    it("resumes ticking once the controller recovers", () => {
      const { mc, state } = stubController();
      const listener = vi.fn();
      const stop = subscribeMediaClock(mc, listener);

      state.throwing = true;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).not.toHaveBeenCalled();

      state.throwing = false;
      state.currentTime = 5;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(getMediaClockSnapshot(mc).currentTime).toBe(5);

      stop();
    });

    it("survives a controller that throws before anyone subscribes", () => {
      const { mc } = stubController({ throwing: true });

      expect(getMediaClockSnapshot(mc)).toMatchObject({
        currentTime: 0,
        duration: 0,
        paused: true,
        interrupted: false,
      });
    });
  });

  describe("useMediaClock", () => {
    it("exposes the snapshot and updates it as playback moves", () => {
      const { mc, state } = stubController({ currentTime: 3 });

      const { result } = renderHook(() => useMediaClock(mc));
      expect(result.current.currentTime).toBe(3);

      state.currentTime = 8;
      act(() => {
        vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      });

      expect(result.current.currentTime).toBe(8);
    });

    it("does not re-render while the snapshot is unchanged", () => {
      const { mc } = stubController();
      let renders = 0;

      renderHook(() => {
        renders += 1;
        return useMediaClock(mc);
      });
      const initial = renders;

      act(() => {
        vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 4);
      });

      // Four ticks fired and every listener ran; the stable snapshot
      // reference is what keeps React out of it.
      expect(renders).toBe(initial);
    });

    it("starts no clock for a null controller", () => {
      const { result } = renderHook(() => useMediaClock(null));

      expect(vi.getTimerCount()).toBe(0);
      expect(result.current).toMatchObject({
        currentTime: 0,
        duration: 0,
        paused: true,
        interrupted: false,
      });
    });

    it("stops the previous clock when the controller is swapped", () => {
      const first = stubController({ currentTime: 1 });
      const second = stubController({ currentTime: 99 });

      const { result, rerender } = renderHook(
        ({ mc }: { mc: MediaController }) => useMediaClock(mc),
        { initialProps: { mc: first.mc } },
      );
      expect(vi.getTimerCount()).toBe(1);

      rerender({ mc: second.mc });

      // The old controller's interval must go, not accumulate.
      expect(vi.getTimerCount()).toBe(1);
      expect(result.current.currentTime).toBe(99);
    });

    it("releases the clock on unmount", () => {
      const { mc } = stubController();
      const { unmount } = renderHook(() => useMediaClock(mc));
      expect(vi.getTimerCount()).toBe(1);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("resubscription", () => {
    it("parks the snapshot while nobody is watching, and refreshes on resubscribe", () => {
      const { mc, state } = stubController({ currentTime: 20 });

      const stop = subscribeMediaClock(mc, vi.fn());
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      stop();

      const parked = getMediaClockSnapshot(mc);
      expect(parked.currentTime).toBe(20);

      // Nothing runs while unsubscribed, so a moving player goes
      // unobserved until someone cares again. getMediaClockSnapshot
      // cannot read on demand: useSyncExternalStore calls it repeatedly
      // within one render and throws if the answers disagree.
      state.currentTime = 40;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 4);
      expect(getMediaClockSnapshot(mc)).toBe(parked);

      const stopAgain = subscribeMediaClock(mc, vi.fn());
      expect(vi.getTimerCount()).toBe(1);
      // Refreshed at subscribe time rather than one interval later.
      expect(getMediaClockSnapshot(mc).currentTime).toBe(40);

      stopAgain();
    });

    it("picks the rate from a fresh reading, not the parked one", () => {
      const { mc, state } = stubController({ paused: true });

      const stop = subscribeMediaClock(mc, vi.fn());
      vi.advanceTimersByTime(MEDIA_CLOCK_IDLE_MS);
      stop();

      // Playback started while nothing was subscribed. Trusting the
      // parked `paused` would put a playing video on the 1s heartbeat.
      state.paused = false;
      const listener = vi.fn();
      const stopAgain = subscribeMediaClock(mc, listener);

      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(listener).toHaveBeenCalledTimes(1);

      stopAgain();
    });
  });
});
