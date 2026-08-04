import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlaybackRateSheet } from "../PlaybackRateSheet";

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof PlaybackRateSheet>> = {},
) {
  const props = {
    playbackRate: 1,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const utils = render(<PlaybackRateSheet {...props} />);
  return { ...utils, props };
}

describe("PlaybackRateSheet", () => {
  it("offers exactly the supported rates", () => {
    renderSheet();
    const options = screen.getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual([
      "0.5x",
      "0.75x",
      "Normal",
      "1.25x",
      "1.5x",
      "2x",
    ]);
  });

  it("marks the current rate as chosen", () => {
    renderSheet({ playbackRate: 1.5 });
    expect(screen.getByRole("radio", { name: "1.5x" })).toBeChecked();
  });

  it("shows the rate the player actually applied", () => {
    // A backend that refuses the requested rate must not leave the
    // sheet claiming it succeeded.
    renderSheet({ playbackRate: 1.7 });
    expect(screen.getByRole("radio", { name: "1.5x" })).toBeChecked();
  });

  it("reports the chosen rate as a number", () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByRole("radio", { name: "2x" }));
    expect(props.onSelect).toHaveBeenCalledWith(2);
  });

  it("closes once a rate is chosen", () => {
    // Nothing else to do in here, and the sheet covers the video.
    const { props } = renderSheet();
    fireEvent.click(screen.getByRole("radio", { name: "2x" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the backdrop", () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByTestId("rate-sheet-backdrop"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { props } = renderSheet();
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("names the group so the choice has context", () => {
    renderSheet();
    expect(
      screen.getByRole("radiogroup", { name: "Playback speed" }),
    ).toBeInTheDocument();
  });

  it("stays inside the frame so pseudo-fullscreen keeps it visible", () => {
    // The frame is position: fixed while faking fullscreen; anything
    // rendered outside it disappears behind the video.
    const { container } = renderSheet();
    expect(container.firstElementChild?.className).toContain("absolute");
  });
});
