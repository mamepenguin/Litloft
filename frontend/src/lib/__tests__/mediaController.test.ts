import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createNativeVideoController,
  createYouTubeController,
  type MediaController,
} from "../mediaController";

// ---------- helpers ----------

type FakeVideo = HTMLVideoElement & {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  requestFullscreen: ReturnType<typeof vi.fn>;
};

/**
 * Minimal TimeRanges stub. Only `length` and `end(i)` are consumed by
 * getBufferedFraction, which reads the LAST range rather than summing
 * every range: the seek bar shows "buffered up to here", and a video
 * seeked backwards leaves earlier ranges that would otherwise inflate
 * the number past what is contiguously available.
 */
function fakeBuffered(ends: number[]): TimeRanges {
  return {
    length: ends.length,
    start: () => 0,
    end: (i: number) => ends[i],
  } as unknown as TimeRanges;
}

function fakeVideo(overrides: Partial<HTMLVideoElement> = {}): FakeVideo {
  const base = {
    paused: true,
    muted: false,
    currentTime: 0,
    duration: 100,
    volume: 1,
    playbackRate: 1,
    buffered: fakeBuffered([]),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    requestFullscreen: vi.fn().mockResolvedValue(undefined),
  };
  return Object.assign(base, overrides) as unknown as FakeVideo;
}

type FakeYTPlayer = {
  seekTo: ReturnType<typeof vi.fn>;
  playVideo: ReturnType<typeof vi.fn>;
  pauseVideo: ReturnType<typeof vi.fn>;
  mute: ReturnType<typeof vi.fn>;
  unMute: ReturnType<typeof vi.fn>;
  isMuted: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  getDuration: ReturnType<typeof vi.fn>;
  getPlayerState: ReturnType<typeof vi.fn>;
  getVolume: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  getPlaybackRate: ReturnType<typeof vi.fn>;
  setPlaybackRate: ReturnType<typeof vi.fn>;
  getVideoLoadedFraction: ReturnType<typeof vi.fn>;
};

function fakeYTPlayer(overrides: Partial<FakeYTPlayer> = {}): FakeYTPlayer {
  return {
    seekTo: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    mute: vi.fn(),
    unMute: vi.fn(),
    isMuted: vi.fn().mockReturnValue(false),
    getCurrentTime: vi.fn().mockReturnValue(0),
    getDuration: vi.fn().mockReturnValue(100),
    // 1 = playing, 2 = paused, 0 = ended, -1 = unstarted, 3 = buffering, 5 = cued
    getPlayerState: vi.fn().mockReturnValue(2),
    // YouTube reports volume on a 0-100 scale, unlike HTMLMediaElement's 0-1.
    getVolume: vi.fn().mockReturnValue(100),
    setVolume: vi.fn(),
    getPlaybackRate: vi.fn().mockReturnValue(1),
    setPlaybackRate: vi.fn(),
    getVideoLoadedFraction: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

function makeContainer(): HTMLElement & { requestFullscreen: ReturnType<typeof vi.fn> } {
  const el = document.createElement("div");
  const stub = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(el, "requestFullscreen", {
    configurable: true,
    value: stub,
  });
  return el as unknown as HTMLElement & {
    requestFullscreen: ReturnType<typeof vi.fn>;
  };
}

// jsdom doesn't implement fullscreen API; back it with a mutable holder.
const originalExitFullscreen = document.exitFullscreen;
const originalFullscreenElement = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "fullscreenElement",
);

let fullscreenElementHolder: Element | null = null;
const exitFullscreenMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  fullscreenElementHolder = null;
  exitFullscreenMock.mockClear();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElementHolder,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exitFullscreenMock,
  });
});

afterEach(() => {
  if (originalFullscreenElement) {
    Object.defineProperty(Document.prototype, "fullscreenElement", originalFullscreenElement);
  }
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: originalExitFullscreen,
  });
});

// ---------- createNativeVideoController ----------

