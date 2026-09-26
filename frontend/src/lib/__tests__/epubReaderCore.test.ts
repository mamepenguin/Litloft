import { describe, it, expect } from "vitest";
import {
  edgeAction,
  isHttpUrl,
  isValidOpen,
  keyAction,
  restoreAnchor,
  swipeAction,
} from "../../../public/epub-reader/core.js";

describe("isValidOpen", () => {
  const bytes = new ArrayBuffer(4);

  it.each([
    [{ bytes, fraction: null, theme: "light" }, true],
    [{ bytes, fraction: 0.5, theme: "dark" }, true],
    [{ bytes, fraction: 0, theme: "light" }, true],
    [{ bytes: new Uint8Array(4), fraction: null, theme: "light" }, false],
    [{ bytes, fraction: Number.NaN, theme: "light" }, false],
    [{ bytes, fraction: Infinity, theme: "light" }, false],
    [{ bytes, fraction: "0.5", theme: "light" }, false],
    [{ bytes, fraction: null, theme: "sepia" }, false],
    [{ bytes, theme: "light" }, false],
  ])("%o → %s", (message, expected) => {
    expect(isValidOpen(message)).toBe(expected);
  });
});

describe("restoreAnchor", () => {
  // foliate lays out `pages` = text pages + 2 blank pads, reports a page's
  // start as (page - 1) / textPages, and places an anchor at
  // round(anchor * (textPages - 1)).
  const placedPage = (anchor: number, pages: number) =>
    Math.round(anchor * (pages - 2 - 1)) + 1;
  const reportedStart = (page: number, pages: number) => (page - 1) / (pages - 2);

  it.each([3, 7, 12, 40])("every page of a %i-text-page section lands on itself", (textPages) => {
    const pages = textPages + 2;
    for (let page = 1; page <= textPages; page++) {
      const anchor = restoreAnchor(reportedStart(page, pages), pages);
      expect(placedPage(anchor, pages)).toBe(page);
    }
  });

  it("a fraction from a narrower layout never lands past the last text page", () => {
    for (let narrow = 2; narrow <= 12; narrow++) {
      for (let wide = 2; wide <= 12; wide++) {
        for (let page = 1; page <= narrow; page++) {
          const anchor = restoreAnchor(reportedStart(page, narrow + 2), wide + 2);
          expect(anchor).toBeLessThanOrEqual(1);
          expect(placedPage(anchor, wide + 2)).toBeLessThanOrEqual(wide);
        }
      }
    }
  });

  it("a one-page section lands on its only page", () => {
    expect(restoreAnchor(0, 3)).toBe(0);
  });
});

describe("keyAction", () => {
  const inline = { shift: false, fullscreen: false };
  const inlineShift = { shift: true, fullscreen: false };
  const full = { shift: false, fullscreen: true };

  it.each([
    ["PageDown", inline, { turn: "next" }],
    ["PageUp", inline, { turn: "prev" }],
    [" ", inline, { turn: "next" }],
    [" ", inlineShift, { turn: "prev" }],
    ["ArrowLeft", inline, { turn: "left" }],
    ["ArrowRight", inline, { turn: "right" }],
    ["f", inline, { forward: "f" }],
    ["Escape", inline, null],
    ["ArrowRight", inlineShift, null],
    ["ArrowLeft", { shift: true, fullscreen: true }, null],
    ["ArrowLeft", full, { turn: "left" }],
    ["ArrowRight", full, { turn: "right" }],
    ["PageDown", full, { turn: "next" }],
    ["f", full, { forward: "f" }],
    ["Escape", full, { forward: "Escape" }],
    ["k", full, null],
    ["/", inline, null],
    ["ArrowUp", full, null],
  ] as const)("%j %o → %o", (key, mode, expected) => {
    expect(keyAction(key, mode)).toEqual(expected);
  });
});

describe("swipeAction", () => {
  it.each([
    [-60, 5, "right"],
    [60, -5, "left"],
    [-39, 0, null],
    [-60, 70, null],
    [0, -200, null],
  ] as const)("dx=%i dy=%i → %s", (dx, dy, expected) => {
    expect(swipeAction(dx, dy)).toBe(expected);
  });
});

describe("edgeAction", () => {
  it.each([
    [10, 400, "left"],
    [99, 400, "left"],
    [100, 400, null],
    [200, 400, null],
    [300, 400, null],
    [301, 400, "right"],
  ] as const)("x=%i of %i → %s", (x, width, expected) => {
    expect(edgeAction(x, width)).toBe(expected);
  });
});

describe("isHttpUrl", () => {
  it.each([
    ["https://example.com/", true],
    ["http://example.com/a", true],
    ["javascript:alert(1)", false],
    ["data:text/html,x", false],
    ["blob:http://x/y", false],
    ["file:///etc/passwd", false],
    ["//example.com", false],
    ["not a url", false],
  ])("%s → %s", (href, expected) => {
    expect(isHttpUrl(href)).toBe(expected);
  });
});
