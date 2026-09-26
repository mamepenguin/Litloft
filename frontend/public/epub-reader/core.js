const SWIPE_MIN_PX = 40;
const EDGE_RATIO = 0.25;

export const isValidOpen = (d) =>
  d.bytes instanceof ArrayBuffer &&
  (d.fraction === null || (typeof d.fraction === "number" && Number.isFinite(d.fraction))) &&
  (d.theme === "light" || d.theme === "dark");

// foliate reports a page's start as (page - 1) / textPages but places a
// fractional anchor at round(anchor * (textPages - 1)), so the anchor is
// rescaled to land on the page the fraction was taken from.
export const restoreAnchor = (inSection, pages) => {
  const textPages = pages - 2;
  if (!(textPages > 1)) return 0;
  return Math.round(inSection * textPages) / (textPages - 1);
};

const FORWARDED = {
  inline: new Set(["ArrowLeft", "ArrowRight", "f"]),
  fullscreen: new Set(["f", "Escape"]),
};

export const keyAction = (key, { shift, fullscreen }) => {
  if (key === "PageDown" || (key === " " && !shift)) return { turn: "next" };
  if (key === "PageUp" || (key === " " && shift)) return { turn: "prev" };
  if (fullscreen && key === "ArrowLeft") return { turn: "left" };
  if (fullscreen && key === "ArrowRight") return { turn: "right" };
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
