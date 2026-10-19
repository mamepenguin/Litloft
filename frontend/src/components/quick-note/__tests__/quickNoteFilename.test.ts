import { describe, expect, it } from "vitest";

import {
  deriveQuickNoteFilename,
  deriveQuickNoteStem,
} from "../quickNoteFilename";

const FIXED_NOW = new Date(2026, 7, 13, 9, 4, 5); // local time, 2026-08-13 09:04:05

describe("deriveQuickNoteStem", () => {
  it("keeps Japanese text as written", () => {
    expect(deriveQuickNoteStem("会議のメモ\n本文")).toBe("会議のメモ");
  });

  it("keeps Latin text as written", () => {
    expect(deriveQuickNoteStem("Renewal deadline")).toBe("Renewal deadline");
  });

  it("keeps emoji", () => {
    expect(deriveQuickNoteStem("🚀 launch checklist")).toBe("🚀 launch checklist");
  });

  it("skips blank leading lines", () => {
    expect(deriveQuickNoteStem("\n\n   \nactual title\nbody")).toBe("actual title");
  });

  it.each([
    ["# Heading", "Heading"],
    ["###### Deep heading", "Deep heading"],
    ["> quoted thought", "quoted thought"],
    ["- bullet item", "bullet item"],
    ["* star item", "star item"],
    ["+ plus item", "plus item"],
    ["1. ordered item", "ordered item"],
    ["2) paren ordered", "paren ordered"],
    ["- [ ] todo item", "todo item"],
    ["1. [x] done item", "done item"],
  ])("strips the leading marker of %j", (line, expected) => {
    expect(deriveQuickNoteStem(line)).toBe(expected);
  });

  it("does not strip a hash that is not a heading marker", () => {
    expect(deriveQuickNoteStem("#hashtag note")).toBe("#hashtag note");
  });

  it("strips only one marker", () => {
    expect(deriveQuickNoteStem("> # quoted heading")).toBe("# quoted heading");
  });

  it("replaces slashes and backslashes", () => {
    expect(deriveQuickNoteStem("2026/08/13 plan")).toBe("2026-08-13 plan");
    expect(deriveQuickNoteStem("C:\\notes\\draft")).toBe("C:-notes-draft");
  });

  it("replaces control characters and collapses the result", () => {
    const line = `a${String.fromCharCode(0x07)}${String.fromCharCode(0x08)}b`;
    expect(deriveQuickNoteStem(line)).toBe("a-b");
  });

  it("does not double the .md extension", () => {
    expect(deriveQuickNoteFilename("release notes.md")).toBe("release notes.md");
    expect(deriveQuickNoteFilename("release notes.MD")).toBe("release notes.md");
  });

  it("removes leading periods and trailing periods or spaces", () => {
    expect(deriveQuickNoteStem(".hidden note.")).toBe("hidden note");
    expect(deriveQuickNoteStem("trailing space   ")).toBe("trailing space");
  });

  it("collapses internal whitespace and repeated hyphens", () => {
    expect(deriveQuickNoteStem("spaced    out")).toBe("spaced out");
    expect(deriveQuickNoteStem("a///b")).toBe("a-b");
  });

  it("caps the stem at 80 code points", () => {
    const stem = deriveQuickNoteStem("あ".repeat(200));
    expect(Array.from(stem)).toHaveLength(80);
  });

  it("caps the stem at 240 UTF-8 bytes without splitting a code point", () => {
    // 80 four-byte code points would be 320 bytes, so the byte cap bites first.
    const stem = deriveQuickNoteStem("𝔘".repeat(100));
    const bytes = new TextEncoder().encode(stem).length;
    expect(bytes).toBeLessThanOrEqual(240);
    expect(Array.from(stem)).toHaveLength(60);
    expect(stem).not.toContain("\uFFFD");
  });

  it("falls back to a timestamp for an empty body", () => {
    expect(deriveQuickNoteStem("", FIXED_NOW)).toBe("note-20260813-090405");
  });

  it("falls back to a timestamp for a punctuation-only first line", () => {
    expect(deriveQuickNoteStem("...", FIXED_NOW)).toBe("note-20260813-090405");
  });

  it("formats the fallback deterministically in local time", () => {
    expect(deriveQuickNoteFilename("   ", new Date(2026, 0, 2, 3, 4, 5))).toBe(
      "note-20260102-030405.md",
    );
  });
});

describe("deriveQuickNoteFilename", () => {
  it("appends the markdown extension", () => {
    expect(deriveQuickNoteFilename("# Weekly review")).toBe("Weekly review.md");
  });
});
