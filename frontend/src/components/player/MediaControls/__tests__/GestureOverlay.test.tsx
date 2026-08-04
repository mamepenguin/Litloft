import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GestureOverlay } from "../GestureOverlay";

function renderOverlay(props: Partial<React.ComponentProps<typeof GestureOverlay>> = {}) {
  return render(
    <GestureOverlay
      interactive
      skip={null}
      boosting={false}
      boostRate={2}
      handlers={{}}
      {...props}
    />,
  );
}

function overlayEl(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe("GestureOverlay", () => {
  it("captures pointers during normal playback", () => {
    const { container } = renderOverlay();
    expect(overlayEl(container).style.pointerEvents).toBe("auto");
  });

  it("stands down when the frame is not ours to cover", () => {
    // An ad's skip button and the end screen's related videos have to
    // stay clickable; covering them breaks the player and the terms.
    const { container } = renderOverlay({ interactive: false });
    expect(overlayEl(container).style.pointerEvents).toBe("none");
  });

  it("shows nothing while no gesture is in flight", () => {
    renderOverlay();
    expect(screen.queryByTestId("skip-feedback")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boost-pill")).not.toBeInTheDocument();
  });

  it("shows the accumulated seconds on the side that was tapped", () => {
    renderOverlay({ skip: { side: "forward", seconds: 20 } });
    const feedback = screen.getByTestId("skip-feedback");
    expect(feedback).toHaveTextContent("20s");
    expect(feedback.dataset.side).toBe("forward");
  });

  it("marks the backward skip on the other side", () => {
    renderOverlay({ skip: { side: "back", seconds: 10 } });
    expect(screen.getByTestId("skip-feedback").dataset.side).toBe("back");
  });

  it("keeps the feedback out of the accessibility tree", () => {
    // The same operations are reachable as real buttons and keyboard
    // shortcuts; announcing a decorative ripple adds only noise.
    renderOverlay({ skip: { side: "forward", seconds: 10 } });
    expect(screen.getByTestId("skip-feedback")).toHaveAttribute("aria-hidden", "true");
  });

  it("announces the boosted rate", () => {
    renderOverlay({ boosting: true, boostRate: 2 });
    expect(screen.getByTestId("boost-pill")).toHaveTextContent("Playing at 2x");
  });

  it("wires the gesture handlers onto the overlay", () => {
    const onPointerDown = vi.fn();
    const { container } = renderOverlay({ handlers: { onPointerDown } });
    overlayEl(container).dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("does not let the browser claim the gesture as a scroll or a zoom", () => {
    // Without this iOS runs its own double-tap zoom and long-press
    // callout on top of ours.
    const { container } = renderOverlay();
    expect(overlayEl(container).className).toContain("touch-none");
    expect(overlayEl(container).className).toContain("select-none");
  });
});