describe("createNativeVideoController", () => {
  describe("seek", () => {
    it("sets currentTime to the given seconds", () => {
      const video = fakeVideo({ currentTime: 0, duration: 100 } as Partial<HTMLVideoElement>);
      const mc = createNativeVideoController(video);
      mc.seek(42);
      expect(video.currentTime).toBe(42);
    });

    it("clamps negative seek to 0", () => {
      const video = fakeVideo({ currentTime: 10, duration: 100 } as Partial<HTMLVideoElement>);
      const mc = createNativeVideoController(video);
      mc.seek(-5);
      expect(video.currentTime).toBe(0);
    });

    it("clamps seek beyond duration to duration", () => {
      const video = fakeVideo({ currentTime: 10, duration: 100 } as Partial<HTMLVideoElement>);
      const mc = createNativeVideoController(video);
      mc.seek(500);
      expect(video.currentTime).toBe(100);
    });
  });

  describe("play / pause / togglePlay", () => {
    it("play() calls video.play()", () => {
      const video = fakeVideo();
      createNativeVideoController(video).play();
      expect(video.play).toHaveBeenCalledTimes(1);
    });

    it("pause() calls video.pause()", () => {
      const video = fakeVideo();
      createNativeVideoController(video).pause();
      expect(video.pause).toHaveBeenCalledTimes(1);
    });

    it("togglePlay() calls play when paused", () => {
      const video = fakeVideo({ paused: true } as Partial<HTMLVideoElement>);
      createNativeVideoController(video).togglePlay();
      expect(video.play).toHaveBeenCalledTimes(1);
      expect(video.pause).not.toHaveBeenCalled();
    });

    it("togglePlay() calls pause when playing", () => {
      const video = fakeVideo({ paused: false } as Partial<HTMLVideoElement>);
      createNativeVideoController(video).togglePlay();
      expect(video.pause).toHaveBeenCalledTimes(1);
      expect(video.play).not.toHaveBeenCalled();
    });
  });

  describe("toggleMute", () => {
    it("flips muted from false to true", () => {
      const video = fakeVideo({ muted: false } as Partial<HTMLVideoElement>);
      createNativeVideoController(video).toggleMute();
      expect(video.muted).toBe(true);
    });

    it("flips muted from true to false", () => {
      const video = fakeVideo({ muted: true } as Partial<HTMLVideoElement>);
      createNativeVideoController(video).toggleMute();
      expect(video.muted).toBe(false);
    });
  });

  describe("toggleFullscreen", () => {
    it("requests fullscreen on the video when no fullscreen element exists", () => {
      const video = fakeVideo();
      fullscreenElementHolder = null;
      createNativeVideoController(video).toggleFullscreen();
      expect(video.requestFullscreen).toHaveBeenCalledTimes(1);
      expect(exitFullscreenMock).not.toHaveBeenCalled();
    });

    it("exits fullscreen when a fullscreen element is active", () => {
      const video = fakeVideo();
      fullscreenElementHolder = document.createElement("div");
      createNativeVideoController(video).toggleFullscreen();
      expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
      expect(video.requestFullscreen).not.toHaveBeenCalled();
    });
  });

  describe("getters", () => {
    it("getCurrentTime returns video.currentTime", () => {
      const video = fakeVideo({ currentTime: 33 } as Partial<HTMLVideoElement>);
      expect(createNativeVideoController(video).getCurrentTime()).toBe(33);
    });

    it("getDuration returns video.duration", () => {
      const video = fakeVideo({ duration: 250 } as Partial<HTMLVideoElement>);
      expect(createNativeVideoController(video).getDuration()).toBe(250);
    });

    it("isPaused returns video.paused", () => {
      const a = fakeVideo({ paused: true } as Partial<HTMLVideoElement>);
      const b = fakeVideo({ paused: false } as Partial<HTMLVideoElement>);
      expect(createNativeVideoController(a).isPaused()).toBe(true);
      expect(createNativeVideoController(b).isPaused()).toBe(false);
    });
  });
});

// ---------- createYouTubeController ----------

