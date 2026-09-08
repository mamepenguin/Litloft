/**
 * How many related-file tiles fit on a row, measured in Chromium.
 *
 * ## Why this exists at all
 *
 * The property is "a tile is wide enough to read a filename in", and that
 * is a layout property. jsdom lays nothing out, so
 * `RelatedFilesSection.test.tsx` cannot see a column count at all — and
 * the alternative the repository has already measured and rejected is
 * reading `globals.css` as a string: in #200 the defect came back in full
 * by appending one line to the end of the stylesheet while every suite
 * stayed green. A later rule, an `@media` / `@container` / `@layer`
 * block, or an inline style each override a declaration that is still,
 * textually, right there.
 *
 * The bug this file is the detector for: the grid carried
 * `sm:grid-cols-2`, a **viewport** breakpoint, while the section renders
 * in two places whose widths have nothing to do with the window — the
 * 24rem inspector rail and the legacy vertical stack. Measured
 * 2026-09-08 against the running app, a 1456px window put two columns in
 * a 351px rail: 172px tiles whose name column was 37px and showed four
 * characters of a 27-character filename, on all eleven tiles.
 *
 * ## What it can see
 *
 * Anything decided by CSS plus the widths below: the column count at a
 * given container width, the tile width that follows from it, and — with
 * the span's own resolved font, through a canvas — how many characters of
 * a real filename the name column can show.
 *
 * ## What it cannot see
 *
 * Named so nobody reads a green tick as covering them.
 *
 * **No app is running.** The tiles are written by the fixture from a
 * declared table, so nothing here observes `RelatedFilesSection` choosing
 * to render, its fetch, its empty state, or the grouped / ungrouped card
 * that `RelatedFilesSection.test.tsx` holds. `relatedFilesFixtureParity.test.tsx`
 * is what keeps that table the component's own markup.
 *
 * **The case list is finite**, so a query keyed above the widest case
 * here is unreachable — measured: `@container related-files (min-width:
 * 1500px)` adding a third column survives, since 1400 is the widest
 * width below. The widths are not arbitrary: each one is a measured
 * surface (the rail's grid, the stack at three window sizes) or a point
 * either side of the threshold.
 *
 * **Nothing here is about the tiles themselves.** Rendering them in
 * reverse order survives both this file and the jsdom suites; what a
 * tile *says* is `RelatedFilesSection.test.tsx`'s, and what it is
 * *shaped* like is the parity test's.
 *
 * **It says nothing about iOS Safari.** `container-type` establishes a
 * containment context, which on that browser renders a subtree holding a
 * `<video>`, `<audio>` or cross-origin iframe rotated and spinning
 * (`globals.css` ~line 820). Chromium never shows it. What guards that
 * here is the parity test's assertion that the tile holds no such
 * element, not this file.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "related-files.html"),
).href;

/**
 * The rail's grid, measured in the running app: a 24rem inspector column
 * leaves the section 351-352px whatever the window is doing. This is the
 * width the whole change is about.
 */
const RAIL_GRID = 352;

/**
 * The threshold, in px at the 16px root font size: `44rem`.
 *
 * Derived rather than picked — twice `RAIL_GRID` plus the `gap-2`
 * between the columns, rounded to a whole rem. Two columns are worth
 * having exactly when each of them is at least as wide as the one column
 * the rail already gives.
 */
const THRESHOLD = 704;

/**
 * A real filename out of the library the bug was measured in, and the
 * one the 44rem threshold was chosen against. 27 characters, of which
 * the first ten are what tells one of these files from the next.
 */
const NAME = "4822843331_db5bab77bb_o.jpg";
const FOLDER = "test_images";

/**
 * What the rail shows at one column, measured: 25 of the 27 characters.
 * Every other surface is held to this, because a wider container
 * producing a narrower tile than the narrowest surface is backwards.
 */
