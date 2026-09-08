/**
 * The justified thumbnail grid's layout invariants, measured in Chromium.
 *
 * ## Why this exists at all
 *
 * The property these rules exist for — *a cell is drawn at the shape of
 * the picture inside it* — is a layout property, and nothing else in this
 * repository can see one. jsdom lays nothing out, so every
 * `getBoundingClientRect()` in `justifiedGrid.test.tsx` is zeros and a
 * cell at the wrong ratio measures exactly like one at the right ratio.
 * That file says so itself, and says what it settled for instead: it
 * checks that the declarations are *present*. Presence is not the
 * invariant. In #200 the defect came back in full by appending one line
 * to the end of `globals.css`, and every suite stayed green.
 *
 * So this file does the only thing that answers that: it opens a static
 * page carrying the app's own compiled `globals.css`, hand-places cells
 * with known `--jg-ratio` values, and measures the boxes the browser
 * produces.
 *
 * ## What it can see, and what it cannot
 *
 * It can see anything decided by CSS plus the cells' own inline ratios:
 * the shape of a cell, the `max-height` ceiling, which lines justify, the
 * row height the container query picks, and the transition the FLIP play
 * state resolves to.
 *
 * It cannot see anything the app *does*, because there is no app here.
 * Out of scope, and named so nobody reads a green tick as covering them:
 *
 * - `void grid.offsetWidth` in `useJustifiedFlip` — the forced reflow
 *   between the invert and the play. Deleting it stops every animation
 *   and no suite in this repository notices (#203).
 * - the hook's `settle()` timing, its rect rounding, and its unmount
 *   cleanup.
 * - the FLIP wiring itself — that a change to the cell set reaches the
 *   hook at all. `useJustifiedFlip.test.tsx` holds that by postcondition.
 *
 * Those need the React tree and a real listing. This file is a fixture.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FLIP_DURATION_MS } from "../src/hooks/useJustifiedFlip";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "justified-grid.html"),
).href;

/**
 * The figures `globals.css` and `DESIGN.md` §8.5 carry, written out here
 * rather than read back out of the sheet.
 *
 * Reading them back would make the assertions move whenever the sheet
 * moved, which is the one thing a pinned value is for: each of these was
 * chosen by measuring alternatives, so changing one is a decision and
 * should arrive with this file edited.
 */
const JG_GAP = 8;
const JG_ROW_H_NARROW = 120;
const JG_ROW_H_WIDE = 200;
/** `@container justified-grid (min-width: 40rem)`, at a 16px root. */
const JG_CONTAINER_BREAKPOINT = 640;
const JG_MAX_STRETCH = 2.5;

const ceilingAt = (rowH: number) => rowH * JG_MAX_STRETCH;

type Cell = {
  ratio: number;
  width: number;
  height: number;
  top: number;
  left: number;
};

declare global {
  interface Window {
    buildGrid: (spec: {
      ratios: number[];
      width: number;
      flip?: "invert" | "play";
    }) => void;
    measureCells: () => Cell[];
    measureGrid: () => { width: number; gap: number };
    measureFlip: () => {
      transitionProperty: string;
      transitionDuration: string;
      transitionTimingFunction: string;
      transformOrigin: string;
    };
  }
}

/** `flex-grow` on `.justified-grid-tail`, the last line's slack absorber. */
const JG_TAIL_GROW = 9999;

/**
 * How far a measured box may sit from the figure the geometry predicts.
 *
 * Not slack for "close enough": every figure the assertions compare
 * against is exact, and the tolerance only has to cover the layout
 * engine's own quantisation. Chromium resolves lengths to a 64th of a
 * pixel, which bounds a single value's error at 7.8e-3 px; the worst
 * observed across every case in this file is 4.3e-3 px absolute and 9.3e-5
 * relative, and the whole suite still passes at a tolerance of 5e-3.
 * 5e-2 is what is written, six times the bound, because a line-fill
 * assertion sums five of those errors and none of the defects this file
 * exists to catch move anything by less than a pixel.
 */
