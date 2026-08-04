import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MediaController } from "@/lib/mediaController";
import MediaControls from "..";

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
    getBufferedFraction: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

let frame: HTMLDivElement;

beforeEach(() => {
  frame = document.createElement("div");
  document.body.appendChild(frame);
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => null,
  });
});

afterEach(() => {
  frame.remove();
});

describe("MediaControls — fullscreen delegation", () => {
  it("uses the supplied controller when one is given", () => {
    const toggle = vi.fn();
    const mc = makeMc();
    render(
      <MediaControls
        mc={mc}
        frameRef={{ current: frame }}
        fullscreen={{ isFullscreen: false, toggle }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(toggle).toHaveBeenCalledTimes(1);
    // The MediaController route would bypass pseudo-fullscreen, so the
    // bar must not fall back to it while a controller is supplied.
    expect(mc.toggleFullscreen).not.toHaveBeenCalled();
  });

  it("reflects the supplied state in the button label", () => {
    render(
      <MediaControls
        mc={makeMc()}
        frameRef={{ current: frame }}
        fullscreen={{ isFullscreen: true, toggle: vi.fn() }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Exit full screen" }),
    ).toBeInTheDocument();
  });

  it("falls back to the MediaController when no controller is supplied", () => {
    // Keeps the door open for the native <video> player, which has no
    // pseudo-fullscreen problem to solve.
    const mc = makeMc();
    render(<MediaControls mc={mc} frameRef={{ current: frame }} />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(mc.toggleFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe("MediaControls — pseudo-fullscreen safe areas", () => {
  it("keeps clear of the home indicator and the notch while pseudo", () => {
    const { container } = render(
      <MediaControls
        mc={makeMc()}
        frameRef={{ current: frame }}
        fullscreen={{ isFullscreen: true, toggle: vi.fn() }}
        isPseudoFullscreen
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    // A bar sitting flush at bottom-0 triggers iOS Reachability and the
    // home-bar swipe instead of taking the tap.
    expect(root.style.paddingBottom).toContain("safe-area-inset-bottom");
    // In landscape the notch is on a side, not the top.
    expect(root.style.paddingLeft).toContain("safe-area-inset-left");
    expect(root.style.paddingRight).toContain("safe-area-inset-right");
  });

  it("adds no insets in the normal in-page layout", () => {
    const { container } = render(
      <MediaControls mc={makeMc()} frameRef={{ current: frame }} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.paddingBottom).toBe("");
    expect(root.style.paddingLeft).toBe("");
  });
});
