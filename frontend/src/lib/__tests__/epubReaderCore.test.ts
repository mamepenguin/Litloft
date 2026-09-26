import { describe, it, expect } from "vitest";
import {
  TOC_LABEL_MAX,
  TOC_MAX,
  edgeAction,
  flattenToc,
  isValidSeek,
  isValidTocIndex,
  isHttpUrl,
  isValidOpen,
  keyAction,
  restoreAnchor,
  swipeAction,
} from "../../../public/epub-reader/core.js";

describe("isValidOpen", () => {
  const bytes = new ArrayBuffer(4);

  it.each([
    [{ bytes, fraction: null, section: null, theme: "light" }, true],
    [{ bytes, fraction: 0.5, section: null, theme: "dark" }, true],
    [{ bytes, fraction: 0, section: null, theme: "light" }, true],
    [{ bytes, fraction: 0.5, section: 3, theme: "light" }, true],
    [{ bytes, fraction: null, section: 0, theme: "light" }, true],
    [{ bytes: new Uint8Array(4), fraction: null, section: null, theme: "light" }, false],
    [{ bytes, fraction: Number.NaN, section: null, theme: "light" }, false],
    [{ bytes, fraction: Infinity, section: null, theme: "light" }, false],
    [{ bytes, fraction: "0.5", section: null, theme: "light" }, false],
    [{ bytes, fraction: null, section: null, theme: "sepia" }, false],
    [{ bytes, section: null, theme: "light" }, false],
    [{ bytes, fraction: null, theme: "light" }, false],
    [{ bytes, fraction: null, section: 1.5, theme: "light" }, false],
    [{ bytes, fraction: null, section: "3", theme: "light" }, false],
    [{ bytes, fraction: null, section: null, theme: "light", typography: { fontSize: 99 } }, true],
    [{ bytes, fraction: null, section: null, theme: "light", typography: "garbage" }, true],
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
    ["ArrowLeft", inlineShift, null],
    ["ArrowRight", inlineShift, null],
    ["ArrowLeft", { shift: true, fullscreen: true }, null],
    ["ArrowRight", { shift: true, fullscreen: true }, null],
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

describe("flattenToc", () => {
  const fractions = [0, 0.2, 0.5, 0.8];
  const resolve = (href: string | null) => {
    const i = ["c1.xhtml", "c2.xhtml", "c3.xhtml", "c4.xhtml"].indexOf(href?.split("#")[0] ?? "");
    return i < 0 ? null : i;
  };

  it("walks the tree in pre-order, the order foliate numbers its items in", () => {
    const toc = [
      { label: "A", href: "c1.xhtml", subitems: [{ label: "A.1", href: "c2.xhtml#x" }] },
      { label: "B", href: "c3.xhtml", subitems: [] },
      { label: "C", href: "c4.xhtml" },
    ];
    const { entries, hrefs } = flattenToc(toc, resolve, fractions);
    expect(entries).toEqual([
      { label: "A", depth: 0, fraction: 0 },
      { label: "A.1", depth: 1, fraction: 0.2 },
      { label: "B", depth: 0, fraction: 0.5 },
      { label: "C", depth: 0, fraction: 0.8 },
    ]);
    expect(hrefs).toEqual(["c1.xhtml", "c2.xhtml#x", "c3.xhtml", "c4.xhtml"]);
  });

  it("keeps an entry with no label or no target, so the numbering stays foliate's", () => {
    const toc = [
      { label: null, href: "c1.xhtml" },
      { label: "  Heading  ", href: null, subitems: [{ label: "In", href: "missing.xhtml" }] },
      { label: "Last", href: "c2.xhtml" },
    ];
    const { entries, hrefs } = flattenToc(toc, resolve, fractions);
    expect(entries).toEqual([
      { label: "", depth: 0, fraction: 0 },
      { label: "Heading", depth: 0, fraction: null },
      { label: "In", depth: 1, fraction: null },
      { label: "Last", depth: 0, fraction: 0.2 },
    ]);
    // An entry the page cannot select keeps no target the reader could go to.
    expect(hrefs).toEqual(["c1.xhtml", null, null, "c2.xhtml"]);
  });

  it("gives null to an entry whose resolver throws", () => {
    const throwing = () => {
      throw new Error("bad");
    };
    expect(flattenToc([{ label: "a", href: "c1.xhtml" }], throwing, fractions).entries).toEqual([
      { label: "a", depth: 0, fraction: null },
    ]);
  });

  it("caps the label length and the entry count", () => {
    const toc = Array.from({ length: TOC_MAX + 3 }, () => ({ label: "x".repeat(TOC_LABEL_MAX + 9), href: "c1.xhtml" }));
    const { entries, hrefs } = flattenToc(toc, resolve, fractions);
    expect(entries).toHaveLength(TOC_MAX);
    expect(hrefs).toHaveLength(TOC_MAX);
    expect(entries[0].label).toHaveLength(TOC_LABEL_MAX);
  });

  it("reads a missing or malformed table of contents as empty", () => {
    expect(flattenToc(undefined, resolve, fractions).entries).toEqual([]);
    expect(flattenToc([null, "x"], resolve, fractions).entries).toHaveLength(2);
  });
});

describe("isValidSeek", () => {
  it.each([
    [0, true],
    [0.5, true],
    [1, true],
    [-0.01, false],
    [1.01, false],
    [Number.NaN, false],
    [Infinity, false],
    ["0.5", false],
    [null, false],
  ])("%o → %s", (fraction, expected) => {
    expect(isValidSeek({ fraction, id: 1 })).toBe(expected);
  });

  it.each([[0, true], [7, true], [-1, false], [1.5, false], ["1", false], [undefined, false]])(
    "an id of %o → %s",
    (id, expected) => {
      expect(isValidSeek({ fraction: 0.5, id })).toBe(expected);
    },
  );
});

describe("the caps", () => {
  it("are the ones the page accepts", async () => {
    const channel = await import("@/lib/epubReaderChannel");
    expect([TOC_LABEL_MAX, TOC_MAX]).toEqual([channel.TOC_LABEL_MAX, channel.TOC_MAX]);
  });
});

describe("isValidTocIndex", () => {
  const hrefs = ["c1.xhtml", null, "c3.xhtml#s"];
  it.each([
    [0, true],
    [2, true],
    [1, false],
    [3, false],
    [-1, false],
    [1.5, false],
    ["2", false],
    [null, false],
    [undefined, false],
  ])("%o → %s", (index, expected) => {
    expect(isValidTocIndex(index, hrefs)).toBe(expected);
  });
});
