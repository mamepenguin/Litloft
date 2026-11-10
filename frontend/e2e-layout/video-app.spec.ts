/**
 * The video app's two faces at a phone width and a desktop width, measured in
 * Chromium: nothing widens the page, a shelf scrolls inside itself, cards
 * keep the 16:9 box and the two-line title, and the Library toolbar's two
 * buttons share one row.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(resolve(__dirname, "fixtures", "video-app.html")).href;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface Measurement {
  viewport: number;
  pageOverflowsX: boolean;
  header: Box;
  tile: Box;
  target: Box;
  tabs: Box;
  toolbar: Box | null;
  classification: Box | null;
  sort: Box | null;
  rows: (Box & { scrollWidth: number; clientWidth: number; cards: number })[];
  thumb: Box;
  cardSlot: Box;
  longTitle: Box & { lineHeight: number };
  shortTitle: Box;
  progress: Box | null;
  shelfTitles: (Box & { truncated: boolean })[];
  seeAll: Box[];
}

declare global {
  interface Window {
    buildVideoApp: (face: "discover" | "library") => void;
    measureVideoApp: () => Measurement;
  }
}

const PHONE = 390;
const DESKTOP = 1440;
/** `h-1` and the 16:9 `aspect-video`, declared and not read off a measurement. */
const PROGRESS_PX = 4;
const TILE_PX = 40;

async function measure(page: Page, face: "discover" | "library", width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(FIXTURE);
  await page.evaluate((f) => window.buildVideoApp(f), face);
  return page.evaluate(() => window.measureVideoApp());
}

for (const width of [PHONE, DESKTOP]) {
  test.describe(`at ${width}px`, () => {
    test(`Discover does not widen the page, and each shelf scrolls inside itself`, async ({ page }) => {
      const m = await measure(page, "discover", width);

      expect(m.viewport).toBe(width);
      expect(m.pageOverflowsX).toBe(false);
      expect(m.rows).toHaveLength(4);
      for (const row of m.rows) {
        expect(row.cards).toBe(12);
        expect(row.right).toBeLessThanOrEqual(width);
        // Twelve cards at least 176px wide never fit one screen, so the row is the thing that scrolls.
        expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
      }
    });

    test(`a card keeps a 16:9 thumbnail, a 4px progress bar and a two-line title`, async ({ page }) => {
      const m = await measure(page, "discover", width);

      expect(m.thumb.width / m.thumb.height).toBeCloseTo(16 / 9, 1);
      expect(m.progress!.height).toBe(PROGRESS_PX);
      expect(m.progress!.width).toBeCloseTo(m.thumb.width, 0);
      expect(m.longTitle.height).toBeLessThanOrEqual(m.longTitle.lineHeight * 2 + 1);
      expect(m.longTitle.height).toBeGreaterThan(m.shortTitle.height);
      expect(m.cardSlot.width).toBeGreaterThanOrEqual(176);
    });

    test(`the header holds the icon tile, the title and Target inside the page`, async ({ page }) => {
      const m = await measure(page, "discover", width);

      expect(m.tile.width).toBe(TILE_PX);
      expect(m.target.right).toBeLessThanOrEqual(width);
      expect(m.target.left).toBeGreaterThanOrEqual(0);
      expect(m.tabs.right).toBeLessThanOrEqual(width);
      expect(m.tabs.bottom).toBeLessThanOrEqual(m.header.bottom);
    });

    test(`Library puts Classification and Sort on one row, and no title pushes a See all off the page`, async ({ page }) => {
      const m = await measure(page, "library", width);

      expect(m.pageOverflowsX).toBe(false);
      expect(m.classification!.top).toBe(m.sort!.top);
      expect(m.classification!.right).toBeLessThanOrEqual(m.sort!.left);
      expect(m.rows).toHaveLength(2);
      for (const row of m.rows) expect(row.cards).toBe(5);
      for (const link of m.seeAll) expect(link.right).toBeLessThanOrEqual(width);
      expect(m.shelfTitles[1].truncated).toBe(width === PHONE);
    });
  });
}

test("at the desktop width the five Library cards of a shelf are all in view without scrolling", async ({ page }) => {
  const m = await measure(page, "library", DESKTOP);

  for (const row of m.rows) expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
});

test("at the phone width the Library shelf scrolls sideways inside itself", async ({ page }) => {
  const m = await measure(page, "library", PHONE);

  for (const row of m.rows) expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
});
