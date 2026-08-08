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
  });

  describe("playback speed", () => {
    it("offers exactly the supported rates", () => {
      renderControls();
      const select = screen.getByRole("combobox", { name: "Playback speed" });
      const values = Array.from(select.querySelectorAll("option")).map((o) => o.value);
      expect(values).toEqual(["0.5", "0.75", "1", "1.25", "1.5", "2"]);
    });

    it("shows the rate the player actually applied", () => {
      renderControls({ playbackRate: 1.5 });
      expect(screen.getByRole("combobox", { name: "Playback speed" })).toHaveValue("1.5");
    });

    it("falls back to the nearest offered rate for an unexpected value", () => {
      // A backend can report a rate we never offer. Showing a blank
      // select would be worse than showing the closest match.
      renderControls({ playbackRate: 1.75 });
      expect(screen.getByRole("combobox", { name: "Playback speed" })).toHaveValue("2");
    });

    it("reports the chosen rate as a number", () => {
      const { props } = renderControls();
      fireEvent.change(screen.getByRole("combobox", { name: "Playback speed" }), {
        target: { value: "0.5" },
      });
      expect(props.onPlaybackRateChange).toHaveBeenCalledWith(0.5);
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

    it("disables seeking and speed, which belong to the file and not the ad", () => {
      renderControls({ interrupted: true });
      expect(screen.getByRole("slider", { name: "Seek" })).toBeDisabled();
      expect(screen.getByRole("combobox", { name: "Playback speed" })).toBeDisabled();
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
