import { describe, expect, it } from "vitest";

import { faceWidths } from "../pdfFace";

const A4 = { width: 595, height: 842 };
const WIDE = { width: 1190, height: 842 };
const frame = { width: 1000, height: 800 };

describe("faceWidths", () => {
  it("fits a portrait page to the frame's height", () => {
    expect(faceWidths("single", [A4], frame)[0]).toBeCloseTo(800 * (595 / 842));
  });

  it("fits a wide page to the frame's width", () => {
    expect(faceWidths("single", [WIDE], { width: 600, height: 800 })[0]).toBe(600);
  });

  it("gives a pair one height, and the pair the frame's width or height", () => {
    const [a, b] = faceWidths("pair", [A4, A4], { width: 800, height: 800 });
    expect(a).toBeCloseTo(400);
    expect(b).toBeCloseTo(400);
    const [c, d] = faceWidths("pair", [A4, A4], frame);
    // Two A4 pages at 800 tall would be 1131 wide: the width decides.
    expect(c + d).toBeCloseTo(1000);
  });

  it("lets a split page run to twice the frame's width", () => {
    expect(faceWidths("half", [WIDE], { width: 400, height: 800 })[0]).toBe(800);
  });

  it("draws nothing before the frame has a size", () => {
    expect(faceWidths("single", [A4], { width: 0, height: 0 })).toEqual([0]);
  });
});
