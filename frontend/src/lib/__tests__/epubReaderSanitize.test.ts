import { describe, it, expect } from "vitest";
import {
  isAllowedUrl,
  sanitizeMarkup,
  transformResource,
} from "../../../public/epub-reader/sanitize.js";

const XHTML = "application/xhtml+xml";

// jsdom's Blob has no text(); every browser the reader runs in does.
if (typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

function page(body: string, head = "") {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" ' +
    'xmlns:xlink="http://www.w3.org/1999/xlink">' +
    `<head><title>t</title>${head}</head><body>${body}</body></html>`
  );
}

function parse(text: string, type: string) {
  return new DOMParser().parseFromString(text, type as DOMParserSupportedType);
}

function sanitized(body: string, head = "") {
  const out = sanitizeMarkup(page(body, head), XHTML);
  expect(out.type).toBe(XHTML);
  const doc = parse(out.text, out.type);
  expect(doc.querySelector("parsererror")).toBeNull();
  return { doc, text: out.text };
}

describe("elements removed with their content", () => {
  const cases: [string, string][] = [
    ["script", "<script>x()</script>"],
    ["noscript", "<noscript><p>n</p></noscript>"],
    ["template", "<template><p>t</p></template>"],
    ["iframe", '<iframe src="https://e.com/"></iframe>'],
    ["object", '<object data="x.svg"></object>'],
    ["embed", '<embed src="x.svg"/>'],
    ["form", '<form action="https://e.com/"><button>go</button></form>'],
    ["svg script", '<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>'],
    [
      "foreignObject",
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><p>f</p></foreignObject></svg>',
    ],
    [
      "animate",
      '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:x()"/></svg>',
    ],
    ["set", '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="javascript:x()"/></svg>'],
    [
      "annotation-xml",
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><annotation-xml encoding="text/html"><p>a</p></annotation-xml></math>',
    ],
  ];

  it("the declared set is the set tested", () => {
    expect(cases.length).toBe(12);
  });

  it.each(cases)("%s", (_name, markup) => {
    const { doc } = sanitized(`<p id="keep">k</p>${markup}`);
    expect(doc.getElementById("keep")).not.toBeNull();
    const names = Array.from(doc.getElementsByTagName("*"), (el) => el.localName.toLowerCase());
    for (const gone of ["script", "noscript", "template", "iframe", "object", "embed", "form", "button",
      "foreignobject", "animate", "set", "annotation-xml"]) {
      expect(names).not.toContain(gone);
    }
    expect(doc.body?.textContent ?? "").not.toMatch(/x\(\)/);
  });

  it("base, meta http-equiv and non-stylesheet links go from the head", () => {
    const { doc } = sanitized(
      "<p>b</p>",
      '<base href="https://e.com/"/>' +
        '<meta http-equiv="refresh" content="0;url=javascript:x()"/>' +
        '<meta charset="utf-8"/>' +
        '<link rel="stylesheet" href="blob:http://h/s"/>' +
        '<link rel="prefetch" href="https://e.com/p"/>' +
        '<link rel="preload" href="https://e.com/p"/>',
    );
    expect(doc.getElementsByTagName("base").length).toBe(0);
    expect(doc.getElementsByTagName("meta").length).toBe(1);
    expect(doc.getElementsByTagName("meta")[0].getAttribute("charset")).toBe("utf-8");
    const links = doc.getElementsByTagName("link");
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("rel")).toBe("stylesheet");
  });
});

describe("attributes", () => {
  it("every on* attribute is removed, in any case and namespace", () => {
    const { doc } = sanitized(
      '<img id="i" src="blob:http://h/i" onerror="x()" ONLOAD="x()"/>' +
        '<svg xmlns="http://www.w3.org/2000/svg" id="s" onload="x()"/>' +
        '<details id="d" open="open" ontoggle="x()"><summary>s</summary></details>',
    );
    for (const id of ["i", "s", "d"]) {
      const el = doc.getElementById(id)!;
      const names = Array.from(el.attributes, (a) => a.name.toLowerCase());
      expect(names.filter((n) => n.startsWith("on"))).toEqual([]);
    }
  });

  it("srcset, target and xml:base are dropped", () => {
    const { doc } = sanitized(
      '<img id="i" src="blob:http://h/i" srcset="https://e.com/a 2x"/>' +
        '<a id="a" href="https://e.com/" target="_top">a</a>' +
        '<p id="p" xml:base="https://e.com/">p</p>',
    );
    expect(doc.getElementById("i")!.hasAttribute("srcset")).toBe(false);
    expect(doc.getElementById("a")!.hasAttribute("target")).toBe(false);
    expect(doc.getElementById("p")!.attributes.length).toBe(1);
  });

  const urls: [string, string, boolean][] = [
    ["a href", '<a id="x" href="javascript:x()">a</a>', false],
    ["a href, tab inside the scheme", '<a id="x" href=" java&#9;script:x()">a</a>', false],
    ["a href, upper case", '<a id="x" href="JAVASCRIPT:x()">a</a>', false],
    ["a href data", '<a id="x" href="data:text/html,x">a</a>', false],
    ["a href vbscript", '<a id="x" href="vbscript:x">a</a>', false],
    ["a href https", '<a id="x" href="https://e.com/">a</a>', true],
    ["a href fragment", '<a id="x" href="#n">a</a>', true],
    ["a href relative", '<a id="x" href="c2.xhtml">a</a>', true],
    ["img src blob", '<img id="x" src="blob:http://h/i"/>', true],
    ["img src data png", '<img id="x" src="data:image/png;base64,AAAA"/>', true],
    ["img src data svg", '<img id="x" src="data:image/svg+xml,&lt;svg/&gt;"/>', false],
    ["img src data html", '<img id="x" src="data:text/html,x"/>', false],
    [
      "svg xlink:href javascript",
      '<svg xmlns="http://www.w3.org/2000/svg"><a id="x" xlink:href="javascript:x()"><rect/></a></svg>',
      false,
    ],
    [
      "svg image href data png",
      '<svg xmlns="http://www.w3.org/2000/svg"><image id="x" href="data:image/png;base64,AAAA"/></svg>',
      true,
    ],
    ["video poster javascript", '<video id="x" poster="javascript:x()"></video>', false],
  ];

  it("the declared set is the set tested", () => {
    expect(urls.length).toBe(15);
  });

  it.each(urls)("%s kept=%s", (_name, markup, kept) => {
    const { doc } = sanitized(markup);
    const el = doc.getElementById("x")!;
    const urlAttrs = Array.from(el.attributes).filter((a) =>
      ["href", "src", "poster"].includes(a.localName),
    );
    expect(urlAttrs.length).toBe(kept ? 1 : 0);
  });
});

