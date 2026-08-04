import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    getCurrentTime: vi.fn().mockReturnValue(40),
    getDuration: vi.fn().mockReturnValue(200),
    isPaused: vi.fn().mockReturnValue(false),
    isMuted: vi.fn().mockReturnValue(false),
    getVolume: vi.fn().mockReturnValue(1),
    setVolume: vi.fn(),
    getPlaybackRate: vi.fn().mockReturnValue(1),
    setPlaybackRate: vi.fn(),
    getBufferedFraction: vi.fn().mockReturnValue(0.25),
    ...overrides,
  };
}

let frame: HTMLDivElement;

beforeEach(() => {
  window.localStorage.clear();
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

function renderControls(mc: MediaController | null, durationHint?: number | null) {
  return render(
    <MediaControls mc={mc} frameRef={{ current: frame }} durationHint={durationHint} />,
  );
}

/**
 * The bar is one of two siblings the container renders (the gesture
 * overlay is the other), so it is addressed by its marker attribute
 * rather than by position.
 */
function barOf(container: HTMLElement): HTMLElement {
  const bar = container.querySelector<HTMLElement>("[data-player-controls]");
  if (!bar) throw new Error("control bar not found");
  return bar;
}

describe("MediaControlsContainer", () => {
  it("renders the polled controller state", () => {
    renderControls(makeMc());
    expect(screen.getByText("0:40")).toBeInTheDocument();
    expect(screen.getByText("3:20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("prefers the duration hint over the player's duration", () => {
    renderControls(makeMc(), 600);
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("toggles playback", () => {
    const mc = makeMc();
    renderControls(mc);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(mc.togglePlay).toHaveBeenCalledTimes(1);
  });

  it("skips relative to the live playhead rather than the rendered value", () => {
    const mc = makeMc({ getCurrentTime: vi.fn().mockReturnValue(40) });
    renderControls(mc);
    fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(mc.seek).toHaveBeenCalledWith(50);
    fireEvent.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    expect(mc.seek).toHaveBeenLastCalledWith(30);
  });

  it("toggles mute and fullscreen through the controller", () => {
    const mc = makeMc();
    renderControls(mc);
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(mc.toggleMute).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(mc.toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("writes volume changes on the 0-1 scale", () => {
    const mc = makeMc();
    renderControls(mc);
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0.4" },
    });
    expect(mc.setVolume).toHaveBeenCalledWith(0.4);
  });

  describe("playback rate", () => {
    it("applies the persisted preference to the controller on mount", async () => {
      window.localStorage.setItem("video-share-playback-rate", "1.5");
      const mc = makeMc();
      renderControls(mc);
      await act(async () => {});
      expect(mc.setPlaybackRate).toHaveBeenCalledWith(1.5);
    });

    it("persists a newly chosen rate and applies it", async () => {
      const mc = makeMc();
      renderControls(mc);
      await act(async () => {
        fireEvent.change(screen.getByRole("combobox", { name: "Playback speed" }), {
          target: { value: "2" },
        });
      });
      expect(mc.setPlaybackRate).toHaveBeenCalledWith(2);
      expect(window.localStorage.getItem("video-share-playback-rate")).toBe("2");
    });

    it("shows the rate the controller reports, not the one requested", async () => {
      // A backend that refuses the requested rate must not leave the
      // UI claiming it succeeded.
      const mc = makeMc({ getPlaybackRate: vi.fn().mockReturnValue(1) });
      renderControls(mc);
      await act(async () => {
        fireEvent.change(screen.getByRole("combobox", { name: "Playback speed" }), {
          target: { value: "2" },
        });
      });
      expect(screen.getByRole("combobox", { name: "Playback speed" })).toHaveValue("1");
    });
  });

  describe("auto-hide", () => {
    it("reveals the controls on pointer movement over the frame", () => {
      vi.useFakeTimers();
      try {
        const { container } = renderControls(makeMc());
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(barOf(container).className).toContain("opacity-0");
        act(() => {
          fireEvent.pointerMove(frame);
        });
        expect(barOf(container).className).toContain("opacity-100");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("renders nothing usable but does not crash without a controller", () => {
    renderControls(null);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  describe("layout selection", () => {
    function installPointerMode(mode: "coarse" | "fine" | "none") {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches:
          mode === "none"
            ? false
            : query.includes(`pointer: ${mode}`),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    }

    /**
     * The volume slider only exists in the pointer layout: iOS ignores
     * writes to volume, so the touch layout leaves it out entirely.
     * jsdom does not apply media queries, so its presence in the DOM is
     * a reliable way to tell the two layouts apart.
     */
    function isTouchLayout(): boolean {
      return screen.queryByRole("slider", { name: "Volume" }) === null;
    }

    it("uses the touch layout on a coarse pointer", () => {
      installPointerMode("coarse");
      renderControls(makeMc());
      expect(isTouchLayout()).toBe(true);
    });

    it("uses the pointer layout on a fine pointer", () => {
      installPointerMode("fine");
      renderControls(makeMc());
      expect(isTouchLayout()).toBe(false);
    });

    it("falls back to the pointer layout when the input is unknown", () => {
      // It is the layout that works without gestures, so it is the safe
      // answer where the media queries cannot tell us anything.
      installPointerMode("none");
      renderControls(makeMc());
      expect(isTouchLayout()).toBe(false);
    });

    /**
     * Nothing may sit over the whole frame and take pointer input
     * except the gesture overlay itself. A layout that does swallows
     * every tap, long press and double tap on the video, and the
     * controls cannot even be summoned back — which is exactly what
     * the touch layout did when it first landed.
     */
    function fullFrameElementsTakingInput(container: HTMLElement): HTMLElement[] {
      return Array.from(container.querySelectorAll<HTMLElement>(".inset-0")).filter(
        (el) => !el.className.includes("pointer-events-none"),
      );
    }

    it.each(["coarse", "fine", "none"] as const)(
      "leaves the gestures reachable through the %s layout",
      (mode) => {
        installPointerMode(mode);
        const { container } = renderControls(makeMc());
        const blocking = fullFrameElementsTakingInput(container);
        expect(blocking).toHaveLength(1);
        expect(blocking[0]).toHaveAttribute("data-player-gestures");
      },
    );
  });
});
