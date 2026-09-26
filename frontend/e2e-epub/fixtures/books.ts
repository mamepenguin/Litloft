import { storedZip } from "./zip";

const CONTAINER =
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
  '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';

interface Item {
  id: string;
  href: string;
  type: string;
  body: string;
  properties?: string;
}

function book(
  items: Item[],
  spine: string[],
  { lang = "en", ppd, layout }: { lang?: string; ppd?: "rtl"; layout?: string } = {},
): Buffer {
  const manifest = items
    .map((i) => `<item id="${i.id}" href="${i.href}" media-type="${i.type}"${i.properties ? ` properties="${i.properties}"` : ""}/>`)
    .join("");
  const opf =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">x</dc:identifier>' +
    `<dc:title>t</dc:title><dc:language>${lang}</dc:language>` +
    '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>' +
    (layout ? `<meta property="rendition:layout">${layout}</meta>` : "") +
    `</metadata><manifest>${manifest}</manifest>` +
    `<spine${ppd ? ` page-progression-direction="${ppd}"` : ""}>` +
    spine.map((id) => `<itemref idref="${id}"/>`).join("") +
    "</spine></package>";
  return storedZip([
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", CONTAINER],
    ["OEBPS/content.opf", opf],
    ...items.map((i): [string, string] => [`OEBPS/${i.href}`, i.body]),
  ]);
}

const NAV: Item = {
  id: "nav",
  href: "nav.xhtml",
  type: "application/xhtml+xml",
  properties: "nav",
  body:
    '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>n</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">1</a></li></ol></nav></body></html>',
};

function chapters(count: number, render: (n: number) => string): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    href: `c${i + 1}.xhtml`,
    type: "application/xhtml+xml",
    body: render(i + 1),
  }));
}

const PARAGRAPHS = 60;

export function horizontalBook(): Buffer {
  const items = chapters(5, (n) => {
    const paras = Array.from(
      { length: PARAGRAPHS },
      (_, i) =>
        `<p>Chapter ${n}, paragraph ${i}. This line exists so that the chapter spans several pages at the window sizes the tests use.</p>`,
    ).join("");
    const link = n === 1 ? '<p><a id="to-three" href="c3.xhtml">Go to chapter 3</a></p>' : "";
    return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${n}</title></head><body><h1>Chapter ${n}</h1>${link}${paras}</body></html>`;
  });
  return book([NAV, ...items], items.map((i) => i.id));
}

export function verticalBook(): Buffer {
  const items = chapters(5, (n) => {
    const paras = Array.from(
      { length: PARAGRAPHS },
      (_, i) =>
        `<p>第${n}章の${i}段落目。縦に書かれた文章を読み進めるための試験用の文章を並べて、ページがいくつにも分かれるようにする。</p>`,
    ).join("");
    return (
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja"><head><title>${n}</title>` +
      "<style>html{writing-mode:vertical-rl;-epub-writing-mode:vertical-rl}</style>" +
      `</head><body><h1>第${n}章</h1>${paras}</body></html>`
    );
  });
  return book([NAV, ...items], items.map((i) => i.id), { lang: "ja", ppd: "rtl" });
}

