export type PdfZoomMode = "fit-width" | "fit-page" | "actual";

export const PDF_ZOOM_MODES: readonly PdfZoomMode[] = [
  "fit-width",
  "fit-page",
  "actual",
];

export const DEFAULT_PDF_ZOOM_MODE: PdfZoomMode = "fit-width";

export const PDF_ZOOM_MODE_KEY = "pdf-zoom-mode";

/**
 * A rendered PDF page is an image of a page, not reflowable text, so the
 * only thing this number controls is how far that fixed layout is scaled up.
 *
 * It does not apply to `actual`: a capped "actual size" is a lie rather
 * than a comfortable line length.
 */
export const MAX_FITTED_WIDTH = 900;

/**
 * Not a minimum: a real measurement always wins, however small, and
 * `Math.max(UNMEASURED_FITTED_WIDTH, measured)` at a new call site would
 * be undoing this rather than using it.
 */
export const UNMEASURED_FITTED_WIDTH = 280;

/** CSS pixels per PDF point: PDF units are 72dpi, CSS is 96. */
export const CSS_PX_PER_PT = 96 / 72;

export interface PageBox {
  /** Page width in PDF points. */
  width: number;
  /** Page height in PDF points. */
  height: number;
}

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
  const fitWidth =
    available > 0 ? Math.min(MAX_FITTED_WIDTH, available) : UNMEASURED_FITTED_WIDTH;
  if (!pageBox || pageBox.width <= 0 || pageBox.height <= 0) return fitWidth;

  if (mode === "actual") return pageBox.width * CSS_PX_PER_PT;

  if (mode === "fit-page") {
    // A box with no height is "not laid out yet", not "a page zero pixels
    // wide": `<Page width={0}>` makes react-pdf produce a zero-area canvas.
    if (availableHeight <= 0) return fitWidth;
    const byHeight = availableHeight * (pageBox.width / pageBox.height);
    return Math.min(fitWidth, byHeight);
  }

  return fitWidth;
}

export function parsePdfZoomMode(raw: string | null): PdfZoomMode {
  return PDF_ZOOM_MODES.includes(raw as PdfZoomMode)
    ? (raw as PdfZoomMode)
    : DEFAULT_PDF_ZOOM_MODE;
}

/**
 * iOS Safari's documented canvas area cap. Past it the allocation fails
 * with nothing thrown and the page paints blank.
 */
export const MAX_RASTER_PIXELS = 16_700_000;

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
