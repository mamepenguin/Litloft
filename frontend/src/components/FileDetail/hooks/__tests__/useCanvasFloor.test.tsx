/**
 * The canvas measurement the floor is a fraction of.
 *
 * It exists instead of `70cqh` because `container-type: size` implies
 * `contain: layout`, which would make the canvas the containing block
 * for the archive's unportalled full-screen viewer. Nothing about that
 * is visible in jsdom, so what is pinned here is the contract: the
 * property is published from a measurement, only while enabled, and is
 * taken off again when it stops being.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  CANVAS_HEIGHT_VAR,
  useCanvasFloor,
} from "../useCanvasFloor";

let observed: Element[] = [];
let notify: (() => void) | null = null;

class FakeResizeObserver {
  constructor(cb: () => void) {
    notify = cb;
  }
  observe(el: Element) {
    observed.push(el);
  }
  unobserve(el: Element) {
    observed = observed.filter((o) => o !== el);
  }
  disconnect() {
    observed = [];
  }
}

/** jsdom reports 0 for every box, so the height is stated outright. */
function makeCanvas(height: number, padding = "0px") {
  const el = document.createElement("main");
  Object.defineProperty(el, "clientHeight", {
    value: height,
    configurable: true,
  });
  el.style.paddingTop = padding;
  el.style.paddingBottom = padding;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  observed = [];
  notify = null;
  document.body.innerHTML = "";
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

describe("useCanvasFloor", () => {
  it("publishes the canvas's own height", () => {
    const { result } = renderHook(() => useCanvasFloor(true));
    const el = makeCanvas(900);
    result.current(el);

    expect(el.style.getPropertyValue(CANVAS_HEIGHT_VAR)).toBe("900px");
    expect(observed).toEqual([el]);
  });

  it("subtracts the padding the sheet's peek adds", () => {
    // On a phone the canvas carries a bottom padding the size of the
    // sheet's resting strip. Counting it would promise the viewer height
    // that is behind the sheet.
    const { result } = renderHook(() => useCanvasFloor(true));
    const el = makeCanvas(900, "40px");
    result.current(el);

    expect(el.style.getPropertyValue(CANVAS_HEIGHT_VAR)).toBe("820px");
  });

  it("republishes when the canvas resizes", () => {
    const { result } = renderHook(() => useCanvasFloor(true));
    const el = makeCanvas(900);
    result.current(el);

    Object.defineProperty(el, "clientHeight", {
      value: 500,
      configurable: true,
    });
    notify!();
    expect(el.style.getPropertyValue(CANVAS_HEIGHT_VAR)).toBe("500px");
  });

  it("publishes nothing for a canvas that has not been laid out", () => {
    // Zero is "not measured yet", not "no room" — a floor written from
    // it would claim a measurement that never happened.
    const { result } = renderHook(() => useCanvasFloor(true));
    const el = makeCanvas(0);
    result.current(el);

    expect(el.style.getPropertyValue(CANVAS_HEIGHT_VAR)).toBe("");
  });

  it("writes nothing while disabled", () => {
    const { result } = renderHook(() => useCanvasFloor(false));
    const el = makeCanvas(900);
    result.current(el);

    expect(el.style.getPropertyValue(CANVAS_HEIGHT_VAR)).toBe("");
  });

  it("takes the property back off when it stops being enabled", () => {
    // A rotation crossing the mobile breakpoint. Left behind, the value
    // would sit on the element describing a canvas that no longer has a
    // floor.
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useCanvasFloor(on),
      { initialProps: { on: true } },
    );
    const el = makeCanvas(900);
    result.current(el);
    expect(el.style.getPropertyValue(CANVAS_HEIGHT_VAR)).toBe("900px");

    rerender({ on: false });
    expect(el.style.getPropertyValue(CANVAS_HEIGHT_VAR)).toBe("");
  });

  it("stops observing and cleans up when the canvas goes away", () => {
    const { result } = renderHook(() => useCanvasFloor(true));
    const el = makeCanvas(900);
    result.current(el);
    expect(observed).toEqual([el]);

    result.current(null);
    expect(observed).toEqual([]);
  });
});
