const NS_XHTML = "http://www.w3.org/1999/xhtml";
const NS_SVG = "http://www.w3.org/2000/svg";
const NS_MATHML = "http://www.w3.org/1998/Math/MathML";
const NS_XLINK = "http://www.w3.org/1999/xlink";
const NS_XML = "http://www.w3.org/XML/1998/namespace";

const XHTML = "application/xhtml+xml";
const SVG = "image/svg+xml";

// Removed together with everything inside them.
const DROP = new Set([
  "script", "noscript", "template", "iframe", "frame", "frameset", "object",
  "embed", "applet", "base", "portal", "foreignobject", "annotation-xml",
  "handler", "listener", "set", "animate", "animatemotion",
  "animatetransform", "discard", "form", "input", "button", "select",
  "textarea", "dialog",
]);

const HTML_ELEMENTS = new Set([
  "html", "head", "title", "style", "link", "meta", "body", "div", "span", "p",
  "a", "img", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "dl", "dt", "dd", "blockquote", "pre", "code", "em", "strong", "b", "i", "u",
  "s", "sub", "sup", "small", "big", "table", "thead", "tbody", "tfoot", "tr",
  "th", "td", "caption", "colgroup", "col", "figure", "figcaption", "section",
  "article", "aside", "nav", "header", "footer", "main", "abbr", "cite", "q",
  "dfn", "kbd", "samp", "var", "mark", "ruby", "rt", "rp", "rb", "rtc", "time",
  "wbr", "del", "ins", "bdi", "bdo", "address", "details", "summary",
  "picture", "source", "audio", "video", "track", "center", "font", "tt",
  "strike", "label", "legend", "fieldset", "hgroup", "data", "map", "area",
]);

const SVG_ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
  "polygon", "text", "tspan", "textpath", "defs", "use", "image", "symbol",
  "title", "desc", "lineargradient", "radialgradient", "stop", "clippath",
  "mask", "pattern", "marker", "filter", "fegaussianblur", "feoffset",
  "feblend", "fecolormatrix", "fecomposite", "feflood", "femerge",
  "femergenode", "femorphology", "a", "style", "metadata", "switch",
]);

const MATHML_ELEMENTS = new Set([
  "math", "mi", "mo", "mn", "ms", "mtext", "mrow", "msup", "msub", "msubsup",
  "mfrac", "msqrt", "mroot", "mtable", "mtr", "mtd", "mover", "munder",
  "munderover", "mspace", "mstyle", "mpadded", "mphantom", "semantics",
  "annotation", "menclose", "mfenced", "mmultiscripts", "mprescripts", "none",
]);

const ALLOWED_BY_NS = new Map([
  [NS_XHTML, HTML_ELEMENTS],
  [NS_SVG, SVG_ELEMENTS],
  [NS_MATHML, MATHML_ELEMENTS],
]);

const URL_ATTRS = new Set([
  "href", "src", "poster", "data", "action", "formaction", "background",
  "cite", "longdesc", "usemap", "codebase", "manifest", "lowsrc", "dynsrc",
  "ping", "icon", "profile", "archive", "classid",
]);
// Dropped outright: no loader rewrites them, and each can carry a URL.
const DROP_ATTRS = new Set(["srcset", "imagesrcset", "target", "formtarget"]);

const PASSTHROUGH_TYPES = [
  /^text\/css$/,
  /^image\/(png|jpeg|gif|webp|avif|bmp)$/,
  /^font\/[a-z0-9.+-]+$/,
  /^application\/(x-)?font-[a-z0-9.+-]+$/,
  /^application\/vnd\.ms-opentype$/,
  /^audio\/(mpeg|mp4|ogg|aac)$/,
  /^video\/(mp4|webm)$/,
];

const normalizeType = (type) =>
  String(type ?? "").split(";")[0].trim().toLowerCase();

const isMarkupType = (type) =>
  type === XHTML || type === "text/html" || type === SVG ||
  type.endsWith("+xml") || type.endsWith("/xml") || type.includes("html");

