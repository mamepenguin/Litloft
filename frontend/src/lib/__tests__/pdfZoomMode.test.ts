import { describe, it, expect } from "vitest";

import {
  MAX_RASTER_PIXELS,
  rasterPixelRatio,
  CSS_PX_PER_PT,
  DEFAULT_PDF_ZOOM_MODE,
  MAX_FITTED_WIDTH,
  MIN_FITTED_WIDTH,
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

  it("treats a box with no height as not laid out yet", () => {
    // `<Page width={0}>` gives react-pdf `scale: 0` and a zero-area
    // canvas; a negative height gives a negative scale.
    for (const availableHeight of [0, -1]) {
      expect(
        pdfPageWidth({
          mode: "fit-page",
          available: 640,
          availableHeight,
          pageBox: A4,
        }),
      ).toBe(640);
    }
  });

  it("never draws a fitted page wider than the box it is fitted to", () => {
    // The promise each fitted mode's name makes. A `fit-page` page wider
    // than its box has a horizontal scrollbar, and a "whole page" you
    // scroll sideways to see is not one; `fit-width` that overflows the
    // width is the same contradiction. Below what used to be the floor
    // the page is drawn small instead — 266px of box gives 266px of
    // page, not 280 with 14 of it past the edge.
    for (const available of [266, 200, 120, 40, 1]) {
      for (const mode of ["fit-width", "fit-page"] as const) {
        expect(
          pdfPageWidth({ mode, available, availableHeight: 570, pageBox: A4 }),
        ).toBeLessThanOrEqual(available);
      }
    }
    expect(
      pdfPageWidth({
        mode: "fit-page",
        available: 266,
        availableHeight: 570,
        pageBox: A4,
      }),
    ).toBe(266);
  });

  it("fits a box too short to hold a floor's worth of page", () => {
    // The height side of the same promise. `availableHeight` of 50 used
    // to be raised to 200, which drew a 141px-wide page 200px tall in a
    // 50px box — overflowing the one direction the mode exists to keep
    // whole.
    const width = pdfPageWidth({
      mode: "fit-page",
      available: 900,
      availableHeight: 50,
      pageBox: A4,
    });
    expect(width).toBeCloseTo(50 * (595 / 842), 3);
    expect(width * (842 / 595)).toBeLessThanOrEqual(50 + 1e-6);
  });

  it("returns a positive width for a box that has measured nothing", () => {
    // The state the guard above is named for — `display: none`, detached,
    // observed before first layout — reports zero on *both* axes, and a
    // zero width reaches `<Page>` as `scale: 0` exactly like a zero
    // height. Every mode, so the floor is the function's contract rather
    // than one branch's.
    for (const mode of PDF_ZOOM_MODES) {
      for (const pageBox of [A4, null]) {
        expect(
          pdfPageWidth({ mode, available: 0, availableHeight: 0, pageBox }),
        ).toBeGreaterThan(0);
      }
    }
    expect(
      pdfPageWidth({
        mode: "fit-width",
        available: 0,
        availableHeight: 900,
        pageBox: A4,
      }),
    ).toBe(MIN_FITTED_WIDTH);
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

describe("rasterPixelRatio", () => {
  const A4_AT_ACTUAL = { cssWidth: 794, cssHeight: 1123 };

  it("renders at the display's own ratio when the raster fits", () => {
    expect(rasterPixelRatio({ ...A4_AT_ACTUAL, devicePixelRatio: 2 })).toBe(2);
    // 794 x 1123 x 2 x 2 = 3.57M — well inside the budget.
    expect(A4_AT_ACTUAL.cssWidth * A4_AT_ACTUAL.cssHeight * 4).toBeLessThan(
      MAX_RASTER_PIXELS,
    );
  });

  it("never renders finer than the display, however small the page", () => {
    expect(
      rasterPixelRatio({ cssWidth: 10, cssHeight: 10, devicePixelRatio: 1 }),
    ).toBe(1);
  });

  it("drops the ratio rather than the size when the budget bites", () => {
    // A0 at actual size, zoomed to 200%, on a DPR-2 screen: the raster
    // the browser was being asked for is ~228M pixels, which Safari
    // refuses — and the page then paints blank with nothing thrown.
    const a0x2 = { cssWidth: 3178 * 2, cssHeight: 4493 * 2 };
    const ratio = rasterPixelRatio({ ...a0x2, devicePixelRatio: 2 });
    expect(ratio).toBeLessThan(2);
    const pixels = a0x2.cssWidth * ratio * (a0x2.cssHeight * ratio);
    expect(pixels).toBeLessThanOrEqual(MAX_RASTER_PIXELS + 1);
    // And the layout is untouched — that is the whole point of budgeting
    // pixels rather than width.
    expect(a0x2.cssWidth).toBe(6356);
  });

  it("bites on iOS at 100% too, where the old code did not notice", () => {
    const a0 = { cssWidth: 3178, cssHeight: 4493 };
    const ratio = rasterPixelRatio({ ...a0, devicePixelRatio: 2 });
    expect(ratio).toBeLessThan(2);
    expect(a0.cssWidth * ratio * (a0.cssHeight * ratio)).toBeLessThanOrEqual(
      MAX_RASTER_PIXELS + 1,
    );
  });

  it("survives a page it has no size for", () => {
    expect(
      rasterPixelRatio({ cssWidth: 0, cssHeight: 0, devicePixelRatio: 3 }),
    ).toBe(3);
    expect(
      rasterPixelRatio({ cssWidth: 100, cssHeight: 100, devicePixelRatio: 0 }),
    ).toBe(1);
  });
});
