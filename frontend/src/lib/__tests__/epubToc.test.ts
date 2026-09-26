import { describe, it, expect } from "vitest";
import { chapterAt, chapterOf, currentEntryIndex, hasSelectable, isSelectable } from "../epubToc";

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

describe("currentEntryIndex", () => {
  it.each([
    ["the reported entry", { fraction: 0.3, tocIndex: 3 }, 3],
    ["the entry for the place when none is reported", { fraction: 0.75, tocIndex: null }, 5],
    ["the entry for the place when the reported one is unknown", { fraction: 0.25, tocIndex: 99 }, 2],
    ["nothing before the first entry", { fraction: 0, tocIndex: null }, 0],
  ])("is %s", (_name, place, expected) => {
    expect(currentEntryIndex(toc, place)).toBe(expected);
  });

  it("is null without a table of contents", () => {
    expect(currentEntryIndex([], { fraction: 0.5, tocIndex: null })).toBeNull();
  });
});

describe("isSelectable and hasSelectable", () => {
  it("an entry with a target can be selected, one without cannot", () => {
    expect(isSelectable(toc[0])).toBe(true);
    expect(isSelectable(toc[1])).toBe(false);
  });

  it.each([
    [[], false],
    [[{ label: "Part", depth: 0, fraction: null }], false],
    [[{ label: "Part", depth: 0, fraction: null }, { label: "One", depth: 1, fraction: 0 }], true],
  ])("%o → %s", (list, expected) => {
    expect(hasSelectable(list)).toBe(expected);
  });
});
