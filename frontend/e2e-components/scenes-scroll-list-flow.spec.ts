/**
 * SPEC-ADDON-152 in Chromium with a coarse pointer: the flow form with no
 * Visual Index card or placeholder, so the visible area reaches the scroller's
 * bottom.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  BOUNDED_STEP,
  TILE,
  settled,
  type ListReading,
} from "./scenes-scroll-list.cases";

const FIXTURE = pathToFileURL(PAGE).href;
const FLOW_NO_CARD = "#scenes-flow-no-visual";
const SHARED = '[data-testid="scenes-flow-scroller"]';
/** The flow fixture's file has the long frame list. */
const FLOW_FRAMES = 500;

let navigation = 0;

async function openFlowWithoutCard(page: Page): Promise<ListReading> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${FIXTURE}?run=${++navigation}${FLOW_NO_CARD}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "scenes-flow-no-visual",
  );
  await expect(page.getByRole("slider", { name: "Frame timeline" })).toBeVisible();
  await expect(page.locator(TILE).first()).toBeVisible();
  await expect(
    page.locator('[data-testid="scenes-visual-placeholder"]'),
  ).toHaveCount(0);
  return settled(page, BOUNDED_STEP);
}

test("SPEC-ADDON-152 I11 — in flow form with no card the bottom row reaches the scroller's bottom and no box covers it", async ({
  page,
}) => {
  const opened = await openFlowWithoutCard(page);
  expect(opened.form).toBe("flow");
  expect(opened.tiles).toBe(FLOW_FRAMES);
  expect(opened.card, "no scene card is drawn").toBeNull();
  expect(
    page.getByRole("button", { name: /harbour|Two people/ }),
    "no scene card is drawn",
  ).toHaveCount(0);

  await page.locator(SHARED).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const end = await settled(page, BOUNDED_STEP);
  expect(end.visibleRows[end.visibleRows.length - 1]).toBe(
    end.rowFirstFrame.length - 1,
  );

  const geometry = await page.evaluate(
    ([scrollerSelector, tileSelector]) => {
      const scroller = document.querySelector<HTMLElement>(scrollerSelector)!;
      const tiles = Array.from(
        document.querySelectorAll<HTMLElement>(tileSelector),
      );
      const last = tiles[tiles.length - 1];
      const box = scroller.getBoundingClientRect();
      const bottom = box.top + scroller.clientTop + scroller.clientHeight;
      const tile = last.getBoundingClientRect();
      const probe = document.elementFromPoint(
        tile.left + tile.width / 2,
        bottom - 6,
      );
      return {
        bottom,
        lastTileBottom: tile.bottom,
        hitTile: probe?.closest("button[data-scene-tile]") != null,
        hitTag: probe?.tagName ?? null,
      };
    },
    [SHARED, TILE] as const,
  );

  expect(
    geometry.lastTileBottom,
    "the last row reaches the scroller's bottom",
  ).toBeGreaterThanOrEqual(geometry.bottom - 5);
  expect(
    geometry.hitTile,
    `a point above the scroller's bottom is a tile, not ${geometry.hitTag}`,
  ).toBe(true);
});
