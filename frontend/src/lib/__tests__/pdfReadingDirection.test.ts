import { describe, expect, it } from "vitest";

import { declaredReadingDirection } from "../pdfReadingDirection";

describe("declaredReadingDirection", () => {
  it("reads right to left and left to right", () => {
    expect(declaredReadingDirection({ Direction: "R2L" })).toBe("rtl");
    expect(declaredReadingDirection({ Direction: "L2R" })).toBe("ltr");
  });

  it("says nothing for a document that says nothing", () => {
    expect(declaredReadingDirection(null)).toBeNull();
    expect(declaredReadingDirection({})).toBeNull();
    expect(declaredReadingDirection({ Direction: "TTB" })).toBeNull();
    expect(declaredReadingDirection({ HideToolbar: true })).toBeNull();
  });
});
