import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MediaController } from "../mediaController";
import { useMediaControlsState } from "@/components/player/MediaControls/hooks/useMediaControlsState";

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

describe("mediaClock consumers", () => {
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