const PX = 0.05;
const REL = 1e-3;

/**
 * Where each cell on an unstretched line lands.
 *
 * The last line does not justify: `.justified-grid-tail` sits after the
 * final cell and takes the slack, so the cells stay at their bases. Not
 * exactly at them, though — the absorber's grow factor is three orders
 * above a line's total rather than infinite, so each cell keeps its own
 * share of what is left, and *that* is the figure worth asserting. It is
 * the one place the 9999 is visible as a length: at `flex-grow: 1` the
 * shares below grow by four orders and a lone cell takes half the grid.
 *
 * A line ending in the absorber has one gap per cell, not one fewer.
 */
const unstretchedWidths = (
  ratios: number[],
  rowH: number,
  gridWidth: number,
) => {
  const bases = ratios.map((ratio) => ratio * rowH);
  const free =
    gridWidth -
    bases.reduce((sum, basis) => sum + basis, 0) -
    JG_GAP * ratios.length;
  const growSum =
    ratios.reduce((sum, ratio) => sum + ratio, 0) + JG_TAIL_GROW;
  return bases.map((basis, i) => basis + (ratios[i] * free) / growSum);
};

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

/**
 * The row height, read as a length rather than as text.
 *
 * A single cell of ratio 1 with the slack absorber after it is laid out
 * at its own basis — `--jg-ratio * --jg-row-h`, so `--jg-row-h` — because
 * the absorber's grow factor takes essentially all of the line's free
 * space. That makes the measurement a test of two things at once: which
 * side of the container query the grid is on, and that the absorber still
 * dominates. At `flex-grow: 1` the absorber loses that argument and this
 * lone cell stretches to more than half the grid.
 */
test.describe("the row height the container query picks", () => {
  const cases = [
    { width: 420, rowH: JG_ROW_H_NARROW },
    { width: JG_CONTAINER_BREAKPOINT - 1, rowH: JG_ROW_H_NARROW },
    { width: JG_CONTAINER_BREAKPOINT, rowH: JG_ROW_H_WIDE },
    { width: 1469, rowH: JG_ROW_H_WIDE },
  ];

  for (const { width, rowH } of cases) {
    test(`is ${rowH}px on a ${width}px grid`, async ({ page }) => {
      await page.evaluate(
        (w) => window.buildGrid({ ratios: [1], width: w }),
        width,
      );
      const cells = await page.evaluate(() => window.measureCells());

      expect(cells).toHaveLength(1);
      expect(cells[0].width).toBeCloseTo(
        unstretchedWidths([1], rowH, width)[0],
        1,
      );
      expect(cells[0].height).toBeCloseTo(cells[0].width, 1);
    });
  }
});

/**
 * The invariant #200 was about: `cellAR == --jg-ratio`.
 *
 * The expected number of cells that reach the ceiling is declared per
 * case rather than counted from the run. A count read back from the
 * measurement would let a change that clamps every cell pass.
 */
