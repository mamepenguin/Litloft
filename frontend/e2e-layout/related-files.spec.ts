/**
 * How many related-file rows fit on a line, and what a row does with a name
 * that does not fit, measured in Chromium.
 *
 * The list renders in places whose widths have nothing to do with the
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
const LONG_NAME = NAME.repeat(6);
const FOLDER = "test_images";

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface Measurement {
  gridWidth: number;
  rows: number;
  columns: number;
  tiles: {
    shape: string;
    tile: Box;
    title: Box;
    titleLines: number;
    titleClipped: boolean;
    thumb: Box | null;
    duration: Box | null;
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
  {
    count = 11,
    shapes,
    forceColumns,
    name = NAME,
  }: { count?: number; shapes?: string[]; forceColumns?: number; name?: string } = {},
): Promise<Measurement> {
  // Sized to the frame: a viewport breakpoint is invisible to a narrow
  // grid laid out in a wide window.
  await page.setViewportSize({ width: width + 40, height: 900 });
  await page.evaluate(
    (spec) => window.buildRelated(spec),
    { width, count, shapes, forceColumns, name, folder: FOLDER },
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
      expect(tile.tile.width).toBeCloseTo(RAIL_GRID, 0);
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
      expect(tile.tile.width).toBeCloseTo(columnAt(THRESHOLD), 0);
      expect(tile.title.width).toBeGreaterThan(rail.tiles[0].title.width);
    }
  });

  test("a switch one rem lower would give each name less room than the rail", async ({ page }) => {
    const rail = await layout(page, RAIL_GRID);
    const lower = await layout(page, THRESHOLD - 16);
    expect(lower.columns).toBe(1);

    // The layout a 44rem threshold would produce, forced.
    const forced = await layout(page, THRESHOLD - 16, { forceColumns: 2 });
    expect(forced.tiles[0].tile.width).toBeCloseTo(columnAt(704), 0);
    expect(forced.tiles[0].title.width).toBeLessThan(rail.tiles[0].title.width);
  });

  test("the canonical stack keeps its two columns where it had room", async ({ page }) => {
    // 1144px is that surface at a 1456px window.
    const m = await layout(page, 1144);
    expect(m.columns).toBe(2);
    expect(m.tiles[0].titleLines).toBe(1);
  });

  test("the canonical stack drops to one column where it did not", async ({ page }) => {
    // 456px is that surface at a 768px window.
    const m = await layout(page, 456);
    expect(m.columns).toBe(1);
    expect(m.tiles[0].tile.width).toBeCloseTo(456, 0);
  });

  test("the collection route keeps two columns where the canonical stack has none", async ({ page }) => {
    // At a 900px window the canonical stack is 588px and drops to one
    // column, while this one is 853px and keeps two.
    const m = await layout(page, 853);
    expect(m.columns).toBe(2);
    expect(m.tiles[0].tile.width).toBeCloseTo(columnAt(853), 0);

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
        const full = Math.abs(tile.tile.width - m.gridWidth) < 1;
        expect(full || tile.tile.width >= RAIL_GRID).toBe(true);
      }
    });
    sweepRegistered.push(width);
  }
});

test("the sweep ran at every width the surfaces produce", () => {
  expect(sweepRegistered).toEqual(sweptWidths());
});

test.describe("the shapes the row actually comes in", () => {
  test("a name that does not fit stops at two lines inside its row", async ({ page }) => {
    const m = await layout(page, RAIL_GRID, {
      count: 4,
      shapes: ["thumbnail", "video", "icon", "missing"],
      name: LONG_NAME,
    });
    for (const tile of m.tiles) {
      expect(tile.titleLines).toBe(2);
      expect(tile.titleClipped).toBe(true);
      expect(tile.title.right).toBeLessThanOrEqual(tile.tile.right);
      expect(tile.title.bottom).toBeLessThanOrEqual(tile.tile.bottom);
    }
  });

  test("a media thumbnail is 56 by 32 and holds its duration", async ({ page }) => {
    const m = await layout(page, RAIL_GRID, {
      count: 2,
      shapes: ["thumbnail", "video"],
    });
    for (const tile of m.tiles) {
      expect(tile.thumb!.width).toBeCloseTo(56, 0);
      expect(tile.thumb!.height).toBeCloseTo(32, 0);
    }
    expect(m.tiles[0].duration).toBeNull();
    const [video] = m.tiles.slice(1);
    expect(video.duration!.right).toBeLessThanOrEqual(video.thumb!.right);
    expect(video.duration!.bottom).toBeLessThanOrEqual(video.thumb!.bottom);
    expect(video.duration!.left).toBeGreaterThanOrEqual(video.thumb!.left);
  });

  test("an icon row and a missing row give the name the same room", async ({ page }) => {
    const m = await layout(page, RAIL_GRID, {
      count: 3,
      shapes: ["thumbnail", "icon", "missing"],
    });
    const [thumbnail, icon, missing] = m.tiles;
    expect(icon.title.width).toBeCloseTo(missing.title.width, 0);
    expect(icon.title.left).toBeCloseTo(missing.title.left, 0);
    // The thumbnail takes 56px where the icon takes 16.
    expect(icon.title.width - thumbnail.title.width).toBeCloseTo(40, 0);
  });
});
