/**
 * The frame width W and the beside decision for the workbench row while
 * Enlarge panels is on, computed from the canvas content width C, the visible
 * height H and the root font size.
 */
import { describe, expect, it } from "vitest";

import { besideFrameWidth, isRowBeside } from "@/lib/workbenchBeside";

const w = (height: number, share: number) => (height * share * 16) / 9;

describe("SPEC-CORE-105 §3 the frame width W", () => {
  it.each([
    // The floor: w0.3 < 480 <= w0.5.
    { name: "the floor", c: 960, h: 830, expected: 480 },
    { name: "the floor at H = 540, where w0.5 is exactly 480", c: 960, h: 540, expected: 480 },
    // H = 900 makes w0.3 exactly 480: floor and share agree.
    { name: "the floor and the share meeting at H = 900", c: 1200, h: 900, expected: 480 },
    { name: "the share", c: 1174, h: 1074, expected: w(1074, 0.3) },
    { name: "the half", c: 1024, h: 512, expected: w(512, 0.5) },
    { name: "the half at a small H", c: 600, h: 300, expected: w(300, 0.5) },
    { name: "C binding the floor term", c: 400, h: 830, expected: 400 },
    { name: "C binding the share term", c: 500, h: 1074, expected: 500 },
    { name: "C binding the half term", c: 300, h: 512, expected: 300 },
    { name: "C between the share and the floor terms", c: 520, h: 1074, expected: 520 },
  ])("SPEC-CORE-105 W is max(min(C, w0.3), min(C, 480, w0.5)) for $name", ({ c, h, expected }) => {
    expect(besideFrameWidth(c, h)).toBeCloseTo(expected, 6);
  });
});

describe("SPEC-CORE-105 I9 the beside decision", () => {
  it("SPEC-CORE-105 I9 is beside at a side space of exactly 13rem and not at 13rem minus 1px (floor, W = 480)", () => {
    // Side space = C - 480 - 16; 13rem = 208.
    expect(isRowBeside(704, 830, 16)).toBe(true);
    expect(isRowBeside(703, 830, 16)).toBe(false);
    expect(isRowBeside(704, 600, 16)).toBe(true);
    expect(isRowBeside(703, 600, 16)).toBe(false);
  });

  it("SPEC-CORE-105 I9 scales the 1rem gap and the 13rem threshold with the root font size", () => {
    // At 20px: side space = C - 480 - 20 >= 260.
    expect(isRowBeside(760, 830, 20)).toBe(true);
    expect(isRowBeside(759, 830, 20)).toBe(false);
    // 704 is beside at 16px but not at 20px.
    expect(isRowBeside(704, 830, 20)).toBe(false);
  });

  it("SPEC-CORE-105 I9 uses the share term of W once it passes 480", () => {
    const width = w(1074, 0.3);
    const threshold = width + 16 + 208;
    expect(isRowBeside(Math.ceil(threshold), 1074, 16)).toBe(true);
    expect(isRowBeside(Math.floor(threshold) - 1, 1074, 16)).toBe(false);
    // Beside under the floor's W, not under the share's.
    expect(isRowBeside(780, 830, 16)).toBe(true);
    expect(isRowBeside(780, 1074, 16)).toBe(false);
  });

  it("SPEC-CORE-105 I9 uses the half term of W when it is under 480", () => {
    const width = w(512, 0.5);
    const threshold = width + 16 + 208;
    expect(isRowBeside(Math.ceil(threshold), 512, 16)).toBe(true);
    expect(isRowBeside(Math.floor(threshold) - 1, 512, 16)).toBe(false);
    // Beside under the half's W, not under the floor's.
    expect(isRowBeside(690, 512, 16)).toBe(true);
    expect(isRowBeside(690, 830, 16)).toBe(false);
  });

  it("SPEC-CORE-105 §2 is never beside before the visible height is measured", () => {
    expect(isRowBeside(704, null, 16)).toBe(false);
    expect(isRowBeside(5000, null, 16)).toBe(false);
    expect(isRowBeside(5000, 830, 16)).toBe(true);
  });

  it("SPEC-CORE-105 I9 is not beside where C is too narrow for the frame and the side space together", () => {
    expect(isRowBeside(400, 830, 16)).toBe(false);
    expect(isRowBeside(0, 830, 16)).toBe(false);
  });
});