test.describe("a cell is the shape of its own ratio", () => {
  const RATIOS = [
    3, 0.5, 1, 1.5, 0.75, 2, 4 / 3, 0.6, 2.5, 1, 0.8, 1.2, 1.77, 0.66, 1, 2.2,
    0.9, 1.4,
  ];

  const cases = [
    { width: 420, rowH: JG_ROW_H_NARROW, clamped: 0 },
    // The first width on the wide side of the query, and the one width in
    // this set where greedy line-breaking strands a narrow cell high
    // enough to meet the ceiling.
    { width: 640, rowH: JG_ROW_H_WIDE, clamped: 1 },
    { width: 900, rowH: JG_ROW_H_WIDE, clamped: 0 },
    { width: 1200, rowH: JG_ROW_H_WIDE, clamped: 0 },
    { width: 1469, rowH: JG_ROW_H_WIDE, clamped: 0 },
  ];

  for (const { width, rowH, clamped } of cases) {
    test(`at every ratio on a ${width}px grid`, async ({ page }) => {
      await page.evaluate(
        ({ ratios, w }) => window.buildGrid({ ratios, width: w }),
        { ratios: RATIOS, w: width },
      );
      const cells = await page.evaluate(() => window.measureCells());

      expect(cells).toHaveLength(RATIOS.length);
      expect(cells.map((c) => c.ratio)).toEqual(RATIOS);

      const ceiling = ceilingAt(rowH);
      const atCeiling = cells.filter((c) => c.height > ceiling - PX);
      expect(atCeiling).toHaveLength(clamped);

      for (const cell of atCeiling) {
        // A cell that reaches the ceiling gives up its ratio and keeps
        // its width, so its height is the ceiling exactly.
        expect(cell.height).toBeCloseTo(ceiling, 1);
      }

      for (const cell of cells.filter((c) => c.height <= ceiling - PX)) {
        expect(
          Math.abs(cell.width / cell.height - cell.ratio) / cell.ratio,
        ).toBeLessThan(REL);
      }
    });
  }
});

/**
 * The ceiling, driven on purpose.
 *
 * Greedy line-breaking can leave one narrow cell holding a whole line,
 * and the width it takes then becomes height. `[3, 0.5, 3, 3]` at 700px
 * does it: a ratio-3 cell has a 600px basis and 600 + 8 + 100 overflows
 * the grid, so the ratio-0.5 cell that follows it is alone on the second
 * line — and that line is not the last, so the slack absorber is not
 * there to hold it at its basis.
 */
test("clamps a stranded cell at the ceiling and leaves its width alone", async ({
  page,
}) => {
  const WIDTH = 700;
  const RATIOS = [3, 0.5, 3, 3];
  const STRANDED = 0.5;

  await page.evaluate(
    ({ ratios, w }) => window.buildGrid({ ratios, width: w }),
    { ratios: RATIOS, w: WIDTH },
  );
  const cells = await page.evaluate(() => window.measureCells());
  expect(cells).toHaveLength(RATIOS.length);

  const stranded = cells[1];
  expect(stranded.ratio).toBe(STRANDED);
  // Alone on its line: nothing shares its top.
  expect(cells.filter((c) => Math.abs(c.top - stranded.top) < PX)).toHaveLength(
    1,
  );

  // The width the cell would have had anyway. A lone flex item whose grow
  // factor is under 1 receives only that fraction of the line's free
  // space (CSS Flexbox §9.7.4), so it is the basis plus `ratio` of what
  // is left — 100 + 0.5 * 600 here. The clamp does not move it: the cell
  // keeps its width and gives up its ratio.
  const basis = STRANDED * JG_ROW_H_WIDE;
  expect(stranded.width).toBeCloseTo(basis + STRANDED * (WIDTH - basis), 1);

  expect(stranded.height).toBeCloseTo(ceilingAt(JG_ROW_H_WIDE), 1);
  // And the ratio really is gone, rather than the ceiling happening to
  // agree with it.
  expect(stranded.width / stranded.height).toBeGreaterThan(STRANDED + 0.2);
});

/**
 * What "justified" means: every line but the last ends flush with the
 * grid, and the last one does not stretch.
 *
 * The filled-line count is declared, not counted. Greedy line-breaking on
 * `flex-basis: ratio * row-h` decides it, and the arithmetic is written
 * out per case so that a change to the basis has somewhere to fail.
 */
