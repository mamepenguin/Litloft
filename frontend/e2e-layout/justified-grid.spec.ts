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
 * ## What it can see
 *
 * Anything decided by CSS plus the cells' own inline ratios: the shape of
 * a cell, the `max-height` ceiling, which lines justify, the row height
 * the container query picks, and the transition the FLIP play state
 * resolves to.
 *
 * That reaches a selector only if the selector matches markup the fixture
 * writes, which is why the fixture draws from a declared table of cell
 * shapes rather than one cell of its own: every class list the cell can
 * carry (six for `JustifiedFileCell`, two for `ArchiveEntryCard`), and
 * every element, attribute and class either component puts inside a cell.
 * `justifiedGridFixtureParity.test.tsx` renders one declared state per row
 * and fails if the table and the components come apart in either
 * direction — a deleted row included, which is the failure the earlier
 * vocabulary comparison could not see.
 *
 * ## What it cannot see
 *
 * Named so nobody reads a green tick as covering them.
 *
 * **No app is running**, so: `void grid.offsetWidth` in `useJustifiedFlip`
 * — the forced reflow between the invert and the play, whose deletion
 * stops every animation and which no suite in this repository notices
 * (#203); the hook's `settle()` timing, its rect rounding, and its unmount
 * cleanup; and the FLIP wiring itself, which
 * `useJustifiedFlip.test.tsx` holds by postcondition. An inline `style`
 * written by a component rather than by the fixture is in this class too.
 *
 * **The case list is finite**, so a query keyed above the widths below is
 * unreachable: `@container justified-grid (min-width: 1500px)` is past the
 * widest grid here and survives. The viewport is *not* in this class any
 * more — the fixture sizes the window to the grid, so a `@media` rule
 * keyed to a phone width is tested at a phone width — but a viewport
 * query outside the range the widths imply is.
 *
 * **The rows are not the cross product.** `selectable` with something
 * already selected can pair the select-mode wrapper with any of the four
 * `draggable` class lists, and one of those eight pairings has a row. One
 * pairing is named rather than drawn: `CollectionDetail` renders the
 * wrapper as a `<div>` through `useFileNavigationOverride`, with no
 * checkbox beside it. And nothing detects a *third* caller appearing — the
 * parity test knows about the two that exist.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FLIP_DURATION_MS } from "../src/hooks/useJustifiedFlip";
import { declareEach } from "../src/test/declareEach";

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
 * The cell shapes the fixture declares, read out of the page itself.
 *
 * Read rather than restated so that a shape added to the fixture gets a
 * geometry test without anyone remembering to add one — the count below
 * is what stops that from silently going the other way.
 */
const SHAPES: Record<string, ShapeSpec> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

/** Eight for `JustifiedFileCell`, two for `ArchiveEntryCard`. */
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

/**
 * `test` under the name `declareEach`'s `register` parameter has.
 *
 * Handed to the helper by reference rather than wrapped, so there is no
 * per-case callback with a registration inside it for a condition to sit
 * in front of. The describes below each pass their own table and compare
 * what came back against a set written out here — pinning the table is
 * not observing the loop that walks it.
 */
const registerCase: (
  title: string,
  body: (args: { page: Page }) => Promise<void>,
) => void = test;

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
 * How far a measured box may sit from the figure the geometry predicts.
 *
 * Not slack for "close enough": every figure the assertions compare
 * against is exact, and the tolerance only has to cover the layout
 * engine's own quantisation. Chromium resolves lengths to a 64th of a
 * pixel, which bounds a single value's error at 7.8e-3 px; the worst
 * observed across every case in this file is 4.3e-3 px, and the whole
 * suite still passes at a tolerance of 5e-3. 5e-2 is what is written, six
 * times the bound, because a line-fill assertion sums five of those errors
 * and none of the defects this file exists to catch move anything by less
 * than a pixel.
 *
 * Every comparison between a measured length and a predicted one goes
 * through `expectPx`, so tightening this value below the quantisation
 * reddens the suite. `REL` is the same tolerance expressed against a
 * ratio, where the worst observed is 9.3e-5.
 */