const RAIL_CHARS = 25;

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
): Promise<Measurement> {
  // The window is sized to the frame, not left at the default 1280px.
  // That is the whole point: `sm:grid-cols-2` is invisible to a suite
  // that lays a 352px grid out in a window wide enough to trigger it,
  // which is precisely how this shipped.
  await page.setViewportSize({ width: width + 40, height: 900 });
  await page.evaluate(
    (spec) => window.buildRelated(spec),
    { width, count, shapes, name: NAME, folder: FOLDER },
  );
  return page.evaluate(() => window.measureRelated());
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test.describe("the column count is the container's question", () => {
  test("the inspector rail gets one column, at any window width", async ({ page }) => {
    // The defect, stated as its own test. The rail is 352px whether the
    // window is 768 or 1456, and a viewport breakpoint gave it two
    // columns at every one of them.
    const m = await layout(page, RAIL_GRID);
    expect(m.columns).toBe(1);
    expect(m.rows).toBe(11);
    for (const tile of m.tiles) {
      expect(tile.width).toBeCloseTo(RAIL_GRID, 0);
      expect(tile.nameChars).toBe(RAIL_CHARS);
    }
  });

  test("one column just under the threshold, two at it", async ({ page }) => {
    const under = await layout(page, THRESHOLD - 8);
    expect(under.columns).toBe(1);

    const at = await layout(page, THRESHOLD);
    expect(at.columns).toBe(2);
    // And the point of putting it there: at the threshold each column
    // reads as well as the rail's single one.
    for (const tile of at.tiles) {
      expect(tile.nameChars).toBeGreaterThanOrEqual(RAIL_CHARS);
    }
  });

  test("the legacy stack keeps its two columns where it had room", async ({ page }) => {
    // Measured in the app at a 1456px window: the stacked column is
    // 1144px. This is the surface a naive one-column fix would have
    // ruined.
    const m = await layout(page, 1144);
    expect(m.columns).toBe(2);
    expect(m.tiles[0].nameChars).toBe(m.tiles[0].nameLength);
  });

  test("the legacy stack drops to one column where it did not", async ({ page }) => {
    // 456px is the stacked column at a 768px window, measured. It was
    // two columns of 224px there — five of ten characters of a Japanese
    // filename, the same defect as the rail's with a different number.
    const m = await layout(page, 456);
    expect(m.columns).toBe(1);
    expect(m.tiles[0].width).toBeCloseTo(456, 0);
  });
});

test.describe("no width produces a tile narrower than the narrowest surface", () => {
  // The invariant the threshold exists to hold, swept rather than
  // spot-checked: a tile is either the whole container or at least as
  // wide as the rail's single column. A 172px tile inside a 351px
  // container — what shipped — violates both halves at once.
  const WIDTHS = [320, RAIL_GRID, 456, 588, 640, THRESHOLD - 8, THRESHOLD, 807, 1144, 1400];

  for (const width of WIDTHS) {
    test(`${width}px`, async ({ page }) => {
      const m = await layout(page, width);
      for (const tile of m.tiles) {
        const full = Math.abs(tile.width - m.gridWidth) < 1;
        expect(full || tile.width >= THRESHOLD / 2 - 4).toBe(true);
      }
    });
  }
});

test.describe("the shapes the tile actually comes in", () => {
  test("a thumbnail, a kind glyph and a missing file lay out alike", async ({ page }) => {
    // Three class lists, one geometry: the anchor's `opacity-60` and the
    // second row's badge change no box, and the thumbnail slot is `w-24`
    // whether it holds a picture or the glyph. Asserted rather than
    // assumed, because if they differed the character counts above would
    // only be true of the shape they were measured on.
    const m = await layout(page, RAIL_GRID, 3, ["thumbnail", "icon", "missing"]);
    expect(m.tiles.map((t) => t.shape)).toEqual(["thumbnail", "icon", "missing"]);
    const widths = new Set(m.tiles.map((t) => Math.round(t.nameWidth)));
    expect(widths.size).toBe(1);
    for (const tile of m.tiles) expect(tile.nameChars).toBe(RAIL_CHARS);
  });
});
