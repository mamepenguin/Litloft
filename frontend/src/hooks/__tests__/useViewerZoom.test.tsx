import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { installPointerEvent } from "@/test/pointerEvent";
import { useViewerZoom } from "../useViewerZoom";

installPointerEvent();

const FRAME = { left: 0, top: 0, width: 400, height: 800 };

function box(r: { left: number; top: number; width: number; height: number }) {
  return {
    ...r,
    x: r.left,
    y: r.top,
    right: r.left + r.width,
    bottom: r.top + r.height,
    toJSON: () => ({}),
  } as DOMRect;
}

const calls = {
  prev: vi.fn(),
  next: vi.fn(),
  toggle: vi.fn(),
};

function Harness({
  resetKey = 0,
  readingDirection = "ltr" as "ltr" | "rtl",
}) {
  const zoom = useViewerZoom({
    resetKey,
    readingDirection,
    navigatePrev: calls.prev,
    navigateNext: calls.next,
    toggleControls: calls.toggle,
  });
  return (
    <div
      data-testid="frame"
      ref={(el) => {
        zoom.frameRef.current = el;
        if (el) el.getBoundingClientRect = () => box(FRAME);
      }}
      {...zoom.frameHandlers}
    >
      <div
        data-testid="content"
        ref={zoom.contentRef}
        style={zoom.contentStyle}
        data-scale={zoom.view.scale}
        data-settled={zoom.settledScale}
      >
        <img
          alt="page"
          ref={(el) => {
            if (!el) return;
            // Letterboxed: full width, 300 tall, centred. Measured through
            // whatever transform the content carries, as a browser would.
            el.getBoundingClientRect = () => {
              const s = zoom.view.scale;
              return box({
                left: 0 * s + zoom.view.x,
                top: 250 * s + zoom.view.y,
                width: 400 * s,
                height: 300 * s,
              });
            };
          }}
        />
      </div>
    </div>
  );
}

const frame = () => screen.getByTestId("frame");
const scale = () => Number(screen.getByTestId("content").dataset.scale);

function press(
  id: number,
  x: number,
  y: number,
  pointerType = "touch",
  buttons = 1,
) {
  fireEvent.pointerDown(frame(), { pointerId: id, clientX: x, clientY: y, pointerType, buttons });
}
function move(id: number, x: number, y: number, pointerType = "touch", buttons = 1) {
  fireEvent.pointerMove(frame(), { pointerId: id, clientX: x, clientY: y, pointerType, buttons });
}
function lift(id: number, x: number, y: number, pointerType = "touch") {
  fireEvent.pointerUp(frame(), { pointerId: id, clientX: x, clientY: y, pointerType });
}

function pinchOpen() {
  press(1, 150, 400);
  press(2, 250, 400);
  move(1, 100, 400);
  move(2, 300, 400);
  lift(1, 100, 400);
  lift(2, 300, 400);
}

beforeEach(() => {
  calls.prev.mockReset();
  calls.next.mockReset();
  calls.toggle.mockReset();
});

describe("useViewerZoom at fit", () => {
  it("pages on a touch swipe, as the viewers always have", () => {
    render(<Harness />);
    press(1, 300, 400);
    lift(1, 100, 400);
    expect(calls.prev).toHaveBeenCalledTimes(1);
    press(1, 100, 400);
    lift(1, 300, 400);
    expect(calls.next).toHaveBeenCalledTimes(1);
  });

  it("does not page on a mouse drag", () => {
    render(<Harness />);
    press(1, 300, 400, "mouse");
    lift(1, 100, 400, "mouse");
    expect(calls.prev).not.toHaveBeenCalled();
    expect(calls.next).not.toHaveBeenCalled();
  });

  it("pages on an edge click, swapped when reading right to left", () => {
    const { rerender } = render(<Harness />);
    press(1, 20, 400, "mouse");
    lift(1, 20, 400, "mouse");
    expect(calls.prev).toHaveBeenCalledTimes(1);
    rerender(<Harness readingDirection="rtl" />);
    press(1, 20, 400, "mouse");
    lift(1, 20, 400, "mouse");
    expect(calls.next).toHaveBeenCalledTimes(1);
  });

  it("toggles the chrome on a centre tap", () => {
    render(<Harness />);
    press(1, 200, 400);
    lift(1, 200, 400);
    expect(calls.toggle).toHaveBeenCalledTimes(1);
  });
});

describe("useViewerZoom pinch", () => {
  it("zooms by the ratio the fingers spread", () => {
    render(<Harness />);
    pinchOpen();
    expect(scale()).toBe(2);
    expect(Number(screen.getByTestId("content").dataset.settled)).toBe(2);
  });

  it("neither pages nor toggles when the fingers lift", () => {
    render(<Harness />);
    pinchOpen();
    expect(calls.prev).not.toHaveBeenCalled();
    expect(calls.next).not.toHaveBeenCalled();
    expect(calls.toggle).not.toHaveBeenCalled();
  });

  it("returns to fit when pinched below it", () => {
    render(<Harness />);
    press(1, 100, 400);
    press(2, 300, 400);
    move(1, 150, 400);
    move(2, 250, 400);
    expect(scale()).toBe(0.5);
    lift(1, 150, 400);
    lift(2, 250, 400);
    expect(scale()).toBe(1);
  });
});

describe("useViewerZoom while zoomed", () => {
  it("pans on a one-finger swipe instead of paging", () => {
    render(<Harness />);
    pinchOpen();
    const before = screen.getByTestId("content").style.transform;
    press(1, 300, 400);
    move(1, 100, 400);
    lift(1, 100, 400);
    expect(calls.prev).not.toHaveBeenCalled();
    expect(calls.next).not.toHaveBeenCalled();
    expect(screen.getByTestId("content").style.transform).not.toBe(before);
  });

  it("does not page on an edge tap, only toggles the chrome", () => {
    render(<Harness />);
    pinchOpen();
    press(1, 20, 400);
    lift(1, 20, 400);
    expect(calls.prev).not.toHaveBeenCalled();
    expect(calls.toggle).toHaveBeenCalledTimes(1);
  });

  it("goes back to fit when the picture changes", () => {
    const { rerender } = render(<Harness resetKey={0} />);
    pinchOpen();
    expect(scale()).toBe(2);
    rerender(<Harness resetKey={1} />);
    expect(scale()).toBe(1);
    expect(screen.getByTestId("content").style.transform).toBe("");
  });
});

describe("useViewerZoom wheel", () => {
  it("zooms on a ctrl wheel and keeps the page from zooming", () => {
    render(<Harness />);
    const event = new WheelEvent("wheel", {
      deltaY: -100,
      ctrlKey: true,
      clientX: 200,
      clientY: 400,
      cancelable: true,
    });
    act(() => {
      frame().dispatchEvent(event);
    });
    expect(scale()).toBeGreaterThan(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a plain wheel alone at fit", () => {
    render(<Harness />);
    const event = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    act(() => {
      frame().dispatchEvent(event);
    });
    expect(scale()).toBe(1);
    expect(event.defaultPrevented).toBe(false);
  });
});