const PX = 0.05;
const REL = 1e-3;

const expectPx = (actual: number, expected: number, what: string) =>
  expect(
    Math.abs(actual - expected),
    `${what}: measured ${actual}px, predicted ${expected}px`,
  ).toBeLessThan(PX);

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
  const growSum = ratios.reduce((sum, ratio) => sum + ratio, 0) + JG_TAIL_GROW;
  return bases.map((basis, i) => basis + (ratios[i] * free) / growSum);
};

/**
 * Lay out a grid, in a window that could contain it.
 *
 * The viewport is sized to the grid rather than left at the config's
 * 1280px default. A 420px grid is a phone, and measuring one inside a
 * desktop window is a combination the app never draws — worse, it puts
 * every `@media (max-width: …)` rule out of reach of the narrow cases,
 * which is the width band `--jg-row-h: 120px` exists for. The 80px is
 * the room a scrollbar and a little chrome would take.
 */
async function layout(page: import("@playwright/test").Page, spec: GridSpec) {
  await page.setViewportSize({ width: spec.width + 80, height: 900 });
  await page.evaluate((s) => window.buildGrid(s), spec);
  return page.evaluate(() => window.measureCells());
}

/**
 * The cell was built as the shape the fixture's table declares.
 *
 * A guard on the builder, not a second reading of the components — the
 * builder builds from this same table, and it is
 * `justifiedGridFixtureParity.test.tsx` that holds the table against what
 * `JustifiedFileCell` and `ArchiveEntryCard` actually render.
 */
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

  const declared = declareEach(cases, registerCase, ({ width, rowH }) => ({
    title: `is ${rowH}px on a ${width}px grid`,
    id: `${width}->${rowH}`,
    body: async ({ page }: { page: Page }) => {
      const cells = await layout(page, { ratios: [1], width });

      expect(cells).toHaveLength(1);
      expectPx(
        cells[0].width,
        unstretchedWidths([1], rowH, width)[0],
        "lone cell width",
      );
      expectPx(cells[0].height, cells[0].width, "lone cell height");
    },
  }));

  test("declared a case on each side of the query", () => {
    // Written out rather than mapped off `cases`, so a row deleted from
    // the table disagrees with it — and `declareEach` records each id
    // only after its registration, so a case dropped inside the loop
    // shortens this list rather than leaving it full.
    expect(declared).toEqual([
      `420->${JG_ROW_H_NARROW}`,
      `${JG_CONTAINER_BREAKPOINT - 1}->${JG_ROW_H_NARROW}`,
      `${JG_CONTAINER_BREAKPOINT}->${JG_ROW_H_WIDE}`,
      `1469->${JG_ROW_H_WIDE}`,
    ]);
  });
});

