import { test, expect, type Page } from "@playwright/test";

const origin = () => process.env.EPUB_E2E_ORIGIN!;

const XHTML_PAGE = (body: string) =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head>' +
  `<body>${body}</body></html>`;

/**
 * Runs the sanitizer in the browser, then asks the browser's own XHTML parser
 * what the output becomes: script elements, handlers and script URLs.
 */
function whatSurvives(page: Page, text: string, type: string) {
  return page.evaluate(
    async ({ text, type }) => {
      const moduleUrl = "/epub-reader/sanitize.js";
      const { sanitizeMarkup } = await import(moduleUrl);
      const out = sanitizeMarkup(text, type);
      const doc = new DOMParser().parseFromString(out.text, out.type);
      const hits: string[] = [];
      for (const el of Array.from(doc.getElementsByTagName("*"))) {
        const name = el.localName.toLowerCase();
        if (["script", "iframe", "object", "embed", "foreignobject", "base"].includes(name)) {
          hits.push(`<${name}>`);
        }
        for (const a of Array.from(el.attributes)) {
          if (/^on/i.test(a.localName)) hits.push(`${a.name} on <${name}>`);
          if (/^\s*(javascript|vbscript|data:text)/i.test(a.value.replace(/[\s\u0000-\u001f]/g, ""))) {
            hits.push(`${a.name}=${a.value} on <${name}>`);
          }
        }
      }
      return hits;
    },
    { text, type },
  );
}

const VECTORS: [string, string, string][] = [
  [
    "an element named parsererror, then a prefixed xlink href",
    XHTML_PAGE(
      '<parsererror/><svg xmlns="http://www.w3.org/2000/svg"><a foo:href="javascript:x()" ' +
        'xmlns:foo="http://www.w3.org/1999/xlink"><rect width="9" height="9"/></a></svg>',
    ),
    "application/xhtml+xml",
  ],
  [
    "an element named parsererror, then a prefixed handler",
    XHTML_PAGE(
      '<parsererror/><svg xmlns="http://www.w3.org/2000/svg" foo:onload="x()" ' +
        'xmlns:foo="http://www.w3.org/2000/svg"/>',
    ),
    "application/xhtml+xml",
  ],
  [
    "malformed markup with a prefixed href",
    '<html><body><p>unclosed<svg><a xl:href="javascript:x()" xmlns:xl="http://www.w3.org/1999/xlink">a</a></svg></body></html>',
    "application/xhtml+xml",
  ],
  [
    "noscript and title text that reparse into markup",
    '<html><body><noscript><p title="</noscript><img src=x onerror=x()>"></p></noscript>' +
      '<title><img src=x onerror=x()></title></body></html>',
    "text/html",
  ],
  [
    "math and svg integration points",
    '<html><body><math><mtext><table><mglyph><style><img src=x onerror=x()></style></mglyph></table></mtext></math>' +
      "<svg><style><img src=x onerror=x()></style></svg></body></html>",
    "text/html",
  ],
  [
    "a prefixed xlink href followed by a character XML refuses",
    XHTML_PAGE(
      '<parsererror/><svg xmlns="http://www.w3.org/2000/svg"><a foo:href="javascript:x()" ' +
        'xmlns:foo="http://www.w3.org/1999/xlink"><rect width="9" height="9"/></a></svg>' +
        "<p>x\u000cy</p>",
    ),
    "application/xhtml+xml",
  ],
  [
    "a script hidden by a CDATA section",
    XHTML_PAGE('<svg xmlns="http://www.w3.org/2000/svg"><![CDATA[</svg><script>x()</script>]]></svg>'),
    "application/xhtml+xml",
  ],
];

test("the declared set is the set tested", () => {
  expect(VECTORS.length).toBe(7);
});

test.describe("the sanitizer alone, in the browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${origin()}/host.html?book=none`);
  });

  for (const [name, text, type] of VECTORS) {
    test(name, async ({ page }) => {
      expect(await whatSurvives(page, text, type)).toEqual([]);
    });
  }
});