describe("createYouTubeController", () => {
  describe("seek", () => {
    it("calls player.seekTo(seconds, true)", () => {
      const player = fakeYTPlayer({ getDuration: vi.fn().mockReturnValue(100) });
      const mc = createYouTubeController(player, makeContainer());
      mc.seek(42);
      expect(player.seekTo).toHaveBeenCalledWith(42, true);
    });

    it("clamps negative seek to 0", () => {
      const player = fakeYTPlayer({ getDuration: vi.fn().mockReturnValue(100) });
      const mc = createYouTubeController(player, makeContainer());
      mc.seek(-10);
      expect(player.seekTo).toHaveBeenCalledWith(0, true);
    });

    it("clamps seek beyond duration to duration", () => {
      const player = fakeYTPlayer({ getDuration: vi.fn().mockReturnValue(100) });
      const mc = createYouTubeController(player, makeContainer());
      mc.seek(500);
      expect(player.seekTo).toHaveBeenCalledWith(100, true);
    });
  });

  describe("play / pause / togglePlay", () => {
    it("play() calls player.playVideo()", () => {
      const player = fakeYTPlayer();
      createYouTubeController(player, makeContainer()).play();
      expect(player.playVideo).toHaveBeenCalledTimes(1);
    });

    it("pause() calls player.pauseVideo()", () => {
      const player = fakeYTPlayer();
      createYouTubeController(player, makeContainer()).pause();
      expect(player.pauseVideo).toHaveBeenCalledTimes(1);
    });

    it("togglePlay() plays when state is paused (2)", () => {
      const player = fakeYTPlayer({ getPlayerState: vi.fn().mockReturnValue(2) });
      createYouTubeController(player, makeContainer()).togglePlay();
      expect(player.playVideo).toHaveBeenCalledTimes(1);
      expect(player.pauseVideo).not.toHaveBeenCalled();
    });

    it("togglePlay() plays when state is ended (0)", () => {
      const player = fakeYTPlayer({ getPlayerState: vi.fn().mockReturnValue(0) });
      createYouTubeController(player, makeContainer()).togglePlay();
      expect(player.playVideo).toHaveBeenCalledTimes(1);
    });

    it("togglePlay() pauses when state is playing (1)", () => {
      const player = fakeYTPlayer({ getPlayerState: vi.fn().mockReturnValue(1) });
      createYouTubeController(player, makeContainer()).togglePlay();
      expect(player.pauseVideo).toHaveBeenCalledTimes(1);
      expect(player.playVideo).not.toHaveBeenCalled();
    });
  });

  describe("toggleMute", () => {
    it("calls mute() when not muted", () => {
      const player = fakeYTPlayer({ isMuted: vi.fn().mockReturnValue(false) });
      createYouTubeController(player, makeContainer()).toggleMute();
      expect(player.mute).toHaveBeenCalledTimes(1);
      expect(player.unMute).not.toHaveBeenCalled();
    });

    it("calls unMute() when muted", () => {
      const player = fakeYTPlayer({ isMuted: vi.fn().mockReturnValue(true) });
      createYouTubeController(player, makeContainer()).toggleMute();
      expect(player.unMute).toHaveBeenCalledTimes(1);
      expect(player.mute).not.toHaveBeenCalled();
    });
  });

  describe("toggleFullscreen", () => {
    it("requests fullscreen on the container when no fullscreen element exists", () => {
      const player = fakeYTPlayer();
      const container = makeContainer();
      fullscreenElementHolder = null;
      createYouTubeController(player, container).toggleFullscreen();
      expect(container.requestFullscreen).toHaveBeenCalledTimes(1);
      expect(exitFullscreenMock).not.toHaveBeenCalled();
    });

    it("exits fullscreen when a fullscreen element is active", () => {
      const player = fakeYTPlayer();
      const container = makeContainer();
      fullscreenElementHolder = document.createElement("div");
      createYouTubeController(player, container).toggleFullscreen();
      expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
      expect(container.requestFullscreen).not.toHaveBeenCalled();
    });
  });

  describe("getters", () => {
    it("getCurrentTime returns player.getCurrentTime()", () => {
      const player = fakeYTPlayer({ getCurrentTime: vi.fn().mockReturnValue(77) });
      expect(createYouTubeController(player, makeContainer()).getCurrentTime()).toBe(77);
    });

    it("getDuration returns player.getDuration()", () => {
      const player = fakeYTPlayer({ getDuration: vi.fn().mockReturnValue(321) });
      expect(createYouTubeController(player, makeContainer()).getDuration()).toBe(321);
    });

    it("isPaused returns true when state is paused (2)", () => {
      const player = fakeYTPlayer({ getPlayerState: vi.fn().mockReturnValue(2) });
      expect(createYouTubeController(player, makeContainer()).isPaused()).toBe(true);
    });

    it("isPaused returns false when state is playing (1)", () => {
      const player = fakeYTPlayer({ getPlayerState: vi.fn().mockReturnValue(1) });
      expect(createYouTubeController(player, makeContainer()).isPaused()).toBe(false);
    });

    it("isPaused returns false when state is buffering (3) — a seek-in-progress is not a pause", () => {
      const player = fakeYTPlayer({ getPlayerState: vi.fn().mockReturnValue(3) });
      expect(createYouTubeController(player, makeContainer()).isPaused()).toBe(false);
    });

    it("isPaused returns true for ended (0), cued (5), unstarted (-1)", () => {
      for (const state of [0, 5, -1]) {
        const player = fakeYTPlayer({ getPlayerState: vi.fn().mockReturnValue(state) });
        expect(createYouTubeController(player, makeContainer()).isPaused()).toBe(true);
      }
    });
  });
});

