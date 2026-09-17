import { describe, it, expect, afterEach } from "vitest";

import {
  computeSurfaceGeometry,
  layoutKey,
  measureSurface,
  sameGeometry,
  type SurfaceMeasurement,
} from "../shellSurface";

const frame = { x: 16, y: 120, width: 370, height: 208 };

function measurement(overrides: Partial<SurfaceMeasurement> = {}): SurfaceMeasurement {
  return { frame, scrollY: 0, fixed: false, scroller: null, sticky: null, ...overrides };
}

describe("computeSurfaceGeometry", () => {
  it("places a frame in the document by its document top", () => {
    expect(computeSurfaceGeometry(measurement({ scrollY: 300 }))).toEqual({
      x: 16,
      width: 370,
      height: 208,
      anchor: "document",
      top: 420,
      scroller: null,
      stickTop: null,
      stickLimit: null,
    });
  });

  it("gives the same geometry however far the document has scrolled", () => {
    const at = (scrollY: number) =>
      computeSurfaceGeometry(measurement({ scrollY, frame: { ...frame, y: 420 - scrollY } }));
    expect(at(0)).toEqual(at(250));
  });

  it("places a frame in a scrolling element by its top in that element's content", () => {
    const geometry = computeSurfaceGeometry(
      measurement({
        scrollY: 999,
        scroller: { box: { x: 0, y: 56, width: 402, height: 700 }, scrollTop: 40 },
      }),
    );
    expect(geometry).toMatchObject({
      anchor: "scroller",
      top: 120 - 56 + 40,
      scroller: { x: 0, y: 56, width: 402, height: 700 },
    });
  });

  it("places a fixed frame by its viewport top and ignores scrolling", () => {
    expect(computeSurfaceGeometry(measurement({ fixed: true, scrollY: 500 }))).toMatchObject({
      anchor: "fixed",
      top: 120,
      stickTop: null,
    });
  });

  it("describes a stuck frame by where it belongs and where it sticks", () => {
    const geometry = computeSurfaceGeometry(
      measurement({
        scrollY: 300,
        frame: { ...frame, y: 0 },
        sticky: { cssTop: 0, frameOffset: 0, belowFrame: 88, blockBottom: 900, naturalTop: -196 },
      }),
    );
    expect(geometry).toMatchObject({
      anchor: "document",
      top: 104,
      stickTop: 0,
      stickLimit: 900 + 300 - 88,
    });
  });

  it("counts a sticky frame in a scrolling element from that element", () => {
    const geometry = computeSurfaceGeometry(
      measurement({
        frame: { ...frame, y: 70 },
        scroller: { box: { x: 0, y: 56, width: 402, height: 700 }, scrollTop: 200 },
        sticky: { cssTop: 8, frameOffset: 6, belowFrame: 0, blockBottom: 1000, naturalTop: -100 },
      }),
    );
    expect(geometry).toMatchObject({
      anchor: "scroller",
      top: -100 - 56 + 200,
      stickTop: 56 + 8 + 6,
      stickLimit: 1000 - 56 + 200,
    });
  });
});

describe("sameGeometry", () => {
  const geometry = computeSurfaceGeometry(measurement());

  it("ignores half-pixel noise", () => {
    expect(sameGeometry(geometry, { ...geometry, top: geometry.top + 0.2 })).toBe(true);
  });

  it("notices a real move, and the frame going away", () => {
    expect(sameGeometry(geometry, { ...geometry, top: geometry.top + 1 })).toBe(false);
    expect(sameGeometry(geometry, null)).toBe(false);
    expect(sameGeometry(null, null)).toBe(true);
  });
});

describe("measureSurface", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function place(element: HTMLElement, box: { x: number; y: number; width: number; height: number }) {
    element.getBoundingClientRect = () =>
      ({ ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height }) as DOMRect;
  }

  function scrollable(element: HTMLElement, scrollTop: number) {
    Object.defineProperty(element, "scrollHeight", { value: 3000 });
    Object.defineProperty(element, "clientHeight", { value: 700 });
    element.scrollTop = scrollTop;
  }

  it("finds the element that scrolls, and not one that could but does not", () => {
    document.body.innerHTML = `
      <div id="scroller" style="overflow-y: auto">
        <div id="quiet" style="overflow-y: auto"><div id="frame"></div></div>
      </div>`;
    const scroller = document.getElementById("scroller")!;
    scrollable(scroller, 30);
    place(scroller, { x: 0, y: 56, width: 402, height: 700 });
    place(document.getElementById("frame")!, frame);

    const structure = measureSurface(document.getElementById("frame")!);

    expect(structure.scroller).toBe(scroller);
    expect(structure.measurement.scroller).toEqual({ box: { x: 0, y: 56, width: 402, height: 700 }, scrollTop: 30 });
    expect(structure.measurement.fixed).toBe(false);
  });

  it("treats a frame inside a fixed element as fixed, whatever scrolls around it", () => {
    document.body.innerHTML = `
      <div id="scroller" style="overflow-y: auto">
        <div style="position: fixed"><div id="frame"></div></div>
      </div>`;
    scrollable(document.getElementById("scroller")!, 30);
    place(document.getElementById("frame")!, frame);

    const structure = measureSurface(document.getElementById("frame")!);

    expect(structure.measurement.fixed).toBe(true);
    expect(structure.scroller).toBeNull();
    expect(structure.sticky).toBeNull();
  });

  it("ignores a sticky ancestor that sticks against something that does not scroll", () => {
    document.body.innerHTML = `
      <div style="overflow: hidden">
        <div id="sticky" style="position: sticky; top: 0"><div id="frame"></div></div>
      </div>`;
    place(document.getElementById("frame")!, frame);

    expect(measureSurface(document.getElementById("frame")!).sticky).toBeNull();
  });

  it("measures a sticky ancestor that sticks against the document, and leaves its style as it was", () => {
    document.body.innerHTML = `
      <div id="block">
        <div id="sticky" style="position: sticky; top: 12px"><div id="frame"></div></div>
      </div>`;
    const sticky = document.getElementById("sticky")!;
    const target = document.getElementById("frame")!;
    place(document.getElementById("block")!, { x: 0, y: -50, width: 402, height: 900 });
    place(sticky, { x: 0, y: 12, width: 402, height: 300 });
    let unstuck = false;
    target.getBoundingClientRect = () => {
      const y = sticky.style.position === "static" ? -80 : 12;
      if (y === -80) unstuck = true;
      return { x: 0, y, width: 402, height: 226, top: y, left: 0, right: 402, bottom: y + 226 } as DOMRect;
    };

    const structure = measureSurface(target);

    expect(unstuck).toBe(true);
    expect(structure.sticky).toBe(sticky);
    expect(structure.measurement.sticky).toEqual({
      cssTop: 12,
      frameOffset: 0,
      belowFrame: 312 - 238,
      blockBottom: 850,
      naturalTop: -80,
    });
    expect(sticky.style.position).toBe("sticky");
  });

  it("has a layout key that stays put while only the document scrolls", () => {
    document.body.innerHTML = `<div id="frame"></div>`;
    const target = document.getElementById("frame")!;
    place(target, frame);
    const structure = measureSurface(target);
    const before = layoutKey(target, structure);

    Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
    place(target, { ...frame, y: frame.y - 200 });
    expect(layoutKey(target, structure)).toBe(before);

    place(target, { ...frame, y: frame.y - 150 });
    expect(layoutKey(target, structure)).not.toBe(before);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});
