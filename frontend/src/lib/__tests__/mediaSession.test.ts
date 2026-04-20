import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupMediaSession } from "../mediaSession";

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
    metadata: null as FakeMetadata | null,
    playbackState: "none" as MediaSessionPlaybackState,
  };
}

function fakeMedia(overrides: Partial<HTMLMediaElement> & Record<string, unknown> = {}) {
  const listeners: Record<string, Set<EventListener>> = {};
  const base = {
    paused: true,
    ended: false,
    currentTime: 0,
    duration: 100,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((type: string, fn: EventListener) => {
      (listeners[type] ??= new Set()).add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => {
      listeners[type]?.delete(fn);
    }),
    dispatch: (type: string) => {
      for (const fn of listeners[type] ?? []) fn(new Event(type));
    },
  };
  return Object.assign(base, overrides) as unknown as HTMLMediaElement & {
    dispatch: (type: string) => void;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  };
}

const originalMediaSession = navigator.mediaSession;
const originalMetadata = (window as unknown as { MediaMetadata?: unknown }).MediaMetadata;

beforeEach(() => {
  Object.defineProperty(navigator, "mediaSession", {
    configurable: true,
    value: fakeMediaSession(),
  });
  (window as unknown as { MediaMetadata: unknown }).MediaMetadata = FakeMetadata;
});

afterEach(() => {
  Object.defineProperty(navigator, "mediaSession", {
    configurable: true,
    value: originalMediaSession,
  });
  (window as unknown as { MediaMetadata?: unknown }).MediaMetadata = originalMetadata;
});

describe("setupMediaSession", () => {
  it("sets metadata", () => {
    const media = fakeMedia();
    setupMediaSession(media, { title: "song", artist: "artist", artwork: [{ src: "x.jpg" }] });
    const ms = navigator.mediaSession as unknown as { metadata: FakeMetadata };
    expect(ms.metadata.title).toBe("song");
    expect(ms.metadata.artist).toBe("artist");
    expect(ms.metadata.artwork[0]?.src).toBe("x.jpg");
  });

  it("registers play and pause handlers", () => {
    const media = fakeMedia();
    setupMediaSession(media, { title: "t" });
    const ms = navigator.mediaSession as unknown as { handlers: Record<string, Handler> };
    ms.handlers.play?.({} as MediaSessionActionDetails);
    expect(media.play).toHaveBeenCalled();
    ms.handlers.pause?.({} as MediaSessionActionDetails);
    expect(media.pause).toHaveBeenCalled();
  });

  it("registers nexttrack only when handler is provided", () => {
    const onNext = vi.fn();
    const media = fakeMedia();
    setupMediaSession(media, { title: "t" }, { onNextTrack: onNext });
    const ms = navigator.mediaSession as unknown as { handlers: Record<string, Handler> };
    ms.handlers.nexttrack?.({} as MediaSessionActionDetails);
    expect(onNext).toHaveBeenCalled();
  });

  it("omits nexttrack handler when callback is absent", () => {
    const media = fakeMedia();
    setupMediaSession(media, { title: "t" });
    const ms = navigator.mediaSession as unknown as { setActionHandler: ReturnType<typeof vi.fn> };
    const calls = ms.setActionHandler.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("nexttrack");
  });

  it("seeks forward and backward with default offset", () => {
    const media = fakeMedia({ currentTime: 50 });
    setupMediaSession(media, { title: "t" });
    const ms = navigator.mediaSession as unknown as { handlers: Record<string, Handler> };
    ms.handlers.seekforward?.({} as MediaSessionActionDetails);
    expect(media.currentTime).toBe(60);
    ms.handlers.seekbackward?.({} as MediaSessionActionDetails);
    expect(media.currentTime).toBe(50);
  });

  it("clamps seek within duration", () => {
    const media = fakeMedia({ currentTime: 95, duration: 100 });
    setupMediaSession(media, { title: "t" });
    const ms = navigator.mediaSession as unknown as { handlers: Record<string, Handler> };
    ms.handlers.seekforward?.({ seekOffset: 30 } as MediaSessionActionDetails);
    expect(media.currentTime).toBe(100);
    media.currentTime = 5;
    ms.handlers.seekbackward?.({ seekOffset: 30 } as MediaSessionActionDetails);
    expect(media.currentTime).toBe(0);
  });

  it("reflects play state on play/pause events", () => {
    const media = fakeMedia();
    setupMediaSession(media, { title: "t" });
    const ms = navigator.mediaSession as unknown as { playbackState: string };
    const mutable = media as unknown as { paused: boolean };
    mutable.paused = false;
    media.dispatch("play");
    expect(ms.playbackState).toBe("playing");
    mutable.paused = true;
    media.dispatch("pause");
    expect(ms.playbackState).toBe("paused");
  });

  it("cleans up handlers and metadata", () => {
    const media = fakeMedia();
    const cleanup = setupMediaSession(media, { title: "t" }, { onNextTrack: () => {} });
    cleanup();
    const ms = navigator.mediaSession as unknown as { handlers: Record<string, Handler>; metadata: unknown; playbackState: string };
    expect(ms.handlers.play).toBeNull();
    expect(ms.handlers.nexttrack).toBeNull();
    expect(ms.metadata).toBeNull();
    expect(ms.playbackState).toBe("none");
  });

  it("is a no-op when MediaSession API is unavailable", () => {
    Object.defineProperty(navigator, "mediaSession", { configurable: true, value: undefined });
    const media = fakeMedia();
    expect(() => setupMediaSession(media, { title: "t" })()).not.toThrow();
  });
});
