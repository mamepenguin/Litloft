import { describe, it, expect } from "vitest";
import { parseReaderMessage } from "../epubReaderChannel";

const frame = {} as Window;
const other = {} as Window;

function event(data: unknown, { origin = location.origin, source = frame as Window | null } = {}) {
  return { data, origin, source } as MessageEvent;
}

describe("parseReaderMessage", () => {
  it.each([
    [{ type: "boot" }, { type: "boot" }],
    [{ type: "ready", dir: "rtl", vertical: true }, { type: "ready", dir: "rtl", vertical: true }],
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
    ).toEqual({ type: "ready", dir: "ltr", vertical: false });
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
  ])("drops %o", (data) => {
    expect(parseReaderMessage(event(data), frame)).toBeNull();
  });
});
