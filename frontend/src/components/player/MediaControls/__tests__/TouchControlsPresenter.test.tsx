import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TouchControlsPresenter } from "../TouchControlsPresenter";
import type { MediaControlsPresenterProps } from "../types";

function renderControls(overrides: Partial<MediaControlsPresenterProps> = {}) {
  const props: MediaControlsPresenterProps = {
    displayTime: 30,
    duration: 120,
    bufferedFraction: 0.5,
    paused: false,
    muted: false,
    volume: 1,
    playbackRate: 1,
    interrupted: false,
    visible: true,
    isFullscreen: false,
    onTogglePlay: vi.fn(),
    onSkip: vi.fn(),
    onScrubStart: vi.fn(),
    onScrubChange: vi.fn(),
    onScrubEnd: vi.fn(),
    onToggleMute: vi.fn(),
    onVolumeChange: vi.fn(),
    onPlaybackRateChange: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onSettingsOpenChange: vi.fn(),
    captions: "off",
    onToggleCaptions: vi.fn(),
    ...overrides,
  };
  const utils = render(<TouchControlsPresenter {...props} />);
  return { ...utils, props };
}

/** The blocks that take input, which is what useFullscreen looks for. */
function controlBlocks(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-player-controls]"));
}

describe("TouchControlsPresenter", () => {
  describe("transport", () => {
    it("puts play on the frame", () => {
      renderControls();
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("leaves skipping to the gesture", () => {
      // A double tap targets half the frame. Buttons for the same thing
      // would only cover the video to duplicate it.
      renderControls();
      expect(
        screen.queryByRole("button", { name: "Forward 10 seconds" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Back 10 seconds" }),
      ).not.toBeInTheDocument();
    });

    it("offers Play while paused", () => {
      renderControls({ paused: true });
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("toggles playback", () => {
      const { props } = renderControls();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
    });
  });

  describe("status row", () => {
    it("shows the elapsed and total time", () => {
      renderControls();
      expect(screen.getByText("0:30")).toBeInTheDocument();
      expect(screen.getByText("2:00")).toBeInTheDocument();
    });

    it("keeps mute, settings and fullscreen reachable", () => {
      renderControls();
      expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
    });

    it("omits the volume slider, which iOS ignores writes to", () => {
      renderControls();
      expect(screen.queryByRole("slider", { name: "Volume" })).not.toBeInTheDocument();
    });

    it("leaves the OS speed dropdown behind", () => {
      // A native <select> popup is drawn by the platform and looks
      // nothing like the rest of the player; speed moved into a sheet.
      renderControls();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  describe("speed sheet", () => {
    it("opens from the settings button", () => {
      const { props } = renderControls();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(props.onSettingsOpenChange).toHaveBeenCalledWith(true);
    });

    it("stays out of the way until asked for", () => {
      renderControls();
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    });

    it("shows the rates once open", () => {
      renderControls({ settingsOpen: true });
      expect(
        screen.getByRole("radiogroup", { name: "Playback speed" }),
      ).toBeInTheDocument();
    });

    it("reports a chosen rate through the same callback as before", () => {
      const { props } = renderControls({ settingsOpen: true });
      fireEvent.click(screen.getByRole("radio", { name: "2x" }));
      expect(props.onPlaybackRateChange).toHaveBeenCalledWith(2);
    });
  });

  describe("seek bar", () => {
    it("spans the duration and sits at the current position", () => {
      renderControls();
      const slider = screen.getByRole("slider", { name: "Seek" });
      expect(slider).toHaveValue("30");
      expect(slider).toHaveAttribute("max", "120");
    });

    it("draws the knob and the track on one shared line", () => {
      // Regression: the track was painted against the row while the
      // native thumb was positioned against its own track
      // pseudo-element. Two coordinate systems, so the knob floated
      // above the bar it belonged to. One parent, one baseline.
      const { container } = renderControls();
      const line = container.querySelector<HTMLElement>('[data-testid="seek-line"]');
      expect(line?.querySelector('[data-testid="played-range"]')).toBeInTheDocument();
      expect(line?.querySelector('[data-testid="seek-knob"]')).toBeInTheDocument();
    });

    it("hides the native thumb that would sit somewhere else", () => {
      const { container } = renderControls();
      const input = container.querySelector<HTMLElement>('input[type="range"]');
      expect(input?.className).toContain("[&::-webkit-slider-thumb]:opacity-0");
    });

    it("drops the knob when there is nothing to seek through", () => {
      renderControls({ interrupted: true });
      expect(screen.queryByTestId("seek-knob")).not.toBeInTheDocument();
    });

    it("sits on the bottom edge of the frame", () => {
      // The row keeps a finger-sized target; the bar itself belongs on
      // the very edge, the way mobile players draw it. 28px down a 40px
      // row leaves the 12px line flush with the bottom.
      const { container } = renderControls();
      const line = container.querySelector<HTMLElement>('[data-testid="seek-line"]');
      expect(line?.style.top).toBe("28px");
    });

    it("leaves a hairline behind once the controls fade out", () => {
      // Mobile players keep a sense of position without keeping a whole
      // bar on screen.
      renderControls({ visible: false });
      expect(screen.getByTestId("progress-hairline")).toBeInTheDocument();
    });

    it("shows no hairline while the real bar is up", () => {
      renderControls({ visible: true });
      expect(screen.queryByTestId("progress-hairline")).not.toBeInTheDocument();
    });
  });

  describe("interrupted (ad break)", () => {
    it("announces the interruption", () => {
      renderControls({ interrupted: true });
      expect(screen.getByText("Ad")).toBeInTheDocument();
    });

    it("disables seeking and settings", () => {
      renderControls({ interrupted: true });
      expect(screen.getByRole("slider", { name: "Seek" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Settings" })).toBeDisabled();
    });

    it("leaves play alone, which still belongs to the viewer", () => {
      renderControls({ interrupted: true });
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    });
  });

  describe("visibility", () => {
    /**
     * The elements that set pointer-events for themselves. Everything
     * else inside the bottom bar inherits it, pointer-events being a
     * inherited property — only the standalone transport buttons and
     * the bar itself have to say anything.
     */
    function gatedElements(container: HTMLElement): HTMLElement[] {
      const bottom = container.querySelector<HTMLElement>(
        "[data-player-controls].bottom-0",
      );
      const top = container.querySelector<HTMLElement>(
        "[data-player-controls].top-0",
      );
      const transport = Array.from(
        container.querySelectorAll<HTMLElement>('[data-testid="transport"] button'),
      );
      return [bottom, top, ...transport].filter((el): el is HTMLElement => el !== null);
    }

    it("stops faded controls from taking taps", () => {
      // An invisible play button under the viewer's finger would toggle
      // playback on the tap that was only meant to bring it back.
      const { container } = renderControls({ visible: false });
      const gated = gatedElements(container);
      expect(gated).toHaveLength(3);
      for (const element of gated) {
        expect(element.className).toContain("pointer-events-none");
      }
    });

    it("takes taps while visible", () => {
      const { container } = renderControls({ visible: true });
      const gated = gatedElements(container);
      expect(gated).toHaveLength(3);
      for (const element of gated) {
        expect(element.className).toContain("pointer-events-auto");
      }
    });
  });

  describe("gesture coexistence", () => {
    it("lets the frame-covering container pass every pointer through", () => {
      // Regression: this box spans the whole frame to position its
      // children and sits above the gesture overlay. Taking input here
      // swallowed every tap, long press and double tap on the video —
      // the controls could not even be summoned back.
      const { container } = renderControls();
      const root = container.querySelector<HTMLElement>(
        '[data-testid="touch-controls-root"]',
      );
      expect(root?.className).toContain("pointer-events-none");
    });

    it("keeps iOS from claiming a long press as a text selection", () => {
      // Without this the selection loupe comes up over the player and
      // the speed boost never engages.
      const { container } = renderControls();
      const root = container.querySelector<HTMLElement>(
        '[data-testid="touch-controls-root"]',
      );
      expect(root?.className).toContain("select-none");
      expect(root?.className).toContain("[-webkit-touch-callout:none]");
    });

    it("lets the gaps between the transport buttons fall through", () => {
      // The three buttons span a box about 220px wide. If that whole box
      // took input, a double tap landing in a gap between the buttons
      // would hit nothing at all — a dead zone in the middle of the
      // frame, which is exactly where people tap.
      const { container } = renderControls();
      const transport = container.querySelector<HTMLElement>(
        '[data-testid="transport"]',
      );
      expect(transport?.className).toContain("pointer-events-none");
    });

    it("still takes taps on the buttons themselves", () => {
      renderControls();
      expect(screen.getByRole("button", { name: "Pause" }).className).toContain(
        "pointer-events-auto",
      );
    });

    it("stops a slip on a button from dismissing fullscreen", () => {
      // useFullscreen ignores swipes starting on [data-player-controls];
      // a finger sliding off a button must not close the frame.
      renderControls();
      expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute(
        "data-player-controls",
      );
    });
  });

  describe("swipe-to-dismiss coexistence", () => {
    it("marks only the blocks that take input", () => {
      // useFullscreen ignores swipes that start on [data-player-controls].
      // Marking a full-frame container would tell it every swipe belongs
      // to the controls, killing swipe-to-dismiss outright.
      const { container } = renderControls();
      const blocks = controlBlocks(container);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block.className).not.toContain("inset-0");
      }
    });
  });

  describe("fullscreen safe areas", () => {
    it("keeps the bottom block clear of the home indicator and the notch", () => {
      // Applies to either kind of fullscreen: both put the frame
      // against the physical screen edge, where the home indicator
      // takes touches meant for the bar.
      const { container } = renderControls({ isFullscreen: true });
      const bottom = container.querySelector<HTMLElement>(
        "[data-player-controls].bottom-0",
      );
      expect(bottom?.style.paddingBottom).toContain("safe-area-inset-bottom");
      expect(bottom?.style.paddingLeft).toContain("safe-area-inset-left");
      expect(bottom?.style.paddingRight).toContain("safe-area-inset-right");
    });

    it("adds no insets in the normal in-page layout", () => {
      // In the page there is no screen edge to avoid, and the bar
      // belongs on the frame's own boundary.
      const { container } = renderControls();
      const bottom = container.querySelector<HTMLElement>(
        "[data-player-controls].bottom-0",
      );
      expect(bottom?.style.paddingBottom).toBe("");
    });

    it("applies them in pseudo-fullscreen too", () => {
      const { container } = renderControls({
        isFullscreen: true,
        isPseudoFullscreen: true,
      });
      const bottom = container.querySelector<HTMLElement>(
        "[data-player-controls].bottom-0",
      );
      expect(bottom?.style.paddingBottom).toContain("safe-area-inset-bottom");
    });
  });
});
