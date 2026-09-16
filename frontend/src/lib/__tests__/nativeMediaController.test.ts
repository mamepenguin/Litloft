import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { MediaShadow } from "../nativeMedia";

type Controller = import("../mediaController").MediaController;

interface StubbedWindow extends Window {
  webkit?: unknown;
  __litloft?: { receive(payload: unknown): void };
}

const win = () => window as StubbedWindow;
let posted: Record<string, unknown>[] = [];

function shadow(overrides: Partial<MediaShadow> = {}): MediaShadow {
  return { time: 0, duration: 0, paused: true, rate: 1, volume: 1, buffered: 0, ended: false, ...overrides };
}

/** The channel's own behaviour has its own tests; this is about the contract. */
function fakeChannel(initial: MediaShadow = shadow()) {
  let current = initial;
  return {
    read: () => current,
    set: (next: Partial<MediaShadow>) => {
      current = { ...current, ...next };
    },
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
    setVolume: vi.fn((v: number) => {
      current = { ...current, volume: v };
    }),
    load: vi.fn(),
    unload: vi.fn(),
    dispose: vi.fn(),
  };
}

type Fake = ReturnType<typeof fakeChannel>;

async function make(initial?: MediaShadow): Promise<{ controller: Controller; channel: Fake }> {
  vi.resetModules();
  const { createNativeShellController } = await import("../nativeMediaController");
  const channel = fakeChannel(initial);
  return { controller: createNativeShellController(channel as never), channel };
}

afterEach(() => {
  delete win().webkit;
  delete win().__litloft;
});

beforeEach(() => {
  posted = [];
});

describe("the shell's MediaController", () => {
  it("reads every getter off the shadow", async () => {
    const { controller } = await make(
      shadow({ time: 42, duration: 100, paused: false, rate: 1.5, volume: 0.4, buffered: 80 }),
    );

    expect(controller.getCurrentTime()).toBe(42);
    expect(controller.getDuration()).toBe(100);
    expect(controller.isPaused()).toBe(false);
    expect(controller.getPlaybackRate()).toBe(1.5);
    expect(controller.getVolume()).toBe(0.4);
    expect(controller.isMuted()).toBe(false);
  });

  it("does not answer for captions or interruptions", async () => {
    const { controller } = await make();

    expect(controller.getCaptions).toBeUndefined();
    expect(controller.setCaptions).toBeUndefined();
    expect(controller.isInterrupted).toBeUndefined();
  });

  it("toggles play against what is actually playing", async () => {
    const { controller, channel } = await make(shadow({ paused: true }));

    controller.togglePlay();
    expect(channel.play).toHaveBeenCalledOnce();

    channel.set({ paused: false });
    controller.togglePlay();
    expect(channel.pause).toHaveBeenCalledOnce();
  });

  it("restores the volume a mute silenced", async () => {
    const { controller, channel } = await make(shadow({ volume: 0.6 }));

    controller.toggleMute();
    expect(channel.setVolume).toHaveBeenLastCalledWith(0);
    expect(controller.isMuted()).toBe(true);

    controller.toggleMute();
    expect(channel.setVolume).toHaveBeenLastCalledWith(0.6);
    expect(controller.isMuted()).toBe(false);
  });

  it("forgets the muted volume once one is chosen by hand", async () => {
    const { controller, channel } = await make(shadow({ volume: 0.6 }));

    controller.toggleMute();
    controller.setVolume(0.2);
    controller.toggleMute();

    expect(channel.setVolume).toHaveBeenLastCalledWith(0);
    controller.toggleMute();
    expect(channel.setVolume).toHaveBeenLastCalledWith(0.2);
  });

  it("keeps the volume on the scale the contract declares", async () => {
    const { controller, channel } = await make();

    controller.setVolume(4);
    expect(channel.setVolume).toHaveBeenLastCalledWith(1);

    controller.setVolume(-1);
    expect(channel.setVolume).toHaveBeenLastCalledWith(0);
  });

  it("reports buffering as a fraction of a known length", async () => {
    const { controller, channel } = await make(shadow({ duration: 200, buffered: 50 }));
    expect(controller.getBufferedFraction()).toBe(0.25);

    channel.set({ buffered: 250 });
    expect(controller.getBufferedFraction()).toBe(1);
  });

  it("reports no buffering when the length is not known", async () => {
    const { controller } = await make(shadow({ duration: 0, buffered: 30 }));
    expect(controller.getBufferedFraction()).toBe(0);
  });

  it("passes a seek and a rate straight through", async () => {
    const { controller, channel } = await make();

    controller.seek(90);
    controller.setPlaybackRate(1.75);

    expect(channel.seek).toHaveBeenCalledWith(90);
    expect(channel.setRate).toHaveBeenCalledWith(1.75);
  });

  it("has nothing to make fullscreen", async () => {
    const { controller } = await make();
    expect(() => controller.toggleFullscreen()).not.toThrow();
  });
});
