import { describe, expect, it } from "vitest";
import { FULL_LOOK, inlineLook, type Box } from "../fullscreenKeyframes";

function parse(look: { transform: string; clipPath: string }) {
  const t = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(look.transform);
  const c = /inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px round ([\d.]+)px\)/.exec(
    look.clipPath,
  );
  if (!t || !c) throw new Error(`unparseable look: ${JSON.stringify(look)}`);
  return {
    dx: Number(t[1]),
    dy: Number(t[2]),
    s: Number(t[3]),
    top: Number(c[1]),
    right: Number(c[2]),
    bottom: Number(c[3]),
    left: Number(c[4]),
    radius: Number(c[5]),
  };
}

/** Where the clipped, transformed viewport-sized frame is drawn. */
function visibleBox(look: { transform: string; clipPath: string }, vw: number, vh: number): Box {
  const p = parse(look);
  return {
    left: p.dx + p.left * p.s,
    top: p.dy + p.top * p.s,
    width: (vw - p.left - p.right) * p.s,
    height: (vh - p.top - p.bottom) * p.s,
  };
}

const CASES: Array<{ name: string; rect: Box; vw: number; vh: number }> = [
  { name: "portrait phone", rect: { left: 16, top: 56, width: 370, height: 208.125 }, vw: 402, vh: 714 },
  { name: "landscape phone", rect: { left: 200, top: 40, width: 444, height: 249.75 }, vw: 844, vh: 390 },
  { name: "exactly 16:9 viewport", rect: { left: 0, top: 0, width: 320, height: 180 }, vw: 640, vh: 360 },
];

describe("inlineLook", () => {
  for (const { name, rect, vw, vh } of CASES) {
    it(`draws the frame over the inline rect, ${name}`, () => {
      const box = visibleBox(inlineLook(rect, 0, { width: vw, height: vh }), vw, vh);
      expect(box.left).toBeCloseTo(rect.left, 3);
      expect(box.top).toBeCloseTo(rect.top, 3);
      expect(box.width).toBeCloseTo(rect.width, 3);
      expect(box.height).toBeCloseTo(rect.height, 3);
    });
  }

  it("scales uniformly, so the picture is never stretched", () => {
    const p = parse(inlineLook(CASES[0].rect, 0, { width: 402, height: 714 }));
    expect(p.s).toBeCloseTo(370 / 402, 6);
  });

  it("clips the letterbox above and below in portrait, nothing at the sides", () => {
    const p = parse(inlineLook(CASES[0].rect, 0, { width: 402, height: 714 }));
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
    expect(p.top).toBeCloseTo((714 - 402 * (9 / 16)) / 2, 3);
    expect(p.bottom).toBeCloseTo(p.top, 6);
  });

  it("clips the pillarbox at the sides in landscape, nothing above or below", () => {
    const p = parse(inlineLook(CASES[1].rect, 0, { width: 844, height: 390 }));
    expect(p.top).toBe(0);
    expect(p.bottom).toBe(0);
    expect(p.left).toBeCloseTo((844 - 390 * (16 / 9)) / 2, 3);
    expect(p.right).toBeCloseTo(p.left, 6);
  });

  it("keeps the inline corner radius on screen by dividing it by the scale", () => {
    const p = parse(inlineLook(CASES[0].rect, 12, { width: 402, height: 714 }));
    expect(p.radius * p.s).toBeCloseTo(12, 6);
  });
});

describe("FULL_LOOK", () => {
  it("is the untransformed, unclipped frame", () => {
    expect(parse(FULL_LOOK)).toEqual({
      dx: 0,
      dy: 0,
      s: 1,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      radius: 0,
    });
  });
});
