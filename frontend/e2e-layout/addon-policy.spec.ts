/**
 * The addon-policy table's column headings, measured in Chromium.
 *
 * `position: sticky` resolves against the nearest scrollport, and the
 * wrapper's `overflow-x: auto` makes it one in both axes — so a sticky head
 * inside an unbounded wrapper sticks to a box that never scrolls, with the
 * class present and correct.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "addon-policy.html"),
).href;

const COLUMNS = 4;

/**
 * The app's own table at four drives: four drive rows and eight feature
 * sub-rows. A row count that is not the app's turns a claim about the app
 * into a claim about the fixture.
 */
const APP_DRIVES = 4;
const APP_FEATURES_PER_DRIVE = 2;
const APP_TABLE_HEIGHT = 548;

/**
 * `70vh` against the app's table means the wrapper scrolls below a 783px
 * viewport and not above it, so the answer is declared per height.
 */
const HEIGHTS: { height: number; label: string; innerScroll: boolean }[] = [
  { height: 667, label: "iPhone SE viewport", innerScroll: true },
  { height: 715, label: "a phone with browser chrome", innerScroll: true },
  { height: 745, label: "iPhone 15 viewport", innerScroll: true },
  { height: 807, label: "a 1512x807 desktop window", innerScroll: false },
  { height: 863, label: "a taller desktop window", innerScroll: false },
];

const WIDTHS = [375, 430];

const HEIGHT_GROUP = "what the cap does at each real viewport height";
const WIDTH_GROUP = "the columns still reach a narrow screen";

/**
 * Pushed after `test()` registers, never before: a record written first
 * survives a `continue`, `throw` or condition that drops the registration.
 */
const registered: string[] = [];

const caseId = (group: string, label: string) => `${group} — ${label}`;

interface Measurement {
  frameWidth: number;
  capPx: number;
  wrapperHeight: number;
  tableHeight: number;
  scrollsVertically: boolean;
  scrollsHorizontally: boolean;
  scrolledTo: number;
  headTop: number;
  firstRowTop: number;
  headPosition: string;
  headBackground: string;
}

declare global {
  interface Window {
    buildPolicyTable: (spec: {
      width: number;
      drives: number;
      featuresPerDrive: number;
      columns: number;
    }) => void;
    measurePolicyTable: (scrollTop?: number) => Measurement;
  }
}

async function layout(
  page: import("@playwright/test").Page,
  {
    width,
    height,
    drives = APP_DRIVES,
  }: { width: number; height: number; drives?: number },
  scrollTop = 0,
): Promise<Measurement> {
  await page.setViewportSize({ width: width + 40, height });
  await page.evaluate(
    (spec) => window.buildPolicyTable(spec),
    {
      width,
      drives,
      featuresPerDrive: APP_FEATURES_PER_DRIVE,
      columns: COLUMNS,
    },
  );
  return page.evaluate((top) => window.measurePolicyTable(top), scrollTop);
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test.describe("the column headings survive the scroll", () => {
  test("the app's own table, on a phone's height, scrolls to its end with the head still at the top", async ({ page }) => {
    // Scrolled to the end rather than by a chosen number of pixels: the
    // whole scroll here is short, and a larger request would clamp.
    const m = await layout(page, { width: 700, height: 667 }, 10_000);

    expect(m.scrollsVertically).toBe(true);
    expect(Math.round(m.scrolledTo)).toBe(
      Math.round(m.tableHeight - m.wrapperHeight),
    );
    expect(m.scrolledTo).toBeGreaterThan(0);
    expect(m.headTop).toBe(0);
    expect(m.firstRowTop).toBeLessThan(0);
  });

  test("and over a long scroll, with more drives than this library has", async ({ page }) => {
    // The app's own table only scrolls a little on a phone, which is a
    // weak exercise of a sticky heading.
    const m = await layout(page, { width: 700, height: 800, drives: 12 }, 600);

    expect(m.scrollsVertically).toBe(true);
    expect(m.scrolledTo).toBe(600);
    expect(m.headTop).toBe(0);
    expect(m.firstRowTop).toBeLessThan(-500);
  });

  test("the head is opaque, so the rows do not show through it", async ({ page }) => {
    const m = await layout(
      page,
      { width: 700, height: 667 },
      300,
    );
    expect(m.headPosition).toBe("sticky");
    expect(m.headBackground).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("the app's own table is the height the claims are made about", async ({ page }) => {
    const m = await layout(page, { width: 700, height: 900 });
    expect(Math.round(m.tableHeight)).toBe(APP_TABLE_HEIGHT);
  });

  test("the cap is 70% of the window, measured in both directions", async ({ page }) => {
    // On the cap and not on the realised box: `max-height` is a ceiling,
    // so where the table is shorter the box is the table's own height.
    const tall = await layout(page, { width: 700, height: 1000 });
    expect(tall.capPx).toBeCloseTo(700, 0);
    expect(tall.wrapperHeight).toBeCloseTo(APP_TABLE_HEIGHT, 0);

    const short = await layout(page, { width: 700, height: 500 });
    expect(short.capPx).toBeCloseTo(350, 0);
    expect(short.wrapperHeight).toBeCloseTo(350, 0);
  });
});

test.describe(HEIGHT_GROUP, () => {
  expect(HEIGHTS).toHaveLength(5);

  for (const { height, label, innerScroll } of HEIGHTS) {
    test(`${height}px (${label})`, async ({ page }) => {
      const m = await layout(page, { width: 700, height });

      expect(m.capPx).toBeCloseTo(height * 0.7, 0);
      expect(m.scrollsVertically).toBe(innerScroll);
      expect(height * 0.7 < APP_TABLE_HEIGHT).toBe(innerScroll);
      expect(m.headTop).toBe(0);
    });
    registered.push(caseId(HEIGHT_GROUP, `${height}px`));
  }
});

test.describe(WIDTH_GROUP, () => {
  expect(WIDTHS).toHaveLength(2);

  for (const width of WIDTHS) {
    test(`${width}px scrolls sideways, and vertically too on a phone's height`, async ({ page }) => {
      const m = await layout(page, { width, height: 667 });

      // Every other assertion here is a boolean both widths answer the
      // same way, so the case's own width is read back.
      expect(m.frameWidth).toBeCloseTo(width, 0);
      expect(m.scrollsHorizontally).toBe(true);
      // Both axes, and that is the trade rather than an accident: the
      // nested scroller is what keeps the checkbox columns labelled.
      expect(m.scrollsVertically).toBe(true);
      expect(m.headTop).toBe(0);
    });
    registered.push(caseId(WIDTH_GROUP, `${width}px`));
  }
});

test("every case both tables declare was registered", () => {
  // Rebuilt from the two tables, so it does not follow a loop that has
  // been walked back.
  expect(registered).toEqual([
    ...HEIGHTS.map(({ height }) => caseId(HEIGHT_GROUP, `${height}px`)),
    ...WIDTHS.map((width) => caseId(WIDTH_GROUP, `${width}px`)),
  ]);
});