// ---------- volume / rate / buffer (native) ----------

describe("createNativeVideoController extended controls", () => {
  describe("isMuted", () => {
    it("mirrors the element's muted flag", () => {
      expect(createNativeVideoController(fakeVideo({ muted: true })).isMuted()).toBe(true);
      expect(createNativeVideoController(fakeVideo({ muted: false })).isMuted()).toBe(false);
    });
  });

  describe("volume", () => {
    it("reads the element volume as-is (already 0-1)", () => {
      expect(createNativeVideoController(fakeVideo({ volume: 0.4 })).getVolume()).toBe(0.4);
    });

    it("writes the element volume as-is", () => {
      const video = fakeVideo({ volume: 1 });
      createNativeVideoController(video).setVolume(0.25);
      expect(video.volume).toBe(0.25);
    });

    it("clamps out-of-range values into 0-1", () => {
      const video = fakeVideo();
      const mc = createNativeVideoController(video);
      mc.setVolume(1.7);
      expect(video.volume).toBe(1);
      mc.setVolume(-0.3);
      expect(video.volume).toBe(0);
    });

    it("ignores non-finite values rather than corrupting the element", () => {
      const video = fakeVideo({ volume: 0.5 });
      createNativeVideoController(video).setVolume(Number.NaN);
      expect(video.volume).toBe(0.5);
    });
  });

  describe("playbackRate", () => {
    it("reads and writes the element playbackRate", () => {
      const video = fakeVideo({ playbackRate: 1 });
      const mc = createNativeVideoController(video);
      mc.setPlaybackRate(1.5);
      expect(video.playbackRate).toBe(1.5);
      expect(mc.getPlaybackRate()).toBe(1.5);
    });

    it("ignores non-positive or non-finite rates", () => {
      const video = fakeVideo({ playbackRate: 1 });
      const mc = createNativeVideoController(video);
      mc.setPlaybackRate(0);
      mc.setPlaybackRate(-2);
      mc.setPlaybackRate(Number.NaN);
      expect(video.playbackRate).toBe(1);
    });
  });

  describe("getBufferedFraction", () => {
    it("uses the END of the LAST buffered range over the duration", () => {
      const video = fakeVideo({ duration: 200, buffered: fakeBuffered([10, 50]) });
      expect(createNativeVideoController(video).getBufferedFraction()).toBe(0.25);
    });

    it("returns 0 when nothing is buffered yet", () => {
      const video = fakeVideo({ duration: 200, buffered: fakeBuffered([]) });
      expect(createNativeVideoController(video).getBufferedFraction()).toBe(0);
    });

    it("returns 0 when duration is not yet known", () => {
      for (const duration of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
        const video = fakeVideo({ duration, buffered: fakeBuffered([10]) });
        expect(createNativeVideoController(video).getBufferedFraction()).toBe(0);
      }
    });

    it("clamps to 1 when the buffered end overshoots the duration", () => {
      const video = fakeVideo({ duration: 100, buffered: fakeBuffered([120]) });
      expect(createNativeVideoController(video).getBufferedFraction()).toBe(1);
    });
  });

  describe("isInterrupted", () => {
    it("is not implemented for native media (nothing interrupts an owned file)", () => {
      expect(createNativeVideoController(fakeVideo()).isInterrupted).toBeUndefined();
    });
  });
});

// ---------- volume / rate / buffer (YouTube) ----------

