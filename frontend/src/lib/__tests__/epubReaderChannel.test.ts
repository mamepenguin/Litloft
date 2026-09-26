import { describe, it, expect } from "vitest";
import { parseReaderMessage, TOC_LABEL_MAX, TOC_MAX } from "../epubReaderChannel";

const frame = {} as Window;
const other = {} as Window;

function event(data: unknown, { origin = location.origin, source = frame as Window | null } = {}) {
  return { data, origin, source } as MessageEvent;
}

describe("parseReaderMessage", () => {
  it.each([
    [{ type: "boot" }, { type: "boot" }],
    [
      { type: "ready", dir: "rtl", vertical: true },
      { type: "ready", dir: "rtl", vertical: true, toc: [] },
    ],
    [
      { type: "location", fraction: 0.4, tocIndex: 2, pagesLeft: 5 },
      { type: "location", fraction: 0.4, tocIndex: 2, pagesLeft: 5 },
    ],
    [
      { type: "location", fraction: 0, tocIndex: null, pagesLeft: null },
      { type: "location", fraction: 0, tocIndex: null, pagesLeft: null },
    ],
    [{ type: "activity", kind: "tap" }, { type: "activity", kind: "tap" }],
    [{ type: "activity", kind: "pointer" }, { type: "activity", kind: "pointer" }],
    [{ type: "activity", kind: "key" }, { type: "activity", kind: "key" }],
    [{ type: "turned", fraction: 0.25, atEnd: false }, { type: "turned", fraction: 0.25, atEnd: false }],
    [{ type: "turned", fraction: 0, atEnd: true }, { type: "turned", fraction: 0, atEnd: true }],
    [{ type: "key", key: "f" }, { type: "key", key: "f" }],
    [{ type: "key", key: "Escape" }, { type: "key", key: "Escape" }],
    [{ type: "link", url: "https://example.com/a" }, { type: "link", url: "https://example.com/a" }],
    [{ type: "link", url: "http://example.com/" }, { type: "link", url: "http://example.com/" }],
    [{ type: "error", code: "unsupported" }, { type: "error", code: "unsupported" }],
    [{ type: "error", code: "parse" }, { type: "error", code: "parse" }],
    [{ type: "error", code: "isolation" }, { type: "error", code: "isolation" }],
  ])("accepts %o", (data, expected) => {
    expect(parseReaderMessage(event(data), frame)).toEqual(expected);
  });

  it("copies only the contract's fields", () => {
    expect(
      parseReaderMessage(event({ type: "ready", dir: "ltr", vertical: false, extra: 1 }), frame),
    ).toEqual({ type: "ready", dir: "ltr", vertical: false, toc: [] });
  });

  describe("the table of contents in ready", () => {
    const ready = (toc: unknown) =>
      parseReaderMessage(event({ type: "ready", dir: "ltr", vertical: false, toc }), frame);

    it("keeps entries in order, with only their fields", () => {
      expect(
        ready([
          { label: "One", depth: 0, fraction: 0, href: "c1.xhtml" },
          { label: "One.1", depth: 1, fraction: null },
        ]),
      ).toMatchObject({
        toc: [
          { label: "One", depth: 0, fraction: 0 },
          { label: "One.1", depth: 1, fraction: null },
        ],
      });
      expect(ready([{ label: "a", depth: 0, fraction: 0, href: "x" }])!).toEqual({
        type: "ready",
        dir: "ltr",
        vertical: false,
        toc: [{ label: "a", depth: 0, fraction: 0 }],
      });
    });

    it.each([
      ["a label that is not a string", { label: null, depth: 0, fraction: 0 }],
      ["a label that is markup-free but too long", { label: "x".repeat(TOC_LABEL_MAX + 1), depth: 0, fraction: 0 }],
      ["a fractional depth", { label: "a", depth: 0.5, fraction: 0 }],
      ["a negative depth", { label: "a", depth: -1, fraction: 0 }],
      ["a fraction past the end", { label: "a", depth: 0, fraction: 1.5 }],
      ["a fraction that is not a number", { label: "a", depth: 0, fraction: "0" }],
      ["a NaN fraction", { label: "a", depth: 0, fraction: Number.NaN }],
      ["not an object", "a"],
    ])("drops an entry with %s and keeps the rest", (_name, bad) => {
      expect(ready([bad, { label: "ok", depth: 0, fraction: 0.5 }])).toMatchObject({
        type: "ready",
        toc: [{ label: "ok", depth: 0, fraction: 0.5 }],
      });
    });

    it.each([undefined, null, "toc", 3, { length: 1 }])(
      "reads %o as no table of contents rather than dropping ready",
      (toc) => {
        expect(ready(toc)).toMatchObject({ type: "ready", toc: [] });
      },
    );

    it("keeps at most TOC_MAX entries", () => {
      const toc = Array.from({ length: TOC_MAX + 5 }, (_, i) => ({ label: `${i}`, depth: 0, fraction: null }));
      const parsed = ready(toc) as { toc: unknown[] };
      expect(parsed.toc).toHaveLength(TOC_MAX);
    });
  });

  it.each([
    ["another origin", event({ type: "boot" }, { origin: "https://evil.example" })],
    ["another window", event({ type: "boot" }, { source: other })],
    ["no source", event({ type: "boot" }, { source: null })],
  ])("drops a message from %s", (_name, e) => {
    expect(parseReaderMessage(e, frame)).toBeNull();
  });

  it("drops everything when there is no reader frame", () => {
    expect(parseReaderMessage(event({ type: "boot" }, { source: null }), null)).toBeNull();
  });

  it.each([
    null,
    "boot",
    { type: "unknown" },
    { type: "ready", dir: "up", vertical: false },
    { type: "ready", dir: "ltr", vertical: "yes" },
    { type: "turned", fraction: -0.1, atEnd: false },
    { type: "turned", fraction: 1.1, atEnd: false },
    { type: "turned", fraction: Number.NaN, atEnd: false },
    { type: "turned", fraction: null, atEnd: false },
    { type: "turned", fraction: 0.5 },
    { type: "key", key: "k" },
    { type: "key", key: "ArrowLeft" },
    { type: "key", key: "ArrowRight" },
    { type: "key", key: "PageDown" },
    { type: "key", key: "?" },
    { type: "key", key: "/" },
    { type: "link", url: "javascript:alert(1)" },
    { type: "link", url: "data:text/html,x" },
    { type: "link", url: "blob:http://h/x" },
    { type: "link", url: "/api/files/x/stream" },
    { type: "link", url: 42 },
    { type: "error", code: "other" },
    { type: "location", fraction: 1.2, tocIndex: 0, pagesLeft: 0 },
    { type: "location", fraction: Number.NaN, tocIndex: 0, pagesLeft: 0 },
    { type: "location", fraction: 0.5, tocIndex: -1, pagesLeft: 0 },
    { type: "location", fraction: 0.5, tocIndex: 1.5, pagesLeft: 0 },
    { type: "location", fraction: 0.5, tocIndex: 0, pagesLeft: -1 },
    { type: "location", fraction: 0.5, tocIndex: 0, pagesLeft: 0.5 },
    { type: "location", fraction: 0.5, tocIndex: 0 },
    { type: "location", fraction: 0.5, pagesLeft: 0 },
    { type: "activity", kind: "click" },
    { type: "activity" },
  ])("drops %o", (data) => {
    expect(parseReaderMessage(event(data), frame)).toBeNull();
  });
});
