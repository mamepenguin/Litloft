import { act, fireEvent, render, screen } from "@testing-library/react";
import { useCallback } from "react";
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

type PictureBox = { left: number; top: number; width: number; height: number };

/** Letterboxed: full width, 300 tall, centred. */
const LETTERBOXED: PictureBox[] = [{ left: 0, top: 250, width: 400, height: 300 }];

function Harness({
  resetKey = 0,
  readingDirection = "ltr" as "ltr" | "rtl",
  open = true,
  pictures = LETTERBOXED,
}) {
  const zoom = useViewerZoom({
    resetKey,
    readingDirection,
    navigatePrev: calls.prev,
    navigateNext: calls.next,
    toggleControls: calls.toggle,
  });
  const { frameRef } = zoom;
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) el.getBoundingClientRect = () => box(FRAME);
      frameRef(el);
    },
    [frameRef],
  );
  if (!open) return null;
  return (
    <div data-testid="frame" ref={attach} {...zoom.frameHandlers}>
      <div
        data-testid="content"
        ref={zoom.contentRef}
        style={zoom.contentStyle}
        data-scale={zoom.view.scale}
        data-settled={zoom.settledScale}
      >
        {pictures.map((picture, i) => (
          <img
            key={i}
            alt="page"
            ref={(el) => {
              if (!el) return;
              // Measured through whatever transform the content carries, as
              // a browser would.
              el.getBoundingClientRect = () => {
                const v = zoom.view;
                return box({
                  left: picture.left * v.scale + v.x,
                  top: picture.top * v.scale + v.y,
                  width: picture.width * v.scale,
                  height: picture.height * v.scale,
                });
              };
            }}
          />
        ))}
      </div>
    </div>
  );
}

const frame = () => screen.getByTestId("frame");
const translate = () => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
    screen.getByTestId("content").style.transform,
  );
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
};
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

describe("useViewerZoom thresholds", () => {
  it("does not page on a swipe shorter than the threshold", () => {
    render(<Harness />);
    press(1, 300, 400);
    lift(1, 260, 400);
    expect(calls.prev).not.toHaveBeenCalled();
    expect(calls.next).not.toHaveBeenCalled();
  });

  it("pages forward from the right edge, backward when reading right to left", () => {
    const { rerender } = render(<Harness />);
    press(1, 380, 400);
    lift(1, 380, 400);
    expect(calls.next).toHaveBeenCalledTimes(1);
    rerender(<Harness readingDirection="rtl" />);
    press(1, 380, 400);
    lift(1, 380, 400);
    expect(calls.prev).toHaveBeenCalledTimes(1);
  });
});

describe("useViewerZoom clamping", () => {
  it("stops a pan at the picture's edge", () => {
    render(<Harness />);
    pinchOpen();
    press(1, 390, 400);
    move(1, -2000, 400);
    lift(1, -2000, 400);
    // 2x: the picture is 800 wide in a 400 frame.
    expect(translate().x).toBe(-400);
  });

  it("measures the picture as it is at fit, not as the zoom draws it", () => {
    // Pillarboxed: 200 wide at 2x is exactly the frame, so it stays centred.
    render(<Harness pictures={[{ left: 100, top: 0, width: 200, height: 800 }]} />);
    pinchOpen();
    press(1, 10, 400);
    move(1, 2000, 400);
    lift(1, 2000, 400);
    expect(translate().x).toBe(-200);
  });

  it("clamps a split page against the half inside the frame", () => {
    // Drawn at twice the frame's width; the right half hangs outside.
    render(<Harness pictures={[{ left: 0, top: 250, width: 800, height: 300 }]} />);
    pinchOpen();
    press(1, 390, 400);
    move(1, -2000, 400);
    lift(1, -2000, 400);
    expect(translate().x).toBe(-400);
  });

  it("clamps a pair against both pages together", () => {
    render(
      <Harness
        pictures={[
          { left: 0, top: 100, width: 200, height: 200 },
          { left: 200, top: 300, width: 200, height: 400 },
        ]}
      />,
    );
    pinchOpen();
    press(1, 200, 790);
    move(1, 200, 3000);
    lift(1, 200, 3000);
    // Together the pages span 100..700, 1200 tall at 2x, so the pan stops
    // with their top at the frame's; either page alone would be centred.
    expect(translate().y).toBe(-200);
  });
});

describe("useViewerZoom interruptions", () => {
  it("forgets a finger the system cancelled", () => {
    render(<Harness />);
    press(1, 150, 400);
    press(2, 250, 400);
    fireEvent.pointerCancel(frame(), { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerCancel(frame(), { pointerId: 2, pointerType: "touch" });
    press(3, 300, 400);
    lift(3, 100, 400);
    expect(calls.prev).toHaveBeenCalledTimes(1);
  });

  it("forgets a finger that was down when the picture changed", () => {
    const { rerender } = render(<Harness resetKey={0} />);
    press(1, 150, 400);
    rerender(<Harness resetKey={1} />);
    press(2, 300, 400);
    lift(2, 100, 400);
    expect(calls.prev).toHaveBeenCalledTimes(1);
  });
});

describe("useViewerZoom mounted closed", () => {
  it("takes the wheel once the frame appears", () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
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
    expect(event.defaultPrevented).toBe(true);
    expect(scale()).toBeGreaterThan(1);
  });
});

describe("useViewerZoom Safari trackpad pinch", () => {
  function gesture(type: string, props: Record<string, number>) {
    const e = Object.assign(new Event(type, { cancelable: true }), props);
    act(() => {
      frame().dispatchEvent(e);
    });
    return e;
  }

  it("zooms on WebKit gesture events and keeps the page from zooming", () => {
    render(<Harness />);
    const start = gesture("gesturestart", { scale: 1, clientX: 200, clientY: 400 });
    gesture("gesturechange", { scale: 2, clientX: 200, clientY: 400 });
    gesture("gestureend", { scale: 2, clientX: 200, clientY: 400 });
    expect(start.defaultPrevented).toBe(true);
    expect(scale()).toBe(2);
  });

  it("leaves a touch pinch to the pointer handlers", () => {
    render(<Harness />);
    press(1, 150, 400);
    press(2, 250, 400);
    gesture("gesturestart", { scale: 1, clientX: 200, clientY: 400 });
    gesture("gesturechange", { scale: 3, clientX: 200, clientY: 400 });
    expect(scale()).toBe(1);
  });
});

