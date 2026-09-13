/**
 * The justified thumbnail grid's layout invariants, measured in Chromium
 * against a static page carrying the app's compiled `globals.css`.
 *
 * The fixture draws from a declared table of cell shapes, because a
 * selector reaches a case only if it matches markup the fixture writes.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FLIP_DURATION_MS } from "../src/hooks/useJustifiedFlip";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "justified-grid.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

type Markup = {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  children?: Markup[];
};
type ShapeSpec = Markup & { source: string };

/**
 * Read out of the page rather than restated, so a shape added to the
 * fixture gets a geometry test; `SHAPE_COUNT` stops it going the other way.
 */
const SHAPES: Record<string, ShapeSpec> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const SHAPE_COUNT = 10;

const JG_GAP = 8;
const JG_ROW_H_NARROW = 120;
const JG_ROW_H_WIDE = 200;
/** `@container justified-grid (min-width: 40rem)`, at a 16px root. */
const JG_CONTAINER_BREAKPOINT = 640;
const JG_MAX_STRETCH = 2.5;
/** `flex-grow` on `.justified-grid-tail`, the last line's slack absorber. */
const JG_TAIL_GROW = 9999;

const ceilingAt = (rowH: number) => rowH * JG_MAX_STRETCH;

type Tree = { tag: string; class: string; children: Tree[] };

type Cell = {
  ratio: number;
  shape: string;
  tree: Tree;
  attrs: Record<string, string>;
  width: number;
  height: number;
  top: number;
  left: number;
};

type GridSpec = {
  ratios: number[];
  width: number;
  flip?: "invert" | "play";
  shapes?: string[];
};