/**
 * The invariant #200 was about: `cellAR == --jg-ratio`.
 *
 * The expected number of cells that reach the ceiling is declared per
 * case rather than counted from the run. A count read back from the
 * measurement would let a change that clamps every cell pass.
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
    // A cell that reaches the ceiling gives up its ratio and keeps its
    // width, so its height is the ceiling exactly.
    expectPx(cell.height, ceiling, "clamped cell height");
  }

  for (const cell of cells.filter((c) => c.height <= ceiling - PX)) {
    expect(
      Math.abs(cell.width / cell.height - cell.ratio) / cell.ratio,
      `cell at ratio ${cell.ratio}: measured ${cell.width} x ${cell.height}`,
    ).toBeLessThan(REL);
  }
}

test.describe("a cell is the shape of its own ratio", () => {
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

  const declared = declareEach(
    cases,
    registerCase,
    ({ width, rowH, clamped }) => ({
      title: `at every ratio on a ${width}px grid`,
      id: `${width}->${rowH}/${clamped}`,
      body: async ({ page }: { page: Page }) => {
        expectRatios(
          await layout(page, { ratios: RATIOS, width }),
          rowH,
          clamped,
        );
      },
    }),
  );

  test("declared a case at every width, with its clamp count", () => {
    // The clamp counts are in the ids, so this is also where swapping one
    // width's expected count for another's has to disagree.
    expect(declared).toEqual([
      `420->${JG_ROW_H_NARROW}/0`,
      `640->${JG_ROW_H_WIDE}/1`,
      `900->${JG_ROW_H_WIDE}/0`,
      `1200->${JG_ROW_H_WIDE}/0`,
      `1469->${JG_ROW_H_WIDE}/0`,
    ]);
  });
});

/**
 * The same invariant, once per declared cell shape.
 *
 * This is the axis that decides what a selector can reach, and it has cost
 * three rounds of findings: a selector naming an element type, a class, an
 * attribute or a descendant the fixture did not happen to write is
 * unreachable, however correct the geometry assertions are.
 * `button.justified-grid-cell`, `.justified-grid-cell.overflow-hidden`,
 * `.justified-grid-cell.select-none`,
 * `.justified-grid-cell.opacity-50.select-none`,
 * `.justified-grid-cell[draggable]`, `:has(.justified-grid-name)` and
 * `:has(> a[download])` are all real markup, and every one of them was
 * green against a fixture that drew less than the app does.
 *
 * One width is enough here: the shapes differ in markup, not in geometry,
 * so the width sweep above stays on the common shape.
 */
test.describe("every declared cell shape", () => {
  const declaredShapes = declareEach(
    Object.keys(SHAPES),
    registerCase,
    (shape) => ({
      title: `${shape} (${SHAPES[shape].source}) is the shape of its own ratio`,
      id: shape,
      body: async ({ page }: { page: Page }) => {
        const cells = await layout(page, {
          ratios: RATIOS,
          width: 1200,
          shapes: RATIOS.map(() => shape),
        });
        for (const cell of cells) expectShape(cell, shape);
        expectRatios(cells, JG_ROW_H_WIDE, 0);
      },
    }),
  );

  test("is exactly the set this file tests", () => {
    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
    // And the loop that walks it, not only the table it walks: pinning
    // `Object.keys(SHAPES)` stays green against `.slice(0, 1)` one line
    // below it. The register `declareEach` hands back is short whenever a
    // shape was not declared, which is what this second half reads.
    expect(declaredShapes).toEqual(Object.keys(SHAPES));
  });

  /**
   * And mixed, which is what an archive folder actually draws: an
   * openable page beside an entry with no preview.
   */
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
  const RATIO_SET = [3, 0.5, 3, 3];
  const STRANDED = 0.5;

  const cells = await layout(page, { ratios: RATIO_SET, width: WIDTH });
  expect(cells).toHaveLength(RATIO_SET.length);

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
  expectPx(stranded.width, basis + STRANDED * (WIDTH - basis), "stranded width");
  expectPx(stranded.height, ceilingAt(JG_ROW_H_WIDE), "stranded height");
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

  const declared = declareEach(
    cases,
    registerCase,
    ({ name, width, ratios, filledLines, lastLine }) => ({
      title: `with ${name}`,
      id: `${name} @ ${width}: ${filledLines}+${lastLine}`,
      body: async ({ page }: { page: Page }) => {
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
          expectPx(cell.width, expected[i], `last line cell ${i}`);
        });
      },
    }),
  );

  test("declared a case for each line-breaking shape", () => {
    // The line counts ride in the ids, so this is where a case that lost
    // its `filledLines` has to disagree as well as one that was dropped.
    expect(declared).toEqual([
      "equal ratios @ 1216: 2+2",
      "mixed ratios @ 1216: 3+1",
    ]);
  });
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
    await layout(page, { ratios: [1, 1], width: 900, flip: "play" });
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
    await layout(page, { ratios: [1, 1], width: 900, flip: "invert" });
    const flip = await page.evaluate(() => window.measureFlip());

    expect(flip.transitionProperty).toBe("none");
    expect(flip.transitionDuration).toBe("0s");
    expect(flip.transformOrigin).toBe("0px 0px");
  });
});
