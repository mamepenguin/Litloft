import { describe, it, expect } from "vitest";

import { COOKIE_NAME, sanitizeNickname } from "@/lib/nickname";

describe("sanitizeNickname", () => {
  it("keeps a normal nickname", () => {
    expect(sanitizeNickname("Alice")).toBe("Alice");
  });

  it("collapses internal whitespace and trims", () => {
    expect(sanitizeNickname("  Bob   the  Builder ")).toBe("Bob the Builder");
  });

  it("returns null for empty / whitespace-only input", () => {
    expect(sanitizeNickname("")).toBeNull();
    expect(sanitizeNickname("   ")).toBeNull();
  });

  it("caps length at 50 chars", () => {
    const long = "a".repeat(80);
    expect(sanitizeNickname(long)).toHaveLength(50);
  });

  it("strips control / bidi-override / zero-width chars", () => {
    // \u0001 C0 control, \u202E RLO, \u200B ZWSP, \uFEFF BOM
    expect(sanitizeNickname("A\u0001B\u202EC\u200BD\uFEFF")).toBe("ABCD");
  });

  it("returns null when input is only deny-listed chars", () => {
    expect(sanitizeNickname("\u202E\u200B\uFEFF")).toBeNull();
  });

  it("exposes the shared cookie name constant", () => {
    expect(COOKIE_NAME).toBe("lit_viewer");
  });
});
