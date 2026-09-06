/**
 * How wide the PDF page is drawn, before the reader's own zoom.
 *
 * Three named answers rather than a bare percentage. The viewer already
 * fitted the width by default and the percentage rode on top of that;
 * what it had no way to say was "show me the whole page" or "show it at
 * the size it will print at".
 */
export type PdfZoomMode = "fit-width" | "fit-page" | "actual";

export const PDF_ZOOM_MODES: readonly PdfZoomMode[] = [
  "fit-width",
  "fit-page",
  "actual",
];

export const DEFAULT_PDF_ZOOM_MODE: PdfZoomMode = "fit-width";

/** `localStorage` key. The choice is a viewing preference, like autoplay. */
export const PDF_ZOOM_MODE_KEY = "pdf-zoom-mode";

/**
 * The widest a *fitted* page is drawn, in CSS pixels.
 *
 * A 2000px canvas stretching an A4 to full width puts more than 200
 * characters on a line, which is the far side of what `DESIGN.md` §3.4
 * Reading Measure is about. It is deliberately **not** §3.4's 860px: a
 * rendered PDF page is an image of a page, not reflowable text, so the
 * line length is the author's and the only thing this number controls
 * is how far that fixed layout is scaled up. It gets its own measure
 * for that reason. The cap is not explained in the UI — an explanation
 * is owed for things the reader can choose, and this is not one of them.
 *
 * It does not apply to `actual`: that mode's whole claim is that the
 * page is the size it says it is, and a capped "actual size" is a lie
 * rather than a comfortable line length. A4 at 96dpi is 794px, so the
 * distinction only shows on paper bigger than that.
 */
export const MAX_FITTED_WIDTH = 900;

/** CSS pixels per PDF point: PDF units are 72dpi, CSS is 96. */
export const CSS_PX_PER_PT = 96 / 72;

export interface PageBox {
  /** Page width in PDF points. */
  width: number;
  /** Page height in PDF points. */
  height: number;
}

/**
 * The width to hand `<Page>`, before multiplying by the reader's zoom.
 *
 * `available` is the canvas the viewer has; `pageBox` is null until the
 * document has reported a page, and every mode then falls back to
 * fitting the width — which is what the viewer did before any of this.
 */
export function pdfPageWidth({
  mode,
  available,
  availableHeight,
  pageBox,
}: {
  mode: PdfZoomMode;
  available: number;
  availableHeight: number;
  pageBox: PageBox | null;
}): number {
  const fitWidth = Math.min(MAX_FITTED_WIDTH, available);
  if (!pageBox || pageBox.width <= 0 || pageBox.height <= 0) return fitWidth;

  if (mode === "actual") return pageBox.width * CSS_PX_PER_PT;

  if (mode === "fit-page") {
    // A box with no height is "not laid out yet", the same answer the
    // absent `pageBox` gives above — not "a page zero pixels wide".
    // `<Page width={0}>` makes react-pdf take `scale: 0` and produce a
    // zero-area canvas, and a negative one a negative scale. The
    // caller's `Math.max(200, ...)` floor used to be the only thing
    // preventing that, with nothing in either file saying so.
    if (availableHeight <= 0) return fitWidth;
    // The width at which the page's own proportions make it exactly as
    // tall as the box. Still capped and still bounded by the available
    // width: "whole page" means nothing is cut off, not that it fills
    // the widest dimension it could.
    const byHeight = availableHeight * (pageBox.width / pageBox.height);
    return Math.min(fitWidth, byHeight);
  }

  return fitWidth;
}

/** Parses a stored value; anything unrecognised is the default. */
export function parsePdfZoomMode(raw: string | null): PdfZoomMode {
  return PDF_ZOOM_MODES.includes(raw as PdfZoomMode)
    ? (raw as PdfZoomMode)
    : DEFAULT_PDF_ZOOM_MODE;
}


/**
 * The most device pixels a single page raster may ask for.
 *
 * react-pdf sizes its canvas `width * zoom * devicePixelRatio` on each
 * axis, so the backing store grows with the square of the zoom. An A0
 * page (2384 x 3370pt) at actual size and 200% on a DPR-2 screen asks
 * for 12715 x 17973 = 228M pixels, about 914 MB — past what Safari
 * will allocate, and iOS is past its limit at 100%. The allocation then
 * fails with nothing thrown and the page paints blank.
 *
 * 16.7M is the conservative figure (iOS Safari's documented area cap).
 * It is a budget for *pixels*, not for layout: when it bites, the page
 * is still drawn at the size the mode promises and only its resolution
 * drops. "Actual size" stays actual.
 */
export const MAX_RASTER_PIXELS = 16_700_000;

/**
 * The device-pixel ratio to render at, given the page's CSS size.
 *
 * Returns the display's own ratio when the raster fits the budget, and
 * a smaller one when it does not — never above the display's, because
 * rendering finer than the screen buys nothing.
 */
export function rasterPixelRatio({
  cssWidth,
  cssHeight,
  devicePixelRatio,
}: {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
}): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (cssWidth <= 0 || cssHeight <= 0) return dpr;
  const area = cssWidth * cssHeight;
  const budgeted = Math.sqrt(MAX_RASTER_PIXELS / area);
  return Math.min(dpr, budgeted);
}
