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
