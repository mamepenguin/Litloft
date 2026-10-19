import { describe, expect, it } from "vitest";
import {
  COMPACT_MAX_WIDTH,
  pickControlsLayout,
} from "../layout";

describe("pickControlsLayout", () => {
  it("keeps the touch layout for a coarse pointer at any width", () => {
    expect(pickControlsLayout("coarse", 320)).toBe("touch");
    expect(pickControlsLayout("coarse", 1200)).toBe("touch");
    expect(pickControlsLayout("coarse", null)).toBe("touch");
  });

  it("falls to compact for a fine pointer below the threshold", () => {
    expect(pickControlsLayout("fine", 320)).toBe("compact");
    expect(pickControlsLayout("fine", COMPACT_MAX_WIDTH - 1)).toBe("compact");
  });

  it("keeps the pointer layout at and above the threshold", () => {
    expect(pickControlsLayout("fine", COMPACT_MAX_WIDTH)).toBe("pointer");
    expect(pickControlsLayout("fine", 1200)).toBe("pointer");
  });

  it("treats an unknown pointer as fine", () => {
    expect(pickControlsLayout("unknown", 320)).toBe("compact");
    expect(pickControlsLayout("unknown", 1200)).toBe("pointer");
  });

  // The guard that keeps every jsdom-rendered player — where each
  // element reports a width of 0 — on the layout its tests assert.
  it("treats an unmeasured frame as wide", () => {
    expect(pickControlsLayout("fine", null)).toBe("pointer");
    expect(pickControlsLayout("fine", 0)).toBe("pointer");
  });
});