describe("createYouTubeController extended controls", () => {
  describe("isMuted", () => {
    it("delegates to the player", () => {
      const player = fakeYTPlayer({ isMuted: vi.fn().mockReturnValue(true) });
      expect(createYouTubeController(player, makeContainer()).isMuted()).toBe(true);
    });
  });

  describe("volume", () => {
    it("normalises the player's 0-100 scale down to 0-1 on read", () => {
      const player = fakeYTPlayer({ getVolume: vi.fn().mockReturnValue(35) });
      expect(createYouTubeController(player, makeContainer()).getVolume()).toBeCloseTo(0.35);
    });

    it("scales 0-1 up to the player's 0-100 on write", () => {
      const player = fakeYTPlayer();
      createYouTubeController(player, makeContainer()).setVolume(0.6);
      expect(player.setVolume).toHaveBeenCalledWith(60);
    });

    it("clamps out-of-range values before scaling", () => {
      const player = fakeYTPlayer();
      const mc = createYouTubeController(player, makeContainer());
      mc.setVolume(4);
      expect(player.setVolume).toHaveBeenLastCalledWith(100);
      mc.setVolume(-1);
      expect(player.setVolume).toHaveBeenLastCalledWith(0);
    });

    it("does not call the player at all for non-finite values", () => {
      const player = fakeYTPlayer();
      createYouTubeController(player, makeContainer()).setVolume(Number.NaN);
      expect(player.setVolume).not.toHaveBeenCalled();
    });

    it("reports 0 when the player returns a non-finite volume", () => {
      const player = fakeYTPlayer({ getVolume: vi.fn().mockReturnValue(Number.NaN) });
      expect(createYouTubeController(player, makeContainer()).getVolume()).toBe(0);
    });
  });

  describe("playbackRate", () => {
    it("delegates read and write directly (same unit on both sides)", () => {
      const player = fakeYTPlayer({ getPlaybackRate: vi.fn().mockReturnValue(1.25) });
      const mc = createYouTubeController(player, makeContainer());
      expect(mc.getPlaybackRate()).toBe(1.25);
      mc.setPlaybackRate(2);
      expect(player.setPlaybackRate).toHaveBeenCalledWith(2);
    });

    it("ignores non-positive or non-finite rates", () => {
      const player = fakeYTPlayer();
      const mc = createYouTubeController(player, makeContainer());
      mc.setPlaybackRate(0);
      mc.setPlaybackRate(Number.NaN);
      expect(player.setPlaybackRate).not.toHaveBeenCalled();
    });

    it("falls back to 1 when the player returns a non-finite rate", () => {
      const player = fakeYTPlayer({ getPlaybackRate: vi.fn().mockReturnValue(Number.NaN) });
      expect(createYouTubeController(player, makeContainer()).getPlaybackRate()).toBe(1);
    });
  });

  describe("getBufferedFraction", () => {
    it("delegates to getVideoLoadedFraction", () => {
      const player = fakeYTPlayer({ getVideoLoadedFraction: vi.fn().mockReturnValue(0.42) });
      expect(createYouTubeController(player, makeContainer()).getBufferedFraction()).toBe(0.42);
    });

    it("clamps into 0-1 and treats non-finite as 0", () => {
      for (const [raw, expected] of [
        [1.4, 1],
        [-0.2, 0],
        [Number.NaN, 0],
      ] as const) {
        const player = fakeYTPlayer({
          getVideoLoadedFraction: vi.fn().mockReturnValue(raw),
        });
        expect(createYouTubeController(player, makeContainer()).getBufferedFraction()).toBe(
          expected,
        );
      }
    });
  });

  describe("isInterrupted", () => {
    it("is absent when no detector is injected", () => {
      expect(createYouTubeController(fakeYTPlayer(), makeContainer()).isInterrupted).toBeUndefined();
    });

    it("delegates to the injected detector so core stays unaware of ad heuristics", () => {
      const isInterrupted = vi.fn().mockReturnValue(true);
      const mc = createYouTubeController(fakeYTPlayer(), makeContainer(), { isInterrupted });
      expect(mc.isInterrupted?.()).toBe(true);
      expect(isInterrupted).toHaveBeenCalled();
    });

    it("re-reads the detector on every call rather than snapshotting it", () => {
      const isInterrupted = vi
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      const mc = createYouTubeController(fakeYTPlayer(), makeContainer(), { isInterrupted });
      expect(mc.isInterrupted?.()).toBe(true);
      expect(mc.isInterrupted?.()).toBe(false);
    });
  });
});

describe("MediaController interface", () => {
  it("native and YouTube controllers conform to the same shape", () => {
    const nativeMc: MediaController = createNativeVideoController(fakeVideo());
    const ytMc: MediaController = createYouTubeController(
      fakeYTPlayer(),
      document.createElement("div"),
    );
    for (const mc of [nativeMc, ytMc]) {
      expect(typeof mc.seek).toBe("function");
      expect(typeof mc.play).toBe("function");
      expect(typeof mc.pause).toBe("function");
      expect(typeof mc.togglePlay).toBe("function");
      expect(typeof mc.toggleMute).toBe("function");
      expect(typeof mc.toggleFullscreen).toBe("function");
      expect(typeof mc.getCurrentTime).toBe("function");
      expect(typeof mc.getDuration).toBe("function");
      expect(typeof mc.isPaused).toBe("function");
      expect(typeof mc.isMuted).toBe("function");
      expect(typeof mc.getVolume).toBe("function");
      expect(typeof mc.setVolume).toBe("function");
      expect(typeof mc.getPlaybackRate).toBe("function");
      expect(typeof mc.setPlaybackRate).toBe("function");
      expect(typeof mc.getBufferedFraction).toBe("function");
    }
  });
});
