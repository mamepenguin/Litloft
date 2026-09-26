import { describe, it, expect } from "vitest";
import { chapterAt, chapterOf } from "../epubToc";

const toc = [
  { label: "Cover", depth: 0, fraction: 0 },
  { label: "Part", depth: 0, fraction: null },
  { label: "One", depth: 1, fraction: 0.2 },
  { label: "One, second half", depth: 1, fraction: 0.2 },
  { label: "", depth: 0, fraction: 0.5 },
  { label: "Three", depth: 0, fraction: 0.7 },
];

describe("chapterAt", () => {
  it.each([
    [0, "Cover"],
    [0.1, "Cover"],
    [0.2, "One"],
    [0.45, "One"],
    [0.6, null],
    [0.7, "Three"],
    [1, "Three"],
  ])("%s → %s", (fraction, expected) => {
    expect(chapterAt(toc, fraction)).toBe(expected);
  });

  it("names the first entry of a file that holds several chapters, not the last", () => {
    expect(chapterAt(toc, 0.3)).toBe("One");
  });

  it("names nothing before the first entry or without a table of contents", () => {
    expect(chapterAt([{ label: "Late", depth: 0, fraction: 0.4 }], 0.1)).toBeNull();
    expect(chapterAt([], 0.5)).toBeNull();
  });
});

describe("chapterOf", () => {
  it("takes the entry the reader reports", () => {
    expect(chapterOf(toc, { fraction: 0.3, tocIndex: 3 })).toBe("One, second half");
  });

  it("falls back to the place when the entry is unknown", () => {
    expect(chapterOf(toc, { fraction: 0.75, tocIndex: null })).toBe("Three");
    expect(chapterOf(toc, { fraction: 0.75, tocIndex: 99 })).toBe("Three");
  });

  it("names nothing for an entry without a label", () => {
    expect(chapterOf(toc, { fraction: 0.75, tocIndex: 4 })).toBeNull();
  });
});
