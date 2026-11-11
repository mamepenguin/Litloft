import { describe, it, expect } from "vitest";
import { buildAnchor, findQuote, normalize } from "../highlightAnchor";

describe("normalize (SPEC-CORE-052 / SPEC-CORE-053)", () => {
  it("collapses whitespace runs to one space and trims", () => {
    expect(normalize("  a \n\t b   c  ")).toBe("a b c");
  });

  it("returns an empty string for whitespace only or empty", () => {
    expect(normalize("")).toBe("");
    expect(normalize(" \n\t ")).toBe("");
  });
});

describe("buildAnchor (SPEC-CORE-052 / SPEC-CORE-053)", () => {
  it("cuts quote, prefix and suffix around the range", () => {
    expect(buildAnchor("xxFOOyy", 2, 5)).toEqual({
      quote: "FOO",
      prefix: "xx",
      suffix: "yy",
    });
  });

  it("collapses whitespace inside the quote and trims its ends", () => {
    const text = "aa  one \n two  bb";
    const start = text.indexOf("  one");
    const end = text.indexOf("  bb") ;
    expect(buildAnchor(text, start, end).quote).toBe("one two");
  });

  it("limits prefix and suffix to 32 characters each", () => {
    const text = "a".repeat(100) + "FOO" + "b".repeat(100);
    const anchor = buildAnchor(text, 100, 103);
    expect(anchor.prefix).toBe("a".repeat(32));
    expect(anchor.suffix).toBe("b".repeat(32));
  });

  it("keeps the 32 characters nearest the quote", () => {
    const before = "0123456789".repeat(5);
    const anchor = buildAnchor(before + "FOO", before.length, before.length + 3);
    expect(anchor.prefix).toBe(before.slice(-32));
  });

  it("gives an empty prefix at the start and an empty suffix at the end", () => {
    expect(buildAnchor("FOOyy", 0, 3)).toMatchObject({ prefix: "", suffix: "yy" });
    expect(buildAnchor("xxFOO", 2, 5)).toMatchObject({ prefix: "xx", suffix: "" });
  });
});

describe("findQuote (SPEC-CORE-052 / SPEC-CORE-053)", () => {
  it("finds a unique quote", () => {
    const text = "aaFOObb";
    const hit = findQuote(text, { quote: "FOO", prefix: "aa", suffix: "bb" });
    expect(hit).toEqual({ start: 2, end: 5 });
  });

  it("returns null when the quote is absent (I4)", () => {
    expect(findQuote("aaFOObb", { quote: "FOO", prefix: "", suffix: "" })).not.toBeNull();
    expect(findQuote("aaFOObb", { quote: "BAR", prefix: "", suffix: "" })).toBeNull();
  });

  it("picks the occurrence whose prefix matches (I6)", () => {
    const text = "aaFOObbccFOOdd";
    expect(findQuote(text, { quote: "FOO", prefix: "cc", suffix: "" })).toEqual({
      start: 9,
      end: 12,
    });
    expect(findQuote(text, { quote: "FOO", prefix: "aa", suffix: "" })).toEqual({
      start: 2,
      end: 5,
    });
  });

  it("picks the occurrence whose suffix matches (I6)", () => {
    const text = "aaFOObbccFOOdd";
    expect(findQuote(text, { quote: "FOO", prefix: "", suffix: "dd" })?.start).toBe(9);
    expect(findQuote(text, { quote: "FOO", prefix: "", suffix: "bb" })?.start).toBe(2);
  });

  it("prefers the longer neighbour match over a shorter one (I6)", () => {
    const text = "xFOOy" + "|" + "zxFOOy";
    expect(findQuote(text, { quote: "FOO", prefix: "zx", suffix: "y" })?.start).toBe(
      text.lastIndexOf("FOO"),
    );
  });

  it("takes the first occurrence on a tie (I6)", () => {
    const text = "aaFOObbaaFOObb";
    expect(findQuote(text, { quote: "FOO", prefix: "aa", suffix: "bb" })?.start).toBe(2);
    expect(findQuote(text, { quote: "FOO", prefix: "", suffix: "" })?.start).toBe(2);
  });

  it("matches whitespace runs in the text as one space", () => {
    const text = "see one \n   two here";
    const hit = findQuote(text, { quote: "one two", prefix: "", suffix: "" });
    expect(hit).not.toBeNull();
    expect(text.slice(hit!.start, hit!.end)).toMatch(/^one\s+two$/);
  });

  it("round-trips what buildAnchor cut", () => {
    const text = "lorem FOO ipsum FOO dolor FOO sit";
    const second = text.indexOf("FOO", text.indexOf("FOO") + 1);
    const anchor = buildAnchor(text, second, second + 3);
    expect(findQuote(text, anchor)?.start).toBe(second);
  });
});
