import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompactControlsPresenter } from "../CompactControlsPresenter";
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
    captions: "off",
    onToggleCaptions: vi.fn(),
    settingsOpen: false,
    onSettingsOpenChange: vi.fn(),
    ...overrides,
  };
  const utils = render(<CompactControlsPresenter {...props} />);
  return { ...utils, props };
}

describe("CompactControlsPresenter", () => {
  describe("play / pause", () => {
    it("offers Pause while playing and Play while paused", () => {
      const { unmount } = renderControls({ paused: false });
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      unmount();
      renderControls({ paused: true });
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("calls back on click", () => {
      const { props } = renderControls({ paused: true });
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
    });
  });

  describe("time display", () => {
    it("shows the elapsed and total time", () => {
      renderControls({ displayTime: 30, duration: 120 });
      expect(screen.getByText("0:30")).toBeInTheDocument();
      expect(screen.getByText("2:00")).toBeInTheDocument();
    });
  });

  describe("mute", () => {
    it("offers Mute while unmuted and Unmute while muted", () => {
      const { unmount } = renderControls({ muted: false });
      expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
      unmount();
      renderControls({ muted: true });
      expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    });

    it("calls back on click", () => {
      const { props } = renderControls();
      fireEvent.click(screen.getByRole("button", { name: "Mute" }));
      expect(props.onToggleMute).toHaveBeenCalledTimes(1);
    });
  });

  describe("seek bar", () => {
    it("is present and enabled with a duration", () => {
      renderControls({ duration: 120 });
      const bar = screen.getByRole("slider");
      expect(bar).toBeInTheDocument();
      expect(bar).not.toBeDisabled();
    });

    // The bar belongs below the row, on the frame's bottom edge, rather
    // than above it the way the pointer layout stacks them.
    it("comes after the button row", () => {
      const { container } = renderControls();
      const root = container.querySelector(
        '[data-testid="compact-controls-root"]',
      )!;
      const play = screen.getByRole("button", { name: "Pause" });
      const line = root.querySelector('[data-testid="seek-line"]')!;
      expect(
        play.compareDocumentPosition(line) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("is disabled without a duration", () => {
      renderControls({ duration: 0 });
      expect(screen.getByRole("slider")).toBeDisabled();
    });
  });

  // The whole point of this layout: at 320px the pointer row's trailing
  // controls are clipped off the frame and become unclickable. Absent is
  // the correct state, not clipped.
  describe("controls this layout does without", () => {
    it("has no settings, fullscreen, skip or volume controls", () => {
      renderControls();
      for (const name of [
        "Settings",
        "Full screen",
        "Exit full screen",
        "Back 10 seconds",
        "Forward 10 seconds",
        "Volume",
      ]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
        expect(screen.queryByRole("slider", { name })).not.toBeInTheDocument();
      }
    });

    it("renders no settings sheet even when settingsOpen is true", () => {
      const { container } = renderControls({ settingsOpen: true });
      expect(
        container.querySelector('[data-testid="settings-sheet"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("visibility", () => {
    it("fades out and stops taking input when hidden", () => {
      const { container } = renderControls({ visible: false });
      const root = container.querySelector<HTMLElement>(
        '[data-testid="compact-controls-root"]',
      );
      expect(root?.className).toContain("opacity-0");
      expect(root?.className).toContain("pointer-events-none");
    });

    it("shows the progress hairline only once the bar is hidden", () => {
      const { container, unmount } = renderControls({ visible: true });
      expect(
        container.querySelector('[data-testid="progress-hairline"]'),
      ).not.toBeInTheDocument();
      unmount();
      const hidden = renderControls({ visible: false });
      expect(
        hidden.container.querySelector('[data-testid="progress-hairline"]'),
      ).toBeInTheDocument();
    });
  });

  describe("ad break", () => {
    it("labels the interruption and disables seeking", () => {
      renderControls({ interrupted: true });
      expect(screen.getByText("Ad")).toBeInTheDocument();
      expect(screen.getByRole("slider")).toBeDisabled();
    });
  });
});
