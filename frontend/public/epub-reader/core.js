const SWIPE_MIN_PX = 40;
const EDGE_RATIO = 0.25;

export const isValidOpen = (d) =>
  d.bytes instanceof ArrayBuffer &&
  (d.fraction === null || (typeof d.fraction === "number" && Number.isFinite(d.fraction))) &&
  (d.section === null || Number.isInteger(d.section)) &&
  (d.theme === "light" || d.theme === "dark");

// foliate reports a page's start as (page - 1) / textPages but places a
// fractional anchor at round(anchor * (textPages - 1)), so the anchor is
// rescaled to land on the page the fraction was taken from.
export const restoreAnchor = (inSection, pages) => {
  const textPages = pages - 2;
  if (!(textPages > 1)) return 0;
  // A fraction taken in a narrower layout can round past the last text page
  // onto the blank pad after it.
  const page = Math.min(Math.round(inSection * textPages), textPages - 1);
  return page / (textPages - 1);
};

const FORWARDED = {
  inline: new Set(["f"]),
  fullscreen: new Set(["f", "Escape"]),
};

export const keyAction = (key, { shift, fullscreen }) => {
  if (key === "PageDown" || (key === " " && !shift)) return { turn: "next" };
  if (key === "PageUp" || (key === " " && shift)) return { turn: "prev" };
  // Shift+arrow extends a text selection.
  if (key === "ArrowLeft" && !shift) return { turn: "left" };
  if (key === "ArrowRight" && !shift) return { turn: "right" };
  if (FORWARDED[fullscreen ? "fullscreen" : "inline"].has(key)) return { forward: key };
  return null;
};

// A finger moving left reveals what lies to the right, in either direction
// of reading.
export const swipeAction = (dx, dy) => {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "right" : "left";
};

export const edgeAction = (x, width) => {
  if (x < width * EDGE_RATIO) return "left";
  if (x > width * (1 - EDGE_RATIO)) return "right";
  return null;
};

export const isHttpUrl = (href) => {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const TOC_LABEL_MAX = 200;
export const TOC_MAX = 1000;

export const isValidSeek = (d) =>
  typeof d.fraction === "number" &&
  Number.isFinite(d.fraction) &&
  d.fraction >= 0 &&
  d.fraction <= 1 &&
  Number.isInteger(d.id) &&
  d.id >= 0;

// Pre-order and unfiltered, so that an entry's position is the id foliate
// gives the same item when it reports where the reader is.
export const flattenToc = (toc, resolveIndex, sectionFractions) => {
  const entries = [];
  const hrefs = [];
  const visit = (item, depth) => {
    if (entries.length >= TOC_MAX) return;
    const href = typeof item?.href === "string" ? item.href : null;
    let index = null;
    try {
      index = href === null ? null : resolveIndex(href);
    } catch {
      index = null;
    }
    const fraction = Number.isInteger(index) ? sectionFractions[index] ?? null : null;
    entries.push({
      label: String(item?.label ?? "").trim().slice(0, TOC_LABEL_MAX),
      depth,
      fraction: typeof fraction === "number" && Number.isFinite(fraction) ? fraction : null,
    });
    hrefs.push(href);
    if (Array.isArray(item?.subitems)) for (const sub of item.subitems) visit(sub, depth + 1);
  };
  if (Array.isArray(toc)) for (const item of toc) visit(item, 0);
  return { entries, hrefs };
};

export const FONT_SIZE_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.6, 2];
export const LINE_HEIGHTS = ["original", "1.6", "1.9"];
export const MARGINS = ["narrow", "normal", "wide"];
export const FONT_FAMILIES = ["original", "serif", "sans"];
export const TYPOGRAPHY_DEFAULTS = {
  fontSize: 2,
  lineHeight: "original",
  margin: "normal",
  fontFamily: "original",
};

// Field by field, so one bad field does not throw away the others; anything
// unreadable is the book's own setting.
export const readTypography = (value) => {
  const v = value && typeof value === "object" ? value : {};
  const size = v.fontSize;
  return {
    fontSize:
      Number.isInteger(size) && size >= 0 && size < FONT_SIZE_STEPS.length
        ? size
        : TYPOGRAPHY_DEFAULTS.fontSize,
    lineHeight: LINE_HEIGHTS.includes(v.lineHeight) ? v.lineHeight : TYPOGRAPHY_DEFAULTS.lineHeight,
    margin: MARGINS.includes(v.margin) ? v.margin : TYPOGRAPHY_DEFAULTS.margin,
    fontFamily: FONT_FAMILIES.includes(v.fontFamily) ? v.fontFamily : TYPOGRAPHY_DEFAULTS.fontFamily,
  };
};

const FONT_STACKS = {
  // Latin face first: an English book gets a Latin face and a Japanese book
  // falls through to the CJK one for its own characters.
  serif:
    'Georgia, "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif CJK JP", "Noto Serif JP", serif',
  sans:
    '-apple-system, "Helvetica Neue", Helvetica, Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", YuGothic, "Noto Sans CJK JP", "Noto Sans JP", sans-serif',
};

// Code keeps its face, and so does everything inside it (a highlighter's
// spans); ruby text keeps the book's.
const TEXT = ":is(body, body *):not(code, pre, kbd, samp, rt, code *, pre *, kbd *, samp *)";

const GAPS = { narrow: "3%", normal: "6%", wide: "10%" };

export const gapFor = (margin) => GAPS[margin] ?? GAPS.normal;

export const typographyCss = (t, ownRootPx) => {
  const rules = [];
  const step = FONT_SIZE_STEPS[t.fontSize];
  if (step !== 1 && typeof ownRootPx === "number" && ownRootPx > 0)
    rules.push(`html { font-size: ${Math.round(ownRootPx * step * 100) / 100}px !important; }`);
  if (t.lineHeight !== "original") rules.push(`${TEXT} { line-height: ${t.lineHeight} !important; }`);
  if (t.fontFamily !== "original")
    rules.push(`${TEXT} { font-family: ${FONT_STACKS[t.fontFamily]} !important; }`);
  return rules.join("\n");
};