declare global {
  interface Window {
    buildGrid: (spec: GridSpec) => void;
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

/**
 * Chromium resolves lengths to a 64th of a pixel; `PX` is several times
 * that bound because a line-fill assertion sums five such errors. `REL` is
 * the same tolerance against a ratio.
 */
const PX = 0.05;
const REL = 1e-3;

const expectPx = (actual: number, expected: number, what: string) =>
  expect(
    Math.abs(actual - expected),
    `${what}: measured ${actual}px, predicted ${expected}px`,
  ).toBeLessThan(PX);

/**
 * The absorber's grow factor is large rather than infinite, so each cell on
 * the last line keeps its own share of the slack. A line ending in the
 * absorber has one gap per cell, not one fewer.
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
  const growSum = ratios.reduce((sum, ratio) => sum + ratio, 0) + JG_TAIL_GROW;
  return bases.map((basis, i) => basis + (ratios[i] * free) / growSum);
};

/**
 * The viewport is sized to the grid, so `@media (max-width: …)` rules are
 * reachable from the narrow cases. The 80px is room for a scrollbar and a
 * little chrome.
 */
async function layout(page: import("@playwright/test").Page, spec: GridSpec) {
  await page.setViewportSize({ width: spec.width + 80, height: 900 });
  await page.evaluate((s) => window.buildGrid(s), spec);
  return page.evaluate(() => window.measureCells());
}

const declaredTree = (spec: Markup): Tree => ({
  tag: spec.tag,
  class: spec.class,
  children: (spec.children ?? []).map(declaredTree),
});

function expectShape(cell: Cell, shape: string) {
  const spec = SHAPES[shape];
  expect(cell.shape).toBe(shape);
  expect(cell.tree).toEqual(declaredTree(spec));
  for (const [name, value] of Object.entries(spec.attrs ?? {})) {
    expect(cell.attrs, `${shape}: [${name}]`).toHaveProperty(name);
    if (value !== "*") expect(cell.attrs[name]).toBe(value);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

/**
 * Pushed after `test()` registers, never before: a record written first
 * survives a `continue`, `throw` or condition that drops the registration.
 */
const registered: string[] = [];

const caseId = (group: string, label: string) => `${group} — ${label}`;

const shapeCaseId = (shape: string) =>
  `${shape} (${SHAPES[shape].source}) is the shape of its own ratio`;

const ROW_HEIGHT_GROUP = "the row height the container query picks";
const CELL_SHAPE_GROUP = "a cell is the shape of its own ratio";
const DECLARED_SHAPE_GROUP = "every declared cell shape";
const LINE_FILL_GROUP = "lines fill the grid";

/**
 * A lone ratio-1 cell with the slack absorber after it is laid out at its
 * basis, which is `--jg-row-h`, only while the absorber's grow factor
 * dominates the line's free space.
 */
const ROW_HEIGHT_CASES = [
  { width: 420, rowH: JG_ROW_H_NARROW },
  { width: JG_CONTAINER_BREAKPOINT - 1, rowH: JG_ROW_H_NARROW },
  { width: JG_CONTAINER_BREAKPOINT, rowH: JG_ROW_H_WIDE },
  { width: 1469, rowH: JG_ROW_H_WIDE },
];

const rowHeightId = ({ width, rowH }: { width: number; rowH: number }) =>
  `is ${rowH}px on a ${width}px grid`;

test.describe(ROW_HEIGHT_GROUP, () => {
  expect(ROW_HEIGHT_CASES).toHaveLength(4);

  for (const { width, rowH } of ROW_HEIGHT_CASES) {
    test(`is ${rowH}px on a ${width}px grid`, async ({ page }) => {
      const cells = await layout(page, { ratios: [1], width });

      expect(cells).toHaveLength(1);
      expectPx(
        cells[0].width,
        unstretchedWidths([1], rowH, width)[0],
        "lone cell width",
      );
      expectPx(cells[0].height, cells[0].width, "lone cell height");
    });
    registered.push(caseId(ROW_HEIGHT_GROUP, rowHeightId({ width, rowH })));
  }
});

/**
 * The expected number of cells that reach the ceiling is declared per
 * case: a count read back from the measurement would let a change that
 * clamps every cell pass.
 */
const RATIOS = [
  3, 0.5, 1, 1.5, 0.75, 2, 4 / 3, 0.6, 2.5, 1, 0.8, 1.2, 1.77, 0.66, 1, 2.2,
  0.9, 1.4,
];

function expectRatios(cells: Cell[], rowH: number, clamped: number) {
  expect(cells).toHaveLength(RATIOS.length);
  expect(cells.map((c) => c.ratio)).toEqual(RATIOS);

  const ceiling = ceilingAt(rowH);
  const atCeiling = cells.filter((c) => c.height > ceiling - PX);
  expect(atCeiling).toHaveLength(clamped);

  for (const cell of atCeiling) {
    expectPx(cell.height, ceiling, "clamped cell height");
  }

  for (const cell of cells.filter((c) => c.height <= ceiling - PX)) {
    expect(
      Math.abs(cell.width / cell.height - cell.ratio) / cell.ratio,
      `cell at ratio ${cell.ratio}: measured ${cell.width} x ${cell.height}`,
    ).toBeLessThan(REL);
  }
}

const CELL_SHAPE_CASES = [
  { width: 420, rowH: JG_ROW_H_NARROW, clamped: 0 },
    // The one width in this set where greedy line-breaking strands a
    // narrow cell high enough to meet the ceiling.
  { width: 640, rowH: JG_ROW_H_WIDE, clamped: 1 },
  { width: 900, rowH: JG_ROW_H_WIDE, clamped: 0 },
  { width: 1200, rowH: JG_ROW_H_WIDE, clamped: 0 },
  { width: 1469, rowH: JG_ROW_H_WIDE, clamped: 0 },
];

test.describe(CELL_SHAPE_GROUP, () => {
  expect(CELL_SHAPE_CASES).toHaveLength(5);

  for (const { width, rowH, clamped } of CELL_SHAPE_CASES) {
    test(`at every ratio on a ${width}px grid`, async ({ page }) => {
      expectRatios(await layout(page, { ratios: RATIOS, width }), rowH, clamped);
    });
    registered.push(caseId(CELL_SHAPE_GROUP, `at every ratio on a ${width}px grid`));
  }
});

/**
 * A selector naming an element type, class, attribute or descendant the
 * fixture does not write is unreachable, so every declared shape is run.
 * One width is enough: the shapes differ in markup, not in geometry.
 */
test.describe(DECLARED_SHAPE_GROUP, () => {
  test("is exactly the set this file tests", () => {
    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
  });

  for (const shape of Object.keys(SHAPES)) {
    test(`${shape} (${SHAPES[shape].source}) is the shape of its own ratio`, async ({
      page,
    }) => {
      const cells = await layout(page, {
        ratios: RATIOS,
        width: 1200,
        shapes: RATIOS.map(() => shape),
      });
      for (const cell of cells) expectShape(cell, shape);
      expectRatios(cells, JG_ROW_H_WIDE, 0);
    });
    registered.push(caseId(DECLARED_SHAPE_GROUP, shapeCaseId(shape)));
  }

  test("mixes on one line without either shape losing its ratio", async ({
    page,
  }) => {
    const shapes = RATIOS.map((_, i) =>
      i % 2 === 0 ? "archiveOpenable" : "archiveDeadEnd",
    );
    const cells = await layout(page, { ratios: RATIOS, width: 1200, shapes });
    cells.forEach((cell, i) => expectShape(cell, shapes[i]));
    expectRatios(cells, JG_ROW_H_WIDE, 0);
  });
});

/**
 * `[3, 0.5, 3, 3]` at 700px: 600 + 8 + 100 overflows the grid, so the
 * ratio-0.5 cell is alone on a line that is not the last, where the slack
 * absorber is not there to hold it at its basis.
 */
test("clamps a stranded cell at the ceiling and leaves its width alone", async ({
  page,
}) => {
  const WIDTH = 700;
  const RATIO_SET = [3, 0.5, 3, 3];
  const STRANDED = 0.5;

  const cells = await layout(page, { ratios: RATIO_SET, width: WIDTH });
  expect(cells).toHaveLength(RATIO_SET.length);

  const stranded = cells[1];
  expect(stranded.ratio).toBe(STRANDED);
  expect(cells.filter((c) => Math.abs(c.top - stranded.top) < PX)).toHaveLength(
    1,
  );

  // A lone flex item whose grow factor is under 1 receives only that
  // fraction of the line's free space.
  const basis = STRANDED * JG_ROW_H_WIDE;
  expectPx(stranded.width, basis + STRANDED * (WIDTH - basis), "stranded width");
  expectPx(stranded.height, ceilingAt(JG_ROW_H_WIDE), "stranded height");
  expect(stranded.width / stranded.height).toBeGreaterThan(STRANDED + 0.2);
});

/**
 * The filled-line count is declared, not counted, with the line-breaking
 * arithmetic written out per case.
 */
const LINE_FILL_CASES = [
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

test.describe(LINE_FILL_GROUP, () => {
  expect(LINE_FILL_CASES).toHaveLength(2);

  for (const { name, width, ratios, filledLines, lastLine } of LINE_FILL_CASES) {
    test(`with ${name}`, async ({ page }) => {
      const cells = await layout(page, { ratios, width });
      const grid = await page.evaluate(() => window.measureGrid());

      expect(cells).toHaveLength(ratios.length);
      expect(grid.gap).toBe(JG_GAP);
      expectPx(grid.width, width, "grid width");

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
          line.reduce((sum, c) => sum + c.width, 0) + JG_GAP * (line.length - 1);
        expectPx(spanned, grid.width, `line at y=${top}`);
      }

      const last = lines.get(tops[tops.length - 1])!;
      expect(last).toHaveLength(lastLine);
      const expected = unstretchedWidths(
        last.map((cell) => cell.ratio),
        JG_ROW_H_WIDE,
        grid.width,
      );
      last.forEach((cell, i) => {
        expectPx(cell.width, expected[i], `last line cell ${i}`);
      });
    });
    registered.push(caseId(LINE_FILL_GROUP, `with ${name}`));
  }
});

/**
 * The duration is asserted against the hook's constant: the hook takes its
 * marks off after `FLIP_DURATION_MS + 50`, so a longer duration in the
 * stylesheet would cut every play short.
 */
test.describe("the FLIP transition", () => {
  test("plays transform and opacity, eased out, for the hook's duration", async ({
    page,
  }) => {
    await layout(page, { ratios: [1, 1], width: 900, flip: "play" });
    const flip = await page.evaluate(() => window.measureFlip());

    expect(flip.transitionProperty).toBe("transform, opacity");
    const seconds = `${FLIP_DURATION_MS / 1000}s`;
    expect(flip.transitionDuration).toBe(`${seconds}, ${seconds}`);
    expect(flip.transitionTimingFunction).toBe("ease-out, ease-out");
    // The corner a flex line lays out from, and the corner the hook
    // inverts by.
    expect(flip.transformOrigin).toBe("0px 0px");
  });

  test("does not animate the inverted frame", async ({ page }) => {
    await layout(page, { ratios: [1, 1], width: 900, flip: "invert" });
    const flip = await page.evaluate(() => window.measureFlip());

    expect(flip.transitionProperty).toBe("none");
    expect(flip.transitionDuration).toBe("0s");
    expect(flip.transformOrigin).toBe("0px 0px");
  });
});

test("every generated case was registered", () => {
  // Rebuilt from the tables, so it does not follow a loop that has been
  // walked back.
  expect(registered).toEqual([
    ...ROW_HEIGHT_CASES.map((c) => caseId(ROW_HEIGHT_GROUP, rowHeightId(c))),
    ...CELL_SHAPE_CASES.map(({ width }) =>
      caseId(CELL_SHAPE_GROUP, `at every ratio on a ${width}px grid`),
    ),
    ...Object.keys(SHAPES).map((shape) =>
      caseId(DECLARED_SHAPE_GROUP, shapeCaseId(shape)),
    ),
    ...LINE_FILL_CASES.map(({ name }) => caseId(LINE_FILL_GROUP, `with ${name}`)),
  ]);
});
