import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupMediaSession } from "../mediaSession";
import { MEDIA_CLOCK_ACTIVE_MS } from "../mediaClock";
import type { MediaController } from "../mediaController";

class FakeMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: MediaImage[];
  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? "";
    this.artist = init.artist ?? "";
    this.album = init.album ?? "";
    this.artwork = (init.artwork ?? []) as MediaImage[];
  }
}

type Handler = ((details: MediaSessionActionDetails) => void) | null;

function fakeMediaSession() {
  const handlers: Record<string, Handler> = {};
  return {
    handlers,
    setActionHandler: vi.fn((action: string, h: Handler) => {
      handlers[action] = h;
    }),
    setPositionState: vi.fn(),
    metadata: null as FakeMetadata | null,
    playbackState: "none" as MediaSessionPlaybackState,
  };
}

/** Older browsers expose Media Session without the position API. */
function fakeMediaSessionWithoutPositionState() {
  return { ...fakeMediaSession(), setPositionState: undefined };
}

interface StubState {
  currentTime: number;
  duration: number;
  paused: boolean;
  interrupted: boolean;
  playbackRate: number;
}

function stubController(overrides: Partial<StubState> = {}) {
  const state: StubState = {
    currentTime: 0,
    duration: 100,
    paused: true,
    interrupted: false,
    playbackRate: 1,
    ...overrides,
  };
  const mc: MediaController = {
    // The real controllers clamp inside seek(); that is verified in
    // mediaController.test.ts. Here the stub records what was asked for,
    // which is what this module is responsible for computing.
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
    getPlaybackRate: () => state.playbackRate,
    setPlaybackRate: vi.fn(),
    getBufferedFraction: () => 0,
    isInterrupted: () => state.interrupted,
  };
  return { mc, state };
}

const originalMediaSession = navigator.mediaSession;
const originalMetadata = (window as unknown as { MediaMetadata?: unknown }).MediaMetadata;

function session() {
  return navigator.mediaSession as unknown as ReturnType<typeof fakeMediaSession>;
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "mediaSession", {
    configurable: true,
    value: fakeMediaSession(),
  });
  (window as unknown as { MediaMetadata: unknown }).MediaMetadata = FakeMetadata;
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, "mediaSession", {
    configurable: true,
    value: originalMediaSession,
  });
  (window as unknown as { MediaMetadata?: unknown }).MediaMetadata = originalMetadata;
});

