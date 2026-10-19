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

// Whatever the attribute is called: a name that means nothing in one parse
// can be a link in another.
const isScriptUrl = (value) => {
  const scheme = schemeOf(value);
  return scheme === "javascript" || scheme === "vbscript" ||
    (scheme === "data" && !/^\s*data:image\/(png|jpeg|gif|webp|avif|bmp)[;,]/i.test(value));
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
      isScriptUrl(attr.value) ||
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
      // A document holds one element, so an unknown root goes with its content.
      if (node.nodeType === Node.DOCUMENT_NODE) child.remove();
      else child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    sanitizeAttributes(child);
  }
};

const HTML = "text/html";

// Each tree goes back to the browser in the language it was parsed in: a
// section that parses as XML is served as XML, and one that only parses as
// HTML is served as HTML. Writing an HTML-parsed tree out as XML would hand
// the browser a tree its XML parser reads differently.
const parse = (text, type) => {
  if (type === SVG || type === XHTML) {
    const doc = new DOMParser().parseFromString(text, type);
    if (!doc.querySelector("parsererror") && doc.documentElement?.namespaceURI)
      return { doc, type: doc.documentElement.namespaceURI === NS_SVG ? SVG : XHTML };
  }
  return { doc: new DOMParser().parseFromString(text, HTML), type: HTML };
};

const serialize = (doc, type) =>
  type === HTML
    ? `<!DOCTYPE html>${doc.documentElement.outerHTML}`
    : new XMLSerializer().serializeToString(doc);

const sanitizeDocument = (doc, type) => {
  sanitizeNode(doc);
  const root = doc.documentElement;
  if (!root) return null;
  const allowed = type === SVG
    ? root.namespaceURI === NS_SVG
    : ALLOWED_BY_NS.get(root.namespaceURI)?.has(root.localName.toLowerCase());
  if (!allowed) return null;
  sanitizeAttributes(root);
  return serialize(doc, type);
};

// The text is already decoded; a charset on the blob keeps a stale
// <meta charset> or XML encoding declaration from re-decoding it.
const served = (type) => `${type}; charset=utf-8`;

// A refused section still has to be a document: foliate stops paging at a
// section it cannot lay out.
const REFUSED = {
  text:
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title></title></head><body></body></html>',
  type: served(XHTML),
};

// The output is parsed again with the type it is served as, which is how the
// browser will parse it, and sanitized again; any change on that pass means
// the two parses disagree, and the section is refused.
export const sanitizeMarkup = (text, type) => {
  const first = parse(text, type);
  const once = sanitizeDocument(first.doc, first.type);
  if (once === null) return REFUSED;
  const again = new DOMParser().parseFromString(once, first.type);
  if (first.type !== HTML && again.querySelector("parsererror")) return REFUSED;
  const twice = sanitizeDocument(again, first.type);
  return twice === once ? { text: once, type: served(first.type) } : REFUSED;
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
