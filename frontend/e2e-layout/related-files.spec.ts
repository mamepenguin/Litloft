/**
 * How many related-file tiles fit on a row, measured in Chromium.
 *
 * The section renders in places whose widths have nothing to do with the
 * window, so the column count has to be the container's question.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "related-files.html"),
).href;

/**
 * The rail's grid: a 24rem inspector column, less the pane's `px-4`,
 * before the pane's scrollbar — the threshold has to satisfy the widest
 * rail it can face.
 */
const RAIL_GRID = 352;

/** `gap-2` between the columns. */
const GAP = 8;

/**
 * `45rem`: twice `RAIL_GRID` plus `GAP` is 712, rounded **up** to a whole
 * rem. Rounding down makes each column narrower than the rail's.
 */
const THRESHOLD = 720;

const columnAt = (container: number) => (container - GAP) / 2;

/**
 * Declared, not counted from `sweptWidths()`: the sweep deduplicates, so a
 * surface can lose an entry another table also produces without the case
 * list changing length.
 */
const SWEPT_WIDTHS = 13;

/**
 * The canonical stack sits in the 2-pane right pane, so its width is the
 * window less the 280px tree and the padding. The collection route is
 * 2-pane exempt and capped by `max-w-6xl` less `px-4`.
 */
const SURFACES = {
  /** The inspector rail, at every window width it exists at. */
  rail: [RAIL_GRID],
  /** Canonical stack, 2-pane: window - 280 tree - 32 padding. */
  canonicalStack: [456, 588, 807, 1144],
  /** Collection route: capped at 1120, and 721 at a 768px window. */
  collectionStack: [721, 853, 1072, 1120],
};

const sweptWidths = (): number[] =>
  [
    ...new Set([
      320,
      ...SURFACES.rail,
      ...SURFACES.canonicalStack,
      ...SURFACES.collectionStack,
      THRESHOLD - 8,
      THRESHOLD,
      1200,
    ]),
  ].sort((a, b) => a - b);

const NAME = "15792094940_54b0fd8f84_o.jpg";
const FOLDER = "test_images";

interface Measurement {
  gridWidth: number;
  rows: number;
  columns: number;
  tiles: {
    shape: string;
    width: number;
    nameWidth: number;
    nameChars: number;
    nameLength: number;
  }[];
}

declare global {
  interface Window {
    buildRelated: (spec: {
      width: number;
      count: number;
      shapes?: string[];
      forceColumns?: number;
      name: string;
      folder: string;
    }) => void;
    measureRelated: () => Measurement;
  }
}

