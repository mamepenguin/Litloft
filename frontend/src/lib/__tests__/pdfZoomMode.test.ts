import { describe, it, expect } from "vitest";

import {
  CSS_PX_PER_PT,
  DEFAULT_PDF_ZOOM_MODE,
  MAX_FITTED_WIDTH,
  PDF_ZOOM_MODES,
  parsePdfZoomMode,
  pdfPageWidth,
} from "../pdfZoomMode";

/** A4 in PDF points. */
const A4 = { width: 595, height: 842 };
/** A4 turned on its side, so the two branches cannot share an answer. */
const A4_LANDSCAPE = { width: 842, height: 595 };

describe("pdfPageWidth", () => {
  it("fits the width, capped, by default", () => {
    expect(DEFAULT_PDF_ZOOM_MODE).toBe("fit-width");
    expect(
      pdfPageWidth({
        mode: "fit-width",
        available: 2000,
        availableHeight: 900,
        pageBox: A4,
      }),
    ).toBe(MAX_FITTED_WIDTH);
  });

  it("uses the canvas when the canvas is narrower than the cap", () => {
    expect(
      pdfPageWidth({
        mode: "fit-width",
        available: 640,
        availableHeight: 900,
        pageBox: A4,
      }),
    ).toBe(640);
  });

  it("fits the whole page inside the box it was given", () => {
    // 700px of height, A4's 595/842 -> 494.6 wide, and a page that wide
    // is exactly 700 tall.
    const width = pdfPageWidth({
      mode: "fit-page",
      available: 2000,
      availableHeight: 700,
      pageBox: A4,
    });
    expect(width).toBeCloseTo(700 * (595 / 842), 5);
    expect(width * (A4.height / A4.width)).toBeCloseTo(700, 5);
  });

  it("does not let whole-page grow past the width it has", () => {
    // A very tall box would otherwise ask for a page wider than the
    // canvas, which is horizontal scrolling in the mode whose whole
    // promise is that nothing is cut off.
    const width = pdfPageWidth({
      mode: "fit-page",
      available: 400,
      availableHeight: 4000,
      pageBox: A4,
    });
    expect(width).toBe(400);
  });

  it("draws a landscape page differently from a portrait one", () => {
    const portrait = pdfPageWidth({
      mode: "fit-page",
      available: 2000,
      availableHeight: 700,
      pageBox: A4,
    });
    const landscape = pdfPageWidth({
      mode: "fit-page",
      available: 2000,
      availableHeight: 700,
      pageBox: A4_LANDSCAPE,
    });
    expect(landscape).toBeGreaterThan(portrait);
    // And the landscape one is the cap, not the height-derived 990.
    expect(landscape).toBe(MAX_FITTED_WIDTH);
  });

  it("draws actual size at 96 pixels to the inch", () => {
    expect(
      pdfPageWidth({
        mode: "actual",
        available: 2000,
        availableHeight: 900,
        pageBox: A4,
      }),
    ).toBe(595 * CSS_PX_PER_PT);
  });

  it("does not cap actual size, which would make it a different size", () => {
    // A0 is 2384pt wide. Capping it at 900 would be a mode that claims
    // to show the page at its own size while showing it at a third of
    // it; the cap exists to keep a *fitted* line comfortable to read.
    const a0 = pdfPageWidth({
      mode: "actual",
      available: 2000,
      availableHeight: 900,
      pageBox: { width: 2384, height: 3370 },
    });
    expect(a0).toBe(2384 * CSS_PX_PER_PT);
    expect(a0).toBeGreaterThan(MAX_FITTED_WIDTH);
  });

  it("fits the width until the document has reported a page", () => {
    for (const mode of PDF_ZOOM_MODES) {
      expect(
        pdfPageWidth({
          mode,
          available: 640,
          availableHeight: 900,
          pageBox: null,
        }),
      ).toBe(640);
    }
    // The loop above is vacuous unless there are modes in it.
    expect(PDF_ZOOM_MODES).toHaveLength(3);
  });

  it("fits the width for a page reporting no size", () => {
    expect(
      pdfPageWidth({
        mode: "actual",
        available: 640,
        availableHeight: 900,
        pageBox: { width: 0, height: 0 },
      }),
    ).toBe(640);
  });
});

describe("parsePdfZoomMode", () => {
  it("keeps every mode it offers", () => {
    for (const mode of PDF_ZOOM_MODES) {
      expect(parsePdfZoomMode(mode)).toBe(mode);
    }
    expect(PDF_ZOOM_MODES).toEqual(["fit-width", "fit-page", "actual"]);
  });

  it("falls back for an absent or unrecognised value", () => {
    expect(parsePdfZoomMode(null)).toBe(DEFAULT_PDF_ZOOM_MODE);
    expect(parsePdfZoomMode("")).toBe(DEFAULT_PDF_ZOOM_MODE);
    expect(parsePdfZoomMode("fit-height")).toBe(DEFAULT_PDF_ZOOM_MODE);
  });
});
