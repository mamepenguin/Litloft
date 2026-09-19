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

function controlBlocks(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      '[data-testid="top-controls"], [data-testid="bottom-controls"]',
    ),
  );
}

describe("TouchControlsPresenter", () => {
  describe("transport", () => {
    it("puts play on the frame", () => {
      renderControls();
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("leaves skipping to the gesture", () => {
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

    it("puts the track on the bottom edge of the frame, knob hanging past it", () => {
      // 32px down a 40px row leaves the 4px track flush with the bottom, and
      // the 12px knob centred on it hanging 4px past.
      const { container } = renderControls();
      const line = container.querySelector<HTMLElement>('[data-testid="seek-line"]');
      expect(line?.style.top).toBe("32px");
    });

    it("draws the knob in the indicator colour", () => {
      renderControls();
      expect(screen.getByTestId("seek-knob").className).toContain(
        "bg-player-indicator",
      );
    });

    it("leaves a hairline behind once the controls fade out", () => {
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
    /** Everything else inside inherits pointer-events, so only these set it. */
    function gatedElements(container: HTMLElement): HTMLElement[] {
      const bottom = container.querySelector<HTMLElement>(
        '[data-testid="bottom-controls"]',
      );
      const top = container.querySelector<HTMLElement>(
        '[data-testid="top-controls"]',
      );
      const transport = Array.from(
        container.querySelectorAll<HTMLElement>('[data-testid="transport"] button'),
      );
      return [bottom, top, ...transport].filter((el): el is HTMLElement => el !== null);
    }

    it("stops faded controls from taking taps", () => {
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
      const { container } = renderControls();
      const root = container.querySelector<HTMLElement>(
        '[data-testid="touch-controls-root"]',
      );
      expect(root?.className).toContain("pointer-events-none");
    });

    it("keeps iOS from claiming a long press as a text selection", () => {
      const { container } = renderControls();
      const root = container.querySelector<HTMLElement>(
        '[data-testid="touch-controls-root"]',
      );
      expect(root?.className).toContain("select-none");
      expect(root?.className).toContain("[-webkit-touch-callout:none]");
    });

    it("lets the gaps between the transport buttons fall through", () => {
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

    it("lets a swipe from a button reach the frame", () => {
      renderControls();
      expect(screen.getByRole("button", { name: "Pause" })).not.toHaveAttribute(
        "data-player-scrub",
      );
    });

    it("refuses to be scrolled while the controls are up", () => {
      const { container } = renderControls();
      const root = container.querySelector<HTMLElement>(
        '[data-testid="touch-controls-root"]',
      );
      expect(root?.className).toContain("touch-none");
    });
  });

  describe("swipe-to-dismiss coexistence", () => {
    it("marks only the blocks that take input", () => {
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
      const { container } = renderControls({ isFullscreen: true });
      const bottom = container.querySelector<HTMLElement>(
        '[data-testid="bottom-controls"]',
      );
      expect(bottom?.style.paddingBottom).toContain("safe-area-inset-bottom");
      expect(bottom?.style.paddingLeft).toContain("safe-area-inset-left");
      expect(bottom?.style.paddingRight).toContain("safe-area-inset-right");
    });

    it("adds no insets in the normal in-page layout", () => {
      const { container } = renderControls();
      const bottom = container.querySelector<HTMLElement>(
        '[data-testid="bottom-controls"]',
      );
      expect(bottom?.style.paddingBottom).toBe("");
    });

    it("applies them in pseudo-fullscreen too", () => {
      const { container } = renderControls({
        isFullscreen: true,
        isPseudoFullscreen: true,
      });
      const bottom = container.querySelector<HTMLElement>(
        '[data-testid="bottom-controls"]',
      );
      expect(bottom?.style.paddingBottom).toContain("safe-area-inset-bottom");
    });
  });
});