async function layout(
  page: import("@playwright/test").Page,
  width: number,
  count = 11,
  shapes?: string[],
  forceColumns?: number,
): Promise<Measurement> {
  // Sized to the frame: a viewport breakpoint is invisible to a narrow
  // grid laid out in a wide window.
  await page.setViewportSize({ width: width + 40, height: 900 });
  await page.evaluate(
    (spec) => window.buildRelated(spec),
    { width, count, shapes, forceColumns, name: NAME, folder: FOLDER },
  );
  return page.evaluate(() => window.measureRelated());
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test.describe("the column count is the container's question", () => {
  test("the inspector rail gets one column, at any window width", async ({ page }) => {
    const m = await layout(page, RAIL_GRID);
    expect(m.columns).toBe(1);
    expect(m.rows).toBe(11);
    for (const tile of m.tiles) {
      expect(tile.width).toBeCloseTo(RAIL_GRID, 0);
      // The name overflows, so its column is the tile's leftovers and not
      // the string's own width.
      expect(tile.nameChars).toBeLessThan(tile.nameLength);
      expect(tile.nameWidth).toBeCloseTo(m.tiles[0].nameWidth, 0);
    }
  });

  test("one column just under the threshold, and a wider column at it", async ({ page }) => {
    const under = await layout(page, THRESHOLD - 8);
    expect(under.columns).toBe(1);

    const rail = await layout(page, RAIL_GRID);
    const at = await layout(page, THRESHOLD);
    expect(at.columns).toBe(2);

    expect(columnAt(THRESHOLD)).toBe(356);
    for (const tile of at.tiles) {
      expect(tile.width).toBeCloseTo(columnAt(THRESHOLD), 0);
      expect(tile.width).toBeGreaterThan(rail.tiles[0].width);
    }

    // Measured against this run's rail. Not `toBe`: the column at the
    // threshold is deliberately wider than the rail's.
    for (const tile of at.tiles) {
      expect(tile.nameWidth).toBeGreaterThan(rail.tiles[0].nameWidth);
      expect(tile.nameChars).toBeGreaterThanOrEqual(rail.tiles[0].nameChars);
    }
  });

  test("a switch one rem lower would cost the reader a character", async ({ page }) => {
    const rail = await layout(page, RAIL_GRID);
    const lower = await layout(page, THRESHOLD - 16);
    expect(lower.columns).toBe(1);

    // The layout a 44rem threshold would produce, forced.
    const forced = await layout(page, THRESHOLD - 16, 11, undefined, 2);
    expect(forced.tiles[0].width).toBeCloseTo(columnAt(704), 0);
    expect(forced.tiles[0].width).toBeLessThan(rail.tiles[0].width);
    expect(forced.tiles[0].nameChars).toBeLessThan(rail.tiles[0].nameChars);
  });

  test("the canonical stack keeps its two columns where it had room", async ({ page }) => {
    // 1144px is that surface at a 1456px window.
    const m = await layout(page, 1144);
    expect(m.columns).toBe(2);
    expect(m.tiles[0].nameChars).toBe(m.tiles[0].nameLength);
  });

  test("the canonical stack drops to one column where it did not", async ({ page }) => {
    // 456px is that surface at a 768px window.
    const m = await layout(page, 456);
    expect(m.columns).toBe(1);
    expect(m.tiles[0].width).toBeCloseTo(456, 0);
  });

  test("the collection route keeps two columns where the canonical stack has none", async ({ page }) => {
    // At a 900px window the canonical stack is 588px and drops to one
    // column, while this one is 853px and keeps two.
    const m = await layout(page, 853);
    expect(m.columns).toBe(2);
    expect(m.tiles[0].width).toBeCloseTo(columnAt(853), 0);

    const capped = await layout(page, 1120);
    expect(capped.columns).toBe(2);
  });
});

/**
 * Pushed after `test()` registers, never before: a record written first
 * survives anything between the two that drops the registration.
 */
const sweepRegistered: number[] = [];

test.describe("no width produces a tile narrower than the rail's single column", () => {
  expect(sweptWidths()).toHaveLength(SWEPT_WIDTHS);

  for (const width of sweptWidths()) {
    test(`${width}px`, async ({ page }) => {
      const m = await layout(page, width);
      expect(m.gridWidth).toBeCloseTo(width, 0);
      for (const tile of m.tiles) {
        const full = Math.abs(tile.width - m.gridWidth) < 1;
        expect(full || tile.width >= RAIL_GRID).toBe(true);
      }
    });
    sweepRegistered.push(width);
  }
});

test("the sweep ran at every width the surfaces produce", () => {
  expect(sweepRegistered).toEqual(sweptWidths());
});

test.describe("the shapes the tile actually comes in", () => {
  test("a thumbnail, a kind glyph and a missing file lay out alike", async ({ page }) => {
    const m = await layout(page, RAIL_GRID, 3, ["thumbnail", "icon", "missing"]);
    expect(m.tiles.map((t) => t.shape)).toEqual(["thumbnail", "icon", "missing"]);
    expect(new Set(m.tiles.map((t) => Math.round(t.nameWidth))).size).toBe(1);
    expect(new Set(m.tiles.map((t) => t.nameChars)).size).toBe(1);
  });
});
