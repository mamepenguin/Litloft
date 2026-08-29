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

// Several tests swap in a matchMedia to choose a layout. Left in place
// it decides the layout for every test that follows, which quietly
// changes what they are asserting against.
const realMatchMedia = window.matchMedia;

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
  vi.unstubAllGlobals();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: realMatchMedia,
  });
});

function renderControls(mc: MediaController | null, durationHint?: number | null) {
  return render(
    <MediaControls mc={mc} frameRef={{ current: frame }} durationHint={durationHint} />,
  );
}

/**
 * The bar is one of two siblings the container renders (the gesture
 * overlay is the other), so it is addressed by test id rather than by
 * position.
 */
function barOf(container: HTMLElement): HTMLElement {
  const bar = container.querySelector<HTMLElement>('[data-testid="control-bar"]');
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

  it("shows a dragged volume before the poll confirms it", () => {
    // The controller keeps reporting the old level until its next tick,
    // which on a paused player is a second away. Rendering that would
    // leave the painted fill trailing the knob the browser is already
    // drawing under the pointer.
    const mc = makeMc({ getVolume: vi.fn().mockReturnValue(1) });
    renderControls(mc);
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0.4" },
    });
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0.4");
  });

  it("falls back to the controller when it refuses the level", async () => {
    // iOS ignores writes to volume outright. The slider must not sit
    // forever on a level the player never took.
    vi.useFakeTimers();
    try {
      const mc = makeMc({ getVolume: vi.fn().mockReturnValue(1) });
      renderControls(mc);
      fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
        target: { value: "0.4" },
      });
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("1");
    } finally {
      vi.useRealTimers();
    }
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
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("radio", { name: "2x" }));
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
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("radio", { name: "2x" }));
      });
      // Picking a rate closes the panel, so reopen it to read back what
      // the bar believes is in effect.
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      });
      expect(screen.getByRole("radio", { name: "Normal" })).toBeChecked();
    });
  });

  describe("captions", () => {
    function makeCaptionMc() {
      return makeMc({
        getCaptions: vi.fn().mockReturnValue("off"),
        setCaptions: vi.fn(),
      });
    }

    it("leaves the backend's default alone when no preference exists", async () => {
      const mc = makeCaptionMc();
      renderControls(mc);
      await act(async () => {});
      expect(mc.setCaptions).not.toHaveBeenCalled();
    });

    it("applies a saved preference to the player", async () => {
      window.localStorage.setItem("video-share-captions", "true");
      const mc = makeCaptionMc();
      renderControls(mc);
      await act(async () => {});
      expect(mc.setCaptions).toHaveBeenCalledWith(true);
    });

    it("persists a new choice and applies it", async () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("pointer: coarse"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      const mc = makeCaptionMc();
      renderControls(mc);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("switch", { name: "Subtitles" }));
      });
      expect(window.localStorage.getItem("video-share-captions")).toBe("true");
      expect(mc.setCaptions).toHaveBeenLastCalledWith(true);
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
     * Three layouts now, and the touch one is no longer the only one
     * without a volume slider, so `isTouchLayout` cannot tell compact
     * from touch. Each layout's root carries its own test id.
     */
    function layoutOf(container: HTMLElement): string {
      for (const [id, name] of [
        ["touch-controls-root", "touch"],
        ["compact-controls-root", "compact"],
        ["control-bar", "pointer"],
      ]) {
        if (container.querySelector(`[data-testid="${id}"]`)) return name;
      }
      throw new Error("no control layout rendered");
    }

    function setFrameWidth(width: number) {
      frame.getBoundingClientRect = () =>
        ({
          width,
          height: (width * 9) / 16,
          top: 0,
          left: 0,
          right: width,
          bottom: (width * 9) / 16,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    }

    /** Returns a trigger that replays every live observation callback. */
    function installResizeObserver(): () => void {
      const callbacks: Array<() => void> = [];
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: () => void) {
            callbacks.push(callback);
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      return () => callbacks.forEach((callback) => callback());
    }

    it("falls to the compact layout when the frame cannot hold the row", () => {
      installPointerMode("fine");
      setFrameWidth(320);
      const { container } = renderControls(makeMc());
      expect(layoutOf(container)).toBe("compact");
    });

    it("keeps the pointer layout once the frame is wide enough", () => {
      installPointerMode("fine");
      setFrameWidth(480);
      const { container } = renderControls(makeMc());
      expect(layoutOf(container)).toBe("pointer");
    });

    it("keeps the touch layout however narrow the frame is", () => {
      // A finger needs the larger targets at every width, and the touch
      // layout already fits a phone.
      installPointerMode("coarse");
      setFrameWidth(320);
      const { container } = renderControls(makeMc());
      expect(layoutOf(container)).toBe("touch");
    });

    it("swaps back to the pointer layout when the frame grows", () => {
      installPointerMode("fine");
      const resize = installResizeObserver();
      setFrameWidth(320);
      const { container } = renderControls(makeMc());
      expect(layoutOf(container)).toBe("compact");
      act(() => {
        setFrameWidth(900);
        resize();
      });
      expect(layoutOf(container)).toBe("pointer");
    });

    /**
     * `settingsOpen` holds the bar awake so a panel cannot vanish under
     * the viewer. The compact layout draws no panel, so a sheet left
     * open across the transition would be invisible and would still be
     * holding — the idle timer would never fire again.
     */
    it("closes the settings sheet when the frame narrows", () => {
      vi.useFakeTimers();
      try {
        installPointerMode("fine");
        const resize = installResizeObserver();
        setFrameWidth(900);
        const { container } = renderControls(makeMc());
        act(() => {
          fireEvent.click(screen.getByRole("button", { name: "Settings" }));
        });
        expect(
          container.querySelector('[data-testid="settings-sheet"]'),
        ).toBeInTheDocument();

        act(() => {
          setFrameWidth(320);
          resize();
        });
        expect(
          container.querySelector('[data-testid="settings-sheet"]'),
        ).not.toBeInTheDocument();

        // The part that matters: the bar can still put itself away.
        act(() => {
          vi.advanceTimersByTime(5000);
        });
        const bar = container.querySelector<HTMLElement>(
          '[data-testid="compact-controls-root"]',
        );
        expect(bar?.className).toContain("opacity-0");
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * Nothing may sit over the whole frame and take pointer input
     * except the gesture overlay itself. A layout that does swallows
     * every tap, long press and double tap on the video, and the
     * controls cannot even be summoned back — which is exactly what
     * the touch layout did when it first landed.
     */
    function fullFrameElementsTakingInput(container: HTMLElement): HTMLElement[] {
      // Only the layers the container puts directly on the frame count.
      // `inset-0` deeper in the tree is relative to whatever box holds
      // it — the seek bar stretches its input that way inside a row a
      // few pixels tall, which covers nothing.
      return Array.from(container.children).filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement &&
          el.className.includes("inset-0") &&
          !el.className.includes("pointer-events-none"),
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