test.describe("lines fill the grid", () => {
  const cases = [
    {
      name: "equal ratios",
      width: 1216,
      // basis 200 each: 5 fit (5*200 + 4*8 = 1032; a sixth needs 1240).
      ratios: Array.from({ length: 12 }, () => 1),
      filledLines: 2,
      lastLine: 2,
    },
    {
      name: "mixed ratios",
      width: 1216,
      // bases 300 150 400 200 120 | 600 250 160 | 350 200 500 | 180.
      ratios: [1.5, 0.75, 2, 1, 0.6, 3, 1.25, 0.8, 1.75, 1, 2.5, 0.9],
      filledLines: 3,
      lastLine: 1,
    },
  ];

  for (const { name, width, ratios, filledLines, lastLine } of cases) {
    test(`with ${name}`, async ({ page }) => {
      await page.evaluate(
        ({ ratios, w }) => window.buildGrid({ ratios, width: w }),
        { ratios, w: width },
      );
      const cells = await page.evaluate(() => window.measureCells());
      const grid = await page.evaluate(() => window.measureGrid());

      expect(cells).toHaveLength(ratios.length);
      expect(grid.gap).toBe(JG_GAP);
      expect(grid.width).toBeCloseTo(width, 1);

      const lines = new Map<number, Cell[]>();
      for (const cell of cells) {
        const key = Math.round(cell.top * 2) / 2;
        lines.set(key, [...(lines.get(key) ?? []), cell]);
      }
      const tops = [...lines.keys()].sort((a, b) => a - b);
      expect(tops).toHaveLength(filledLines + 1);

      for (const top of tops.slice(0, -1)) {
        const line = lines.get(top)!;
        const spanned =
          line.reduce((sum, c) => sum + c.width, 0) +
          JG_GAP * (line.length - 1);
        expect(spanned).toBeCloseTo(grid.width, 1);
      }

      // The last line keeps every cell at its basis: `.justified-grid-tail`
      // takes the slack so two leftover pictures do not blow up to half a
      // row each and read as the most important ones in the folder.
      const last = lines.get(tops[tops.length - 1])!;
      expect(last).toHaveLength(lastLine);
      const expected = unstretchedWidths(
        last.map((cell) => cell.ratio),
        JG_ROW_H_WIDE,
        grid.width,
      );
      last.forEach((cell, i) => {
        expect(cell.width).toBeCloseTo(expected[i], 1);
      });
    });
  }
});

/**
 * The FLIP play, as the browser resolves it.
 *
 * The duration is asserted against the hook's own constant rather than
 * against `200ms`: the hook takes its marks off after `FLIP_DURATION_MS +
 * 50`, so a longer duration in the stylesheet would cut every play short,
 * and the two are only ever right together. Two implementations, one in
 * TypeScript and one compiled out of the stylesheet by Chromium.
 *
 * The easing is here because it is one of the five mutations #203 left
 * deliberately alive: `ease-out` against `linear` is invisible to jsdom,
 * which resolves no transition at all.
 */
test.describe("the FLIP transition", () => {
  test("plays transform and opacity, eased out, for the hook's duration", async ({
    page,
  }) => {
    await page.evaluate(() =>
      window.buildGrid({ ratios: [1, 1], width: 900, flip: "play" }),
    );
    const flip = await page.evaluate(() => window.measureFlip());

    expect(flip.transitionProperty).toBe("transform, opacity");
    const seconds = `${FLIP_DURATION_MS / 1000}s`;
    expect(flip.transitionDuration).toBe(`${seconds}, ${seconds}`);
    expect(flip.transitionTimingFunction).toBe("ease-out, ease-out");
    // `transform-origin: top left` — the corner a flex line lays out
    // from, and the corner the hook inverts by.
    expect(flip.transformOrigin).toBe("0px 0px");
  });

  test("does not animate the inverted frame", async ({ page }) => {
    await page.evaluate(() =>
      window.buildGrid({ ratios: [1, 1], width: 900, flip: "invert" }),
    );
    const flip = await page.evaluate(() => window.measureFlip());

    expect(flip.transitionProperty).toBe("none");
    expect(flip.transitionDuration).toBe("0s");
    expect(flip.transformOrigin).toBe("0px 0px");
  });
});