describe("isAllowedUrl", () => {
  it.each([
    ["blob:http://h/x", false, true],
    ["https://e.com", false, true],
    ["http://e.com", false, true],
    ["rel/ative.png", false, true],
    ["file:///etc/passwd", false, false],
    ["data:image/png;base64,AA", false, false],
    ["data:image/png;base64,AA", true, true],
    ["data:image/webp,AA", true, true],
    ["data:image/svg+xml,AA", true, false],
  ] as const)("%s (data images %s) → %s", (value, allowData, expected) => {
    expect(isAllowedUrl(value, allowData)).toBe(expected);
  });
});

describe("document shape", () => {
  it("processing instructions and the doctype are dropped", () => {
    const text =
      '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="x.xsl"?>' +
      '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head>' +
      "<body><p>b</p></body></html>";
    const out = sanitizeMarkup(text, XHTML);
    expect(out.text).not.toContain("xml-stylesheet");
    expect(out.text).not.toContain("DOCTYPE");
  });

  it("an element in an unknown namespace is unwrapped, keeping its text", () => {
    const { doc } = sanitized(
      '<epub:switch><epub:case><p id="c">case</p></epub:case></epub:switch>',
    );
    expect(doc.getElementById("c")!.textContent).toBe("case");
    expect(doc.getElementsByTagNameNS("http://www.idpf.org/2007/ops", "switch").length).toBe(0);
  });

  it("malformed XHTML is parsed as HTML and served as well-formed XHTML", () => {
    const out = sanitizeMarkup(
      '<html><body><p id="m">m<br><img src=x onerror="x()"><script>x()</script></body></html>',
      XHTML,
    );
    expect(out.type).toBe(XHTML);
    const doc = parse(out.text, XHTML);
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.getElementsByTagName("script").length).toBe(0);
    expect(doc.querySelector("img")!.hasAttribute("onerror")).toBe(false);
  });

  it("an SVG document stays SVG", () => {
    const out = sanitizeMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>x()</script><text>t</text></svg>',
      "image/svg+xml",
    );
    expect(out.type).toBe("image/svg+xml");
    expect(out.text).not.toContain("script");
    expect(out.text).not.toContain("onload");
  });
});

describe("transformResource", () => {
  async function run(type: string, data: unknown) {
    const detail: { data: unknown; type: unknown } = { data, type };
    transformResource(detail);
    return { data: await detail.data, type: await detail.type };
  }

  const markupTypes = [
    "application/xhtml+xml",
    "text/html",
    "text/html; charset=utf-8",
    "APPLICATION/XHTML+XML",
    "image/svg+xml",
    "application/xml",
    "text/xml",
    "application/x-dtbook+xml",
  ];

  it("the declared set is the set tested", () => {
    expect(markupTypes.length).toBe(8);
  });

  it.each(markupTypes)("%s is sanitized, from a string or a Blob", async (type) => {
    const body = page('<p>ok</p><script>x()</script>');
    for (const data of [body, new Blob([body])]) {
      const out = await run(type, data);
      expect(out.type === XHTML || out.type === "image/svg+xml").toBe(true);
      expect(String(out.data)).not.toContain("<script");
      expect(String(out.data)).toContain("ok");
    }
  });

  it.each([
    ["text/css", "text/css"],
    ["image/png", "image/png"],
    ["image/jpeg; x=1", "image/jpeg"],
    ["font/woff2", "font/woff2"],
    ["application/vnd.ms-opentype", "application/vnd.ms-opentype"],
    ["application/javascript", "text/plain"],
    ["application/octet-stream", "text/plain"],
    ["application/x-unknown", "text/plain"],
    ["", "text/plain"],
  ])("%s is served as %s, bytes untouched", async (type, served) => {
    const blob = new Blob(["bytes"]);
    const out = await run(type, blob);
    expect(out.type).toBe(served);
    expect(out.data).toBe(blob);
  });
});