/** Three short chapters; the middle one has mistakes common in converted books. */
export function flawedBook(): Buffer {
  const items = chapters(3, (n) => {
    const flaw = n === 2 ? "<!-- a -- b --><p>line one\u000bline two</p>" : "";
    return (
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${n}</title></head>` +
      `<body><h1>Chapter ${n}</h1>${flaw}<p>Short.</p></body></html>`
    );
  });
  return book([NAV, ...items], items.map((i) => i.id));
}

export function fixedLayoutBook(): Buffer {
  const [item] = chapters(1, () =>
    '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>f</title></head><body><p>f</p></body></html>',
  );
  return book([item], [item.id], { layout: "pre-paginated" });
}

/** Every script route below records its name on `top.__pwned`. */
const PWN = (name: string) => `top.__pwned = (top.__pwned || []).concat(['${name}'])`;

/**
 * `origin` is the server's, so a script reached through an encoded path
 * under the reader directory would pass a path-scoped `script-src` if the
 * server resolved it.
 */
export function hostileBook(origin: string): Buffer {
  const section1 =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<?xml-stylesheet type="text/xsl" href="evil.xsl"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><head><title>h</title>' +
    `<meta http-equiv="refresh" content="0;url=javascript:${PWN("meta")}"/>` +
    '<base href="https://example.com/"/>' +
    `<link rel="stylesheet" href="${origin}/leak/link.css"/>` +
    `<style>@import url("${origin}/leak/import.css"); p { background: url("${origin}/leak/bg.png"); }</style>` +
    `<script>${PWN("inline")}</script>` +
    '<script src="evil.js"></script>' +
    `<script src="${origin}/evil.js"></script>` +
    `<script src="${origin}/epub-reader/..%2fevil.js"></script>` +
    `<script src="${origin}/epub-reader/%2e%2e%2fevil.js"></script>` +
    `</head><body onload="${PWN("bodyonload")}">` +
    '<h1 id="marker">HOSTILE</h1>' +
    `<img src="x" onerror="${PWN("onerror")}"/>` +
    `<img src="${origin}/leak/img.png"/>` +
    `<svg xmlns="http://www.w3.org/2000/svg"><image href="${origin}/leak/svg-image.png"/></svg>` +
    `<a id="js" href="javascript:${PWN("href")}">js</a>` +
    `<a id="js2" href=" java&#9;script:${PWN("href-tab")}">js2</a>` +
    '<a id="ext" href="https://example.com/">external</a>' +
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="${PWN("svg-onload")}">` +
    `<script>${PWN("svg-script")}</script>` +
    `<a xlink:href="javascript:${PWN("svg-href")}"><rect width="10" height="10"/></a>` +
    `<animate attributeName="href" to="javascript:${PWN("animate")}"/>` +
    `<foreignObject><body xmlns="http://www.w3.org/1999/xhtml" onload="${PWN("fo-onload")}"><script>${PWN("fo-script")}</script></body></foreignObject>` +
    "</svg>" +
    `<iframe srcdoc="&lt;script&gt;${PWN("srcdoc")}&lt;/script&gt;"></iframe>` +
    '<object data="evil.svg" type="image/svg+xml"></object>' +
    `<details open="open" ontoggle="${PWN("toggle")}"><summary>s</summary>d</details>` +
    `<form action="javascript:${PWN("form")}"><button id="submit" type="submit">go</button></form>` +
    "</body></html>";
  // A well-formed section that makes both foliate and the sanitizer fall back
  // to the HTML parser, carrying prefixed attributes the XML parser would
  // have namespaced.
  const fallback =
    '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>p</title></head>' +
    '<body><parsererror/><p>FALLBACK</p><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
    `<a id="pfx" foo:href="javascript:${PWN("prefixed-href")}" xmlns:foo="http://www.w3.org/1999/xlink">` +
    '<rect width="200" height="200"/></a>' +
    `<g foo:onload="${PWN("prefixed-onload")}" xmlns:foo="http://www.w3.org/2000/svg"/></svg></body></html>`;
  // The same, with a character XML refuses after it: a browser renders the
  // document up to that point, where an HTML parser would read all of it.
  const fallbackCut = fallback
    .replace("FALLBACK", "FALLBACK-CUT")
    .replace("prefixed-href", "prefixed-href-cut")
    .replace("</svg></body>", "</svg><p>x\u000cy</p></body>");
  const malformed =
    `<html><head><title>m</title></head><body><p>MALFORMED<br><script>${PWN("malformed")}</script>` +
    `<img src=x onerror="${PWN("malformed-onerror")}"></body></html>`;
  const mislabelled =
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>s</title></head>' +
    `<body><p>MISLABELLED</p><script>${PWN("mislabelled")}</script></body></html>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" onload="${PWN("svg-doc-onload")}">` +
    `<script>${PWN("svg-doc")}</script><text y="20">SVG</text></svg>`;
  const items: Item[] = [
    NAV,
    { id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", body: section1, properties: "scripted svg" },
    { id: "c2", href: "c2.xhtml", type: "application/xhtml+xml", body: malformed },
    { id: "c6", href: "c6.xhtml", type: "application/xhtml+xml", body: fallback },
    { id: "c7", href: "c7.xhtml", type: "application/xhtml+xml", body: fallbackCut },
    { id: "c3", href: "c3.html", type: "text/html; charset=utf-8", body: mislabelled },
    { id: "c4", href: "c4.xhtml", type: "application/x-unknown", body: mislabelled },
    { id: "c5", href: "evil.svg", type: "image/svg+xml", body: svg },
    { id: "js", href: "evil.js", type: "application/javascript", body: PWN("manifest-js") },
  ];
  return book(items, ["c1", "c6", "c7", "c2", "c3", "c4", "c5"]);
}
