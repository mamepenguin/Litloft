/**
 * The Reading and Video faces' width invariants, measured in Chromium
 * against a static page carrying the app's compiled `globals.css`.
 *
 * The fixture draws from a declared table of shapes, because a selector
 * reaches a case only if it matches markup the fixture writes.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BOOK_GRID, VIDEO_GRID, cardGridTemplate, columnsFor, rowsFor } from "../src/lib/cardGrid";

const FIXTURE_FILE = resolve(
  __dirname,
  "fixtures",
  "reading-video-faces.html",
);
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

type Markup = {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  children?: Markup[];
  ref?: string;
};

const SHAPES: Record<string, Markup> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const SHAPE_COUNT = 15;

const APPS = [
  { app: "reading", face: "discover" },
  { app: "reading", face: "library" },
  { app: "video", face: "discover" },
  { app: "video", face: "library" },
] as const;

const WIDTHS = [320, 768, 1280, 1920];

const FACE_COUNT = 4;

type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type Row = Box & { scrollWidth: number; clientWidth: number };

type Shelf = Row & {
  gridScrollWidth: number;
  gridClientWidth: number;
  cards: number;
  seeAll: Box;
};

type Measurement = {
  media: { fine: boolean; coarse: boolean };
  pageOverflowsX: boolean;
  frame: Box;
  tabs: Row;
  shelves: Shelf[];
  chipRow: Row | null;
  controls: Row | null;
  shapes: string[];
};

declare global {
  interface Window {
    buildApp: (app: string, face: string) => void;
    firstGridWidth: () => number;
    fillGrids: (template: string, capacity: number) => void;
    measureApp: () => Measurement;
  }
}

/** Chromium resolves lengths to a 64th of a pixel; one box edge can land there. */
const PX = 0.5;

async function layout(
  page: Page,
  app: string,
  face: string,
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(FIXTURE);
  await page.evaluate(([a, f]) => window.buildApp(a, f), [app, face]);

  const gridWidth = await page.evaluate(() => window.firstGridWidth());
  const metrics = app === "reading" ? BOOK_GRID : VIDEO_GRID;
  const columns = columnsFor(gridWidth, metrics);
  const capacity = columns * rowsFor(columns);
  await page.evaluate(
    ({ template, count }) => window.fillGrids(template, count),
    { template: cardGridTemplate(columns, metrics), count: capacity },
  );

  return {
    columns,
    metrics,
    capacity,
    m: await page.evaluate(() => window.measureApp()),
  };
}

const inside = (inner: Box, outer: Box) => {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - PX);
  expect(inner.right).toBeLessThanOrEqual(outer.right + PX);
};

const noSidewaysScroll = (row: Row) =>
  expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);

test.describe("a mouse environment", () => {
  test.use({ viewport: { width: 320, height: 900 }, hasTouch: false });

  for (const width of WIDTHS) {
    test.describe(`at ${width}px`, () => {
      expect(WIDTHS).toHaveLength(4);

      for (const { app, face } of APPS) {
        test(`${app} ${face} keeps every row inside the page`, async ({
          page,
        }) => {
          const { capacity, metrics, m } = await layout(page, app, face, width);

          expect(m.media.fine).toBe(true);
          expect(m.media.coarse).toBe(false);
          expect(m.pageOverflowsX).toBe(false);

          inside(m.tabs, m.frame);
          noSidewaysScroll(m.tabs);

          expect(m.shelves.length).toBeGreaterThan(0);
          for (const shelf of m.shelves) {
            inside(shelf, m.frame);
            noSidewaysScroll(shelf);
            expect(shelf.gridScrollWidth).toBeLessThanOrEqual(
              shelf.gridClientWidth,
            );
            expect(shelf.cards).toBe(capacity);
            expect(shelf.cards).toBeLessThanOrEqual(
              columnsFor(shelf.gridClientWidth, metrics) *
                rowsFor(columnsFor(shelf.gridClientWidth, metrics)),
            );
            inside(shelf.seeAll, shelf);
            inside(shelf.seeAll, m.frame);
          }

          if (face === "library") {
            if (app === "video") expect(m.chipRow).toBeNull();
            expect(m.controls).not.toBeNull();
            inside(m.controls!, m.frame);
            noSidewaysScroll(m.controls!);
          } else {
            expect(m.chipRow).toBeNull();
            expect(m.controls).toBeNull();
          }

          if (app === "reading" && face === "library") {
            expect(m.chipRow).not.toBeNull();
            inside(m.chipRow!, m.frame);
            noSidewaysScroll(m.chipRow!);
          }
        });
      }
    });
  }

  test("a narrower container gives fewer columns, never a sideways scroll", async ({
    page,
  }) => {
    for (const app of ["reading", "video"]) {
      const narrow = await layout(page, app, "discover", 320);
      const wide = await layout(page, app, "discover", 1920);

      expect(narrow.columns).toBeLessThan(wide.columns);

      for (const { columns, m } of [narrow, wide]) {
        expect(m.pageOverflowsX).toBe(false);
        for (const shelf of m.shelves) {
          expect(shelf.cards).toBeLessThanOrEqual(columns * rowsFor(columns));
          expect(shelf.gridScrollWidth).toBeLessThanOrEqual(
            shelf.gridClientWidth,
          );
        }
      }
    }
  });

  test("draws every declared shape", async ({ page }) => {
    const drawn = new Set<string>();
    for (const { app, face } of APPS) {
      const { m } = await layout(page, app, face, 1280);
      for (const shape of m.shapes) drawn.add(shape);
    }

    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
    expect(APPS).toHaveLength(FACE_COUNT);
    expect([...drawn].sort()).toEqual(Object.keys(SHAPES).sort());
  });
});

test.describe("a touch environment", () => {
  test.use({
    viewport: { width: 320, height: 900 },
    hasTouch: true,
    isMobile: true,
  });

  test("the chip row scrolls sideways and the page does not", async ({
    page,
  }) => {
    const { m } = await layout(page, "reading", "library", 320);

    expect(m.media.coarse).toBe(true);
    expect(m.media.fine).toBe(false);
    expect(m.pageOverflowsX).toBe(false);
    expect(m.chipRow).not.toBeNull();
    expect(m.chipRow!.scrollWidth).toBeGreaterThan(m.chipRow!.clientWidth);
    inside(m.chipRow!, m.frame);
  });
});
