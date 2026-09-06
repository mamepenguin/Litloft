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
 * characters on a line, which is the far side of `DESIGN.md` §3.4
 * Reading Measure. The cap is not explained in the UI — an explanation
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
