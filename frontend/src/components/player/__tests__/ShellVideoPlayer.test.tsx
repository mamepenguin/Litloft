import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { useFullscreen } = vi.hoisted(() => ({
  useFullscreen: vi.fn(() => ({
    isFullscreen: false,
    isPseudo: false,
    toggle: () => {},
    exit: () => {},
  })),
}));

vi.mock("../hooks/useFullscreen", () => ({ useFullscreen }));
vi.mock("../hooks/useVideoShortcuts", () => ({ useVideoShortcuts: vi.fn() }));
vi.mock("../MediaControls", () => ({ default: () => null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/useShellMedia", () => ({
  useShellMedia: () => ({
    mc: { toggleFullscreen: vi.fn() },
    channel: null,
    failed: false,
    waiting: false,
  }),
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
vi.mock("@/lib/mediaClock", () => ({ useMediaClock: () => ({ paused: true, time: 0 }) }));
vi.mock("@/lib/playbackProgress", () => ({
  usePlaybackProgress: () => ({ notifyEnded: vi.fn(), notifyReady: vi.fn() }),
}));

import { ShellVideoPlayer } from "../ShellVideoPlayer";

describe("ShellVideoPlayer", () => {
  it("never carries the frame into pseudo-fullscreen", () => {
    render(<ShellVideoPlayer videoId="vid" />);
    expect(useFullscreen).toHaveBeenCalled();
    for (const [options] of useFullscreen.mock.calls as unknown as Array<[{ animate?: boolean }]>) {
      expect(options.animate).toBe(false);
    }
  });
});
