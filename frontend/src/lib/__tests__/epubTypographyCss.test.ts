import { describe, it, expect, afterEach } from "vitest";
import { typographyCss, gapFor, TYPOGRAPHY_DEFAULTS } from "../../../public/epub-reader/core.js";

const BOOK =
  "<h1>Title</h1><p>Text <span id='s'>span</span> <em>em</em></p>" +
  "<pre><code><span id='codespan'>let x</span></code></pre><p><code id='inline'>x</code></p>" +
  "<ruby>漢<rt id='rt'>かん</rt></ruby>";

function render(css: string) {
  document.head.innerHTML = `<style>html { font-size: 10px } body { font-family: BookFace; line-height: 1.2 } code { font-family: monospace }</style><style>${css}</style>`;
  document.body.innerHTML = BOOK;
  const style = (sel: string) => getComputedStyle(document.querySelector(sel)!);
  return { style };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("typographyCss", () => {
  it("is empty for the book's own settings", () => {
    expect(typographyCss(TYPOGRAPHY_DEFAULTS, 10)).toBe("");
  });

  it("scales the book's own root size", () => {
    const { style } = render(typographyCss({ ...TYPOGRAPHY_DEFAULTS, fontSize: 4 }, 10));
    expect(style("html").fontSize).toBe("13px");
  });

  it("sets no root size when the book's own size is not known", () => {
    expect(typographyCss({ ...TYPOGRAPHY_DEFAULTS, fontSize: 4 }, null)).not.toMatch(/font-size/);
  });

  it.each(["1.6", "1.9"])("sets line height %s on the text", (lineHeight) => {
    const { style } = render(typographyCss({ ...TYPOGRAPHY_DEFAULTS, lineHeight }, 10));
    expect(style("p").lineHeight).toBe(lineHeight);
  });

  it.each([
    ["serif", /Georgia.*Mincho/],
    ["sans", /Helvetica.*Gothic/],
  ])("sets the %s family on text and leaves code and ruby text alone", (fontFamily, stack) => {
    const { style } = render(typographyCss({ ...TYPOGRAPHY_DEFAULTS, fontFamily }, 10));
    expect(style("p").fontFamily).toMatch(stack);
    expect(style("#s").fontFamily).toMatch(stack);
    expect(style("#codespan").fontFamily).not.toMatch(stack);
    expect(style("#inline").fontFamily).toBe("monospace");
    expect(style("#rt").fontFamily).not.toMatch(stack);
  });
});

describe("gapFor", () => {
  it("keeps today's gap for the normal margin", () => {
    expect(gapFor("normal")).toBe("6%");
  });

  it("orders the margins", () => {
    const pct = (m: string) => parseFloat(gapFor(m));
    expect(pct("narrow")).toBeLessThan(pct("normal"));
    expect(pct("wide")).toBeGreaterThan(pct("normal"));
  });
});