const schemeOf = (value) => {
  // Browsers ignore ASCII whitespace and control characters inside a scheme.
  const cleaned = value.replace(/[\u0000- \u007f-\u009f]/g, "");
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
  return match ? match[1].toLowerCase() : null;
};

const isImageSource = (el, name) =>
  (el.localName === "img" && name === "src") ||
  (el.localName === "image" && name === "href");

export const isAllowedUrl = (value, allowData) => {
  const scheme = schemeOf(value);
  if (scheme === null) return true;
  if (scheme === "blob" || scheme === "http" || scheme === "https") return true;
  return allowData && scheme === "data" &&
    /^data:image\/(png|jpeg|gif|webp|avif|bmp)[;,]/i.test(value.trim());
};

const sanitizeAttributes = (el) => {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.localName.toLowerCase();
    const ns = attr.namespaceURI;
    const drop =
      name.startsWith("on") ||
      DROP_ATTRS.has(name) ||
      (ns === NS_XML && name === "base") ||
      (ns === NS_XLINK && name !== "href") ||
      (el.localName.toLowerCase() === "meta" && name === "http-equiv") ||
      ((URL_ATTRS.has(name) || ns === NS_XLINK) &&
        !isAllowedUrl(attr.value, isImageSource(el, name)));
    if (drop) el.removeAttributeNode(attr);
  }
};

const keepElement = (el) => {
  const name = el.localName.toLowerCase();
  if (name === "meta") return !el.hasAttribute("http-equiv");
  if (name === "link") {
    const rel = (el.getAttribute("rel") ?? "").trim().toLowerCase();
    return rel === "stylesheet";
  }
  return true;
};

const sanitizeNode = (node) => {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
        child.nodeType === Node.DOCUMENT_TYPE_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const name = child.localName.toLowerCase();
    if (DROP.has(name) || !keepElement(child)) {
      child.remove();
      continue;
    }
    sanitizeNode(child);
    if (!ALLOWED_BY_NS.get(child.namespaceURI)?.has(name)) {
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    sanitizeAttributes(child);
  }
};

const parse = (text, type) => {
  if (type === SVG || type === XHTML) {
    const doc = new DOMParser().parseFromString(text, type);
    if (!doc.querySelector("parsererror") && doc.documentElement?.namespaceURI)
      return doc;
  }
  return new DOMParser().parseFromString(text, "text/html");
};

// The output is always XML, so the browser re-parses exactly the tree that was
// sanitized; an HTML serialization could re-parse into a different tree.
export const sanitizeMarkup = (text, type) => {
  const doc = parse(text, type);
  sanitizeNode(doc);
  const root = doc.documentElement;
  if (!root) return { text: "", type: XHTML };
  const isSvg = root.namespaceURI === NS_SVG;
  if (!isSvg && !ALLOWED_BY_NS.get(root.namespaceURI)?.has(root.localName.toLowerCase()))
    return { text: "", type: XHTML };
  sanitizeAttributes(root);
  return {
    text: new XMLSerializer().serializeToString(doc),
    type: isSvg ? SVG : XHTML,
  };
};

const readText = async (data) =>
  data instanceof Blob ? data.text() : String(data ?? "");

// For foliate's `book.transformTarget` "data" event. Markup of any declared
// type is sanitized; anything else that is not a known inert type is served as
// plain text so no resource can become a document.
export const transformResource = (detail) => {
  const type = normalizeType(detail.type);
  if (isMarkupType(type)) {
    const result = Promise.resolve(detail.data)
      .then(readText)
      .then((text) => sanitizeMarkup(text, type === SVG ? SVG : XHTML));
    detail.data = result.then((r) => r.text);
    detail.type = result.then((r) => r.type);
    return;
  }
  if (!PASSTHROUGH_TYPES.some((re) => re.test(type))) detail.type = "text/plain";
  else detail.type = type;
};