describe("setupMediaSession", () => {
  it("sets metadata", () => {
    const { mc } = stubController();
    const stop = setupMediaSession(mc, {
      title: "song",
      artist: "artist",
      artwork: [{ src: "x.jpg" }],
    });
    const ms = session();
    expect(ms.metadata?.title).toBe("song");
    expect(ms.metadata?.artist).toBe("artist");
    expect(ms.metadata?.artwork[0]?.src).toBe("x.jpg");
    stop();
  });

  it("registers play and pause handlers", () => {
    const { mc } = stubController();
    const stop = setupMediaSession(mc, { title: "t" });
    const ms = session();
    ms.handlers.play?.({} as MediaSessionActionDetails);
    expect(mc.play).toHaveBeenCalled();
    ms.handlers.pause?.({} as MediaSessionActionDetails);
    expect(mc.pause).toHaveBeenCalled();
    stop();
  });

  it("registers nexttrack only when handler is provided", () => {
    const onNext = vi.fn();
    const { mc } = stubController();
    const stop = setupMediaSession(mc, { title: "t" }, { onNextTrack: onNext });
    session().handlers.nexttrack?.({} as MediaSessionActionDetails);
    expect(onNext).toHaveBeenCalled();
    stop();
  });

  it("omits nexttrack handler when callback is absent", () => {
    const { mc } = stubController();
    const stop = setupMediaSession(mc, { title: "t" });
    const calls = session().setActionHandler.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("nexttrack");
    stop();
  });

  it("seeks forward and backward with default offset", () => {
    const { mc } = stubController({ currentTime: 50 });
    const stop = setupMediaSession(mc, { title: "t" });
    const ms = session();
    ms.handlers.seekforward?.({} as MediaSessionActionDetails);
    expect(mc.seek).toHaveBeenLastCalledWith(60);
    ms.handlers.seekbackward?.({} as MediaSessionActionDetails);
    expect(mc.seek).toHaveBeenLastCalledWith(50);
    stop();
  });

  it("honours an explicit seek offset and target", () => {
    const { mc } = stubController({ currentTime: 50 });
    const stop = setupMediaSession(mc, { title: "t" });
    const ms = session();
    ms.handlers.seekforward?.({ seekOffset: 30 } as MediaSessionActionDetails);
    expect(mc.seek).toHaveBeenLastCalledWith(80);
    ms.handlers.seekto?.({ seekTime: 12 } as MediaSessionActionDetails);
    expect(mc.seek).toHaveBeenLastCalledWith(12);
    stop();
  });

  it("ignores a seekto with no target", () => {
    const { mc } = stubController();
    const stop = setupMediaSession(mc, { title: "t" });
    session().handlers.seekto?.({} as MediaSessionActionDetails);
    expect(mc.seek).not.toHaveBeenCalled();
    stop();
  });

  it("reflects play state from the clock", () => {
    const { mc, state } = stubController({ paused: true });
    const stop = setupMediaSession(mc, { title: "t" });
    expect(session().playbackState).toBe("paused");

    state.paused = false;
    // No DOM events involved: the clock is what tells us.
    vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 4);
    expect(session().playbackState).toBe("playing");

    state.paused = true;
    vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 4);
    expect(session().playbackState).toBe("paused");
    stop();
  });

  describe("position state", () => {
    it("publishes the scrubber position and keeps it current", () => {
      const { mc, state } = stubController({
        currentTime: 5,
        duration: 100,
        paused: false,
        playbackRate: 1.5,
      });
      const stop = setupMediaSession(mc, { title: "t" });

      expect(session().setPositionState).toHaveBeenLastCalledWith({
        duration: 100,
        position: 5,
        playbackRate: 1.5,
      });

      state.currentTime = 40;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS);
      expect(session().setPositionState).toHaveBeenLastCalledWith({
        duration: 100,
        position: 40,
        playbackRate: 1.5,
      });
      stop();
    });

    it("says nothing when the length is unknowable", () => {
      // Live streams and un-probed media. Publishing a timeline here
      // would be inventing one, and setPositionState throws on it.
      const { mc } = stubController({ duration: Infinity, currentTime: 30 });
      const stop = setupMediaSession(mc, { title: "t" });
      expect(session().setPositionState).not.toHaveBeenCalled();
      stop();
    });

    it("holds the last reading while the backend is interrupted", () => {
      const { mc, state } = stubController({
        currentTime: 10,
        duration: 100,
        paused: false,
      });
      const stop = setupMediaSession(mc, { title: "t" });
      const ms = session();
      const before = ms.setPositionState.mock.calls.length;

      // An ad's clock is not the file's, so publishing it would put the
      // interruption's timeline on the lock screen.
      state.interrupted = true;
      state.currentTime = 3;
      state.duration = 15;
      vi.advanceTimersByTime(MEDIA_CLOCK_ACTIVE_MS * 4);

      expect(ms.setPositionState.mock.calls.length).toBe(before);
      stop();
    });

    it("clamps a position that overruns the length", () => {
      // setPositionState throws when position > duration.
      const { mc } = stubController({ currentTime: 120, duration: 100 });
      const stop = setupMediaSession(mc, { title: "t" });
      expect(session().setPositionState).toHaveBeenLastCalledWith(
        expect.objectContaining({ position: 100 }),
      );
      stop();
    });

    it("substitutes a usable rate when the backend reports nonsense", () => {
      // A non-positive rate is another way to make setPositionState throw.
      const { mc } = stubController({ playbackRate: 0, duration: 100 });
      const stop = setupMediaSession(mc, { title: "t" });
      expect(session().setPositionState).toHaveBeenLastCalledWith(
        expect.objectContaining({ playbackRate: 1 }),
      );
      stop();
    });

    it("survives a browser that rejects the call", () => {
      const ms = session();
      ms.setPositionState.mockImplementation(() => {
        throw new Error("not supported like that");
      });
      const { mc } = stubController({ duration: 100 });
      expect(() => setupMediaSession(mc, { title: "t" })()).not.toThrow();
    });

    it("skips position reporting where the browser has no such API", () => {
      Object.defineProperty(navigator, "mediaSession", {
        configurable: true,
        value: fakeMediaSessionWithoutPositionState(),
      });
      const { mc } = stubController({ duration: 100 });
      // Everything else still works; only the scrubber goes missing.
      const stop = setupMediaSession(mc, { title: "t" });
      expect(session().playbackState).toBe("paused");
      stop();
    });
  });

  it("cleans up handlers, metadata and the clock subscription", () => {
    const { mc } = stubController();
    const cleanup = setupMediaSession(mc, { title: "t" }, { onNextTrack: () => {} });
    expect(vi.getTimerCount()).toBe(1);

    cleanup();

    const ms = session();
    expect(ms.handlers.play).toBeNull();
    expect(ms.handlers.nexttrack).toBeNull();
    expect(ms.metadata).toBeNull();
    expect(ms.playbackState).toBe("none");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is a no-op when MediaSession API is unavailable", () => {
    Object.defineProperty(navigator, "mediaSession", { configurable: true, value: undefined });
    const { mc } = stubController();
    expect(() => setupMediaSession(mc, { title: "t" })()).not.toThrow();
    // Nothing to poll for, so nothing was started.
    expect(vi.getTimerCount()).toBe(0);
  });
});
