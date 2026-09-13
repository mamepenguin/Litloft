import { describe, expect, it } from "vitest";

import {
  SHEET_DISMISS_MAX_MS,
  SHEET_DISMISS_MIN_MS,
  SHEET_VELOCITY_WINDOW_MS,
  knobReleaseDismisses,
  releaseVelocity,
  sheetDismissDurationMs,
  translateYOf,
} from "../sheetDismiss";
import { SHEET_PULL_DISMISS_VELOCITY } from "../sheetPullGesture";

describe("how long the sheet takes to leave", () => {
  it("takes the longest when nothing threw it", () => {
    expect(sheetDismissDurationMs(400, 0)).toBe(SHEET_DISMISS_MAX_MS);
    expect(sheetDismissDurationMs(400, -2)).toBe(SHEET_DISMISS_MAX_MS);
  });

  it("leaves sooner the faster it was thrown", () => {
    const slow = sheetDismissDurationMs(400, 4);
    const fast = sheetDismissDurationMs(400, 8);
    expect(fast).toBeLessThan(slow);
    expect(slow).toBeLessThan(SHEET_DISMISS_MAX_MS);
  });

  it("starts at the speed it was thrown at", () => {
    // The easing leaves at three times its average speed.
    expect(sheetDismissDurationMs(400, 6)).toBe(200);
  });

  it("never takes longer than the ceiling, however slowly it was let go", () => {
    expect(sheetDismissDurationMs(400, 0.1)).toBe(SHEET_DISMISS_MAX_MS);
  });

  it("never goes quicker than the floor, however hard it was thrown", () => {
    expect(sheetDismissDurationMs(400, 1000)).toBe(SHEET_DISMISS_MIN_MS);
    expect(sheetDismissDurationMs(0, 3)).toBe(SHEET_DISMISS_MIN_MS);
  });
});

describe("releasing the knob below the half state", () => {
  // A 900px window whose half state shows its lower 600px.
  const VIEWPORT = 900;
  const HALF_TOP = 300;
  const release = (sheetTop: number, velocity = 0) =>
    knobReleaseDismisses({
      sheetTop,
      halfTop: HALF_TOP,
      viewportHeight: VIEWPORT,
      velocity,
    });

  it("dismisses a third of the half sheet below it, and not a pixel short", () => {
    expect(release(HALF_TOP + 200)).toBe(true);
    expect(release(HALF_TOP + 199)).toBe(false);
  });

  it("dismisses a downward flick from anywhere below it", () => {
    expect(release(HALF_TOP + 10, SHEET_PULL_DISMISS_VELOCITY)).toBe(true);
    expect(release(HALF_TOP + 10, SHEET_PULL_DISMISS_VELOCITY - 0.01)).toBe(
      false,
    );
  });

  it("leaves a flick that ended above it to the snap points", () => {
    expect(release(HALF_TOP, 5)).toBe(false);
    expect(release(HALF_TOP - 150, 5)).toBe(false);
  });
});

describe("the speed the finger left at", () => {
  it("reads only the moves inside the window before the release", () => {
    const samples = [
      { at: 0, y: 0 },
      { at: 900, y: 10 },
      { at: 1000, y: 110 },
    ];
    expect(releaseVelocity(samples, 1000)).toBe(1);
  });

  it("reads a pause before the lift as no speed at all", () => {
    const samples = [
      { at: 0, y: 0 },
      { at: 50, y: 200 },
    ];
    expect(releaseVelocity(samples, 50 + SHEET_VELOCITY_WINDOW_MS + 1)).toBe(0);
  });
});

describe("where a transform puts the surface", () => {
  it("reads what a browser computes, mid-transition included", () => {
    expect(translateYOf("matrix(1, 0, 0, 1, 0, 57.25)")).toBe(57.25);
    expect(
      translateYOf("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 138.097, 0, 1)"),
    ).toBe(138.097);
  });

  it("reads what was written, fractions included", () => {
    expect(translateYOf("translate3d(0, 40.3333px, 0)")).toBe(40.3333);
    expect(translateYOf("translate3d(0px, 12px, 0px)")).toBe(12);
  });

  it("reads nothing as no offset", () => {
    expect(translateYOf("none")).toBe(0);
    expect(translateYOf("")).toBe(0);
  });
});
