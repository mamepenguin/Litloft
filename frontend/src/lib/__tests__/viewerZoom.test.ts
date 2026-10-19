import { describe, expect, it } from "vitest";

import {
  FIT,
  MAX_SCALE,
  clampView,
  settleView,
  zoomAbout,
  type Rect,
  type Size,
} from "../viewerZoom";

const frame: Size = { width: 400, height: 800 };
// A landscape picture letterboxed into a portrait frame.
const content: Rect = { x: 0, y: 250, width: 400, height: 300 };

describe("zoomAbout", () => {
  it("keeps the point under the pinch where it was", () => {
    const origin = { x: 100, y: 400 };
    const next = zoomAbout(FIT, 2, origin);
    // The picture point that was under the origin is still under it.
    expect((origin.x - next.x) / next.scale).toBeCloseTo(origin.x);
    expect((origin.y - next.y) / next.scale).toBeCloseTo(origin.y);
    expect(next.scale).toBe(2);
  });

  it("does not go past the largest scale", () => {
    expect(zoomAbout(FIT, 10, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
  });

  it("lets a pinch go below fit while the fingers are down", () => {
    expect(zoomAbout(FIT, 0.5, { x: 200, y: 400 }).scale).toBe(0.5);
  });
});

describe("clampView", () => {
  it("never leaves a gap on an axis where the picture is larger than the frame", () => {
    // 2x: the picture is 800 wide in a 400 frame.
    const pannedPastLeft = clampView({ scale: 2, x: 100, y: 0 }, frame, content);
    expect(pannedPastLeft.x).toBe(0);
    const pannedPastRight = clampView({ scale: 2, x: -900, y: 0 }, frame, content);
    expect(pannedPastRight.x).toBe(-400);
  });

  it("centres an axis where the picture is smaller than the frame", () => {
    // 2x: the picture is 600 tall in an 800 frame, so it sits 100 from the top.
    const view = clampView({ scale: 2, x: 0, y: -999 }, frame, content);
    expect(view.y + content.y * 2).toBe(100);
  });

  it("clamps against the picture, not the letterbox around it", () => {
    // 3x: the picture is 900 tall, starting at 750 before translation.
    const top = clampView({ scale: 3, x: 0, y: 0 }, frame, content);
    expect(top.y + content.y * 3).toBe(0);
    const bottom = clampView({ scale: 3, x: 0, y: -5000 }, frame, content);
    expect(bottom.y + (content.y + content.height) * 3).toBe(frame.height);
  });
});

describe("settleView", () => {
  it("returns to fit from below it", () => {
    expect(settleView({ scale: 0.6, x: 40, y: 80 }, frame, content)).toEqual(FIT);
  });

  it("returns to fit from a scale indistinguishable from it", () => {
    expect(settleView({ scale: 1.01, x: -3, y: -2 }, frame, content)).toEqual(FIT);
  });

  it("keeps a real zoom and clamps it", () => {
    const view = settleView({ scale: 2, x: 300, y: 0 }, frame, content);
    expect(view.scale).toBe(2);
    expect(view.x).toBe(0);
  });
});
