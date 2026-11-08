/**
 * The shelf and the collection panel in the states a fetch can leave them
 * in. The many-item cases live in `no-horizontal-scroll.spec.ts`; these are
 * the empty, loading, failed and few-item states, which a mouse still must
 * not have to scroll sideways through.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "no-horizontal-scroll.html"),
).href;

const TOLERANCE = 1;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface ScrollBox extends Box {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  overflowX: string;
  overflowY: string;
}

interface ShelfSpec {
  width: number;
  cards: number;
  seeAll: boolean;
  state?: "loaded" | "loading" | "failed";
}

interface ShelfReading {
  row: ScrollBox;
  cards: Box[];
  seeAll: boolean;
}

interface CollectionReading {
  list: ScrollBox;
  scrolledTo: number;
  tracks: Box[];
}

const within = (inner: Box, outer: Box) =>
  inner.left >= outer.left - TOLERANCE &&
  inner.right <= outer.right + TOLERANCE &&
  inner.top >= outer.top - TOLERANCE &&
  inner.bottom <= outer.bottom + TOLERANCE;

async function horizontalScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const EXEMPT =
      ".markdown-body pre, .markdown-body .markdown-table-scroll, .markdown-body .code-block, .mermaid-diagram";
    return Array.from(document.querySelectorAll("body *"))
      .filter(
        (node) =>
          !node.closest(EXEMPT) && !node.closest("[data-hscroll-exempt]"),
      )
      .filter((node) => {
        const overflow = getComputedStyle(node).overflowX;
        return (
          (overflow === "auto" || overflow === "scroll") &&
          node.scrollWidth > node.clientWidth + 1
        );
      })
      .map((node) => `${node.tagName.toLowerCase()}.${String(node.className)}`);
  });
}

const buildShelf = (page: Page, spec: ShelfSpec) =>
  page.evaluate(
    (s) =>
      (window as unknown as { buildShelf: (spec: ShelfSpec) => void }).buildShelf(
        s,
      ),
    spec,
  );

const readShelf = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { measureShelf: () => ShelfReading }
      ).measureShelf(),
  );

async function shelf(
  page: Page,
  state: "loaded" | "loading" | "failed",
  cards: number,
) {
  await page.goto(FIXTURE);
  await buildShelf(page, { width: 900, cards, seeAll: true, state });
  return readShelf(page);
}

test.describe("a mouse environment, shelf states", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("loading keeps its skeleton cards and draws no scrollbar", async ({
    page,
  }) => {
    const m = await shelf(page, "loading", 5);

    expect(m.cards).toHaveLength(5);
    for (const card of m.cards) expect(within(card, m.row)).toBe(true);
    expect(m.row.scrollWidth).toBeLessThanOrEqual(m.row.clientWidth + TOLERANCE);
    expect(await horizontalScrollers(page)).toEqual([]);
    expect(await page.locator("[data-shelf-card].animate-pulse").count()).toBe(5);
  });

  test("a failed shelf draws its retry control, not a strip", async ({ page }) => {
    await page.goto(FIXTURE);
    await buildShelf(page, {
      width: 900,
      cards: 0,
      seeAll: true,
      state: "failed",
    });

    expect(await page.locator("[data-shelf-row]").count()).toBe(0);
    expect(await page.locator("[data-retry]").count()).toBe(1);
    expect(await horizontalScrollers(page)).toEqual([]);
  });

  test("an empty shelf keeps its row and scrolls in neither direction", async ({
    page,
  }) => {
    const m = await shelf(page, "loaded", 0);

    expect(m.cards).toHaveLength(0);
    expect(m.row.scrollWidth).toBeLessThanOrEqual(m.row.clientWidth + TOLERANCE);
    expect(await horizontalScrollers(page)).toEqual([]);
  });

  test("a shelf of two cards lays them in one row", async ({ page }) => {
    const m = await shelf(page, "loaded", 2);

    expect(m.cards).toHaveLength(2);
    for (const card of m.cards) expect(within(card, m.row)).toBe(true);
    expect(new Set(m.cards.map((card) => Math.round(card.top))).size).toBe(1);
    expect(await horizontalScrollers(page)).toEqual([]);
  });

  test("a collection of two tracks fits without either scrollbar", async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    await page.evaluate(
      (spec) =>
        (
          window as unknown as {
            buildCollectionPanel: (spec: {
              width: number;
              tracks: number;
            }) => void;
          }
        ).buildCollectionPanel(spec),
      { width: 900, tracks: 2 },
    );
    const m = await page.evaluate(
      () =>
        (
          window as unknown as {
            measureCollection: (scrollTop?: number) => CollectionReading;
          }
        ).measureCollection(0),
    );

    for (const track of m.tracks) expect(within(track, m.list)).toBe(true);
    expect(m.list.scrollWidth).toBeLessThanOrEqual(m.list.clientWidth + TOLERANCE);
    expect(m.list.scrollHeight).toBeLessThanOrEqual(
      m.list.clientHeight + TOLERANCE,
    );
    expect(await horizontalScrollers(page)).toEqual([]);
  });
});
