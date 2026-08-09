import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PointerControlsPresenter } from "../PointerControlsPresenter";
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
  const utils = render(<PointerControlsPresenter {...props} />);
  return { ...utils, props };
}

describe("PointerControlsPresenter", () => {
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

  describe("skip buttons", () => {
    it("skips backwards and forwards by 10 seconds", () => {
      const { props } = renderControls();
      fireEvent.click(screen.getByRole("button", { name: "Back 10 seconds" }));
      fireEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
      expect(props.onSkip).toHaveBeenNthCalledWith(1, -10);
      expect(props.onSkip).toHaveBeenNthCalledWith(2, 10);
    });
  });

  describe("time display", () => {
    it("shows the elapsed and total time", () => {
      renderControls({ displayTime: 30, duration: 120 });
      expect(screen.getByText("0:30")).toBeInTheDocument();
      expect(screen.getByText("2:00")).toBeInTheDocument();
    });
  });

  describe("seek bar", () => {
    it("spans the duration and sits at the current position", () => {
      renderControls({ displayTime: 30, duration: 120 });
      const seek = screen.getByRole("slider", { name: "Seek" });
      expect(seek).toHaveAttribute("max", "120");
      expect(seek).toHaveValue("30");
    });

    it("reports drags through the scrub callbacks", () => {
      const { props } = renderControls();
      const seek = screen.getByRole("slider", { name: "Seek" });
      fireEvent.pointerDown(seek);
      fireEvent.change(seek, { target: { value: "75" } });
      fireEvent.pointerUp(seek);
      expect(props.onScrubStart).toHaveBeenCalled();
      expect(props.onScrubChange).toHaveBeenCalledWith(75);
      expect(props.onScrubEnd).toHaveBeenCalled();
    });

    it("treats arrow keys as a scrub", () => {
      const { props } = renderControls();
      const seek = screen.getByRole("slider", { name: "Seek" });
      fireEvent.keyDown(seek, { key: "ArrowRight" });
      fireEvent.keyUp(seek, { key: "ArrowRight" });
      expect(props.onScrubStart).toHaveBeenCalledTimes(1);
      expect(props.onScrubEnd).toHaveBeenCalledTimes(1);
    });

    it("ignores keys that do not move the slider", () => {
      // Tab-ing through would otherwise commit a seek to the position
      // already playing, which makes the YouTube player re-buffer.
      const { props } = renderControls();
      const seek = screen.getByRole("slider", { name: "Seek" });
      for (const key of ["Tab", "Enter", "a"]) {
        fireEvent.keyDown(seek, { key });
        fireEvent.keyUp(seek, { key });
      }
      expect(props.onScrubStart).not.toHaveBeenCalled();
      expect(props.onScrubEnd).not.toHaveBeenCalled();
    });

    it("stretches the input over its row so a finger can land on it", () => {
      // An appearance-none range collapses to its 4px track, which is
      // clickable with a mouse and untouchable with a thumb.
      renderControls();
      const seek = screen.getByRole("slider", { name: "Seek" });
      expect(seek.className).toContain("h-full");
      // Without this the drag gets claimed as a pan gesture.
      expect(seek.className).toContain("touch-none");
    });

    it("renders the buffered range as a proportional width", () => {
      const { container } = renderControls({ bufferedFraction: 0.42 });
      const buffered = container.querySelector("[data-testid='buffered-range']");
      expect(buffered).toHaveStyle({ width: "42%" });
    });
  });

  describe("volume", () => {
    it("labels the mute toggle by the action it performs", () => {
      const { unmount } = renderControls({ muted: false });
      expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
      unmount();
      renderControls({ muted: true });
      expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    });

    it("reports slider changes on a 0-1 scale", () => {
      const { props } = renderControls();
      fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
        target: { value: "0.3" },
      });
      expect(props.onVolumeChange).toHaveBeenCalledWith(0.3);
    });

    it("paints a track behind the slider", () => {
      // The shared range styling leaves the native track transparent,
      // because the seek bar draws its own. Without one here the
      // control renders as a knob floating over the video.
      const { container } = renderControls({ volume: 0.5 });
      expect(container.querySelector("[data-testid='volume-track']")).toBeInTheDocument();
      expect(container.querySelector("[data-testid='volume-fill']")).toBeInTheDocument();
    });

    it("empties the fill while muted without forgetting the level", () => {
      const { container } = renderControls({ muted: true, volume: 0.8 });
      expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0");
      expect(container.querySelector("[data-testid='volume-fill']")).toHaveStyle({
        width: "calc(0% + 6px)",
      });
    });
  });

  describe("settings", () => {
    it("opens the panel from the bar", () => {
      const { props } = renderControls({ settingsOpen: false });
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(props.onSettingsOpenChange).toHaveBeenCalledWith(true);
    });

    it("keeps the panel out of the way until it is asked for", () => {
      renderControls({ settingsOpen: false });
      expect(screen.queryByTestId("settings-sheet")).not.toBeInTheDocument();
    });

    it("offers speed, captions and the owner's own rows once open", () => {
      renderControls({
        settingsOpen: true,
        settingsExtra: <button type="button">Switch player</button>,
      });
      expect(
        screen.getByRole("radiogroup", { name: "Playback speed" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Subtitles" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Switch player" }),
      ).toBeInTheDocument();
    });

    it("stands as a panel rather than a full-width sheet", () => {
      // The mouse layout can see the whole frame at once; a sheet
      // spanning it would cover the video to show six chips.
      renderControls({ settingsOpen: true });
      expect(screen.getByTestId("settings-sheet")).toHaveAttribute(
        "data-placement",
        "popover",
      );
    });

    it("reports the chosen rate as a number", () => {
      const { props } = renderControls({ settingsOpen: true });
      fireEvent.click(screen.getByRole("radio", { name: "0.5x" }));
      expect(props.onPlaybackRateChange).toHaveBeenCalledWith(0.5);
    });

    it("marks the rate the player actually applied", () => {
      renderControls({ settingsOpen: true, playbackRate: 1.5 });
      expect(screen.getByRole("radio", { name: "1.5x" })).toBeChecked();
    });

    it("falls back to the nearest offered rate for an unexpected value", () => {
      // A backend can report a rate we never offer. Leaving every chip
      // unmarked would be worse than marking the closest match.
      renderControls({ settingsOpen: true, playbackRate: 1.75 });
      expect(screen.getByRole("radio", { name: "2x" })).toBeChecked();
    });
  });

  describe("fullscreen", () => {
    it("labels the toggle by the action it performs", () => {
      const { unmount } = renderControls({ isFullscreen: false });
      expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
      unmount();
      renderControls({ isFullscreen: true });
      expect(screen.getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();
    });
  });

  describe("interrupted (ad break)", () => {
    it("announces the interruption", () => {
      renderControls({ interrupted: true });
      expect(screen.getByText("Ad")).toBeInTheDocument();
    });

    it("disables seeking and settings, which belong to the file and not the ad", () => {
      renderControls({ interrupted: true });
      expect(screen.getByRole("slider", { name: "Seek" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Settings" })).toBeDisabled();
    });

    it("drops the blurred scrim so the ad's own controls stay legible", () => {
      // Covering an ad's skip button breaks the player, and the embed
      // terms call obscuring ad controls interference.
      const { rerender, container, props } = renderControls({
        interrupted: true,
        backendOwnsFrame: true,
      });
      const scrim = () =>
        container.querySelector("[data-testid='control-bar-scrim']")?.className ?? "";
      expect(scrim()).not.toContain("backdrop-blur");

      rerender(
        <PointerControlsPresenter {...props} interrupted={false} backendOwnsFrame={false} />,
      );
      expect(scrim()).toContain("backdrop-blur");
    });

    it("hides the timings rather than showing the ad's clock as the file's", () => {
      renderControls({ interrupted: true, displayTime: 3, duration: 120 });
      expect(screen.queryByText("2:00")).not.toBeInTheDocument();
      expect(screen.getAllByText("--:--").length).toBeGreaterThan(0);
    });

    it("still allows play/pause and mute", () => {
      renderControls({ interrupted: true });
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Mute" })).toBeEnabled();
    });
  });

  describe("auto-hide", () => {
    it("fades out and stops capturing pointers when hidden", () => {
      const { container } = renderControls({ visible: false });
      const root = container.firstElementChild;
      expect(root?.className).toContain("opacity-0");
      expect(root?.className).toContain("pointer-events-none");
    });

    it("comes back for keyboard users via focus-within", () => {
      const { container } = renderControls({ visible: false });
      expect(container.firstElementChild?.className).toContain("focus-within:opacity-100");
    });

    it("respects prefers-reduced-motion", () => {
      const { container } = renderControls({ visible: true });
      expect(container.firstElementChild?.className).toContain("motion-reduce:transition-none");
    });
  });
});
