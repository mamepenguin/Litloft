/**
 * Whether the corner `useAnchoredDirection` picks is actually on screen,
 * with the real hook reading boxes the browser produced.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function open(page: Page, arrangement: string): Promise<void> {
  // The query is a cache-buster: the arrangement is read from
  // `location.hash` as the bundle evaluates, and moving between hashes is
  // not a navigation.
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  // Pressed only once vaul has animated the drawer into place: a decision
  // taken while the frame is moving is about a frame that is not there.
  await expect(page.locator("#trigger")).toBeVisible();
  await page.waitForTimeout(500);
  await page.locator("#trigger").click();
  await expect(page.locator("#anchored")).toBeVisible();
  // The entry animation starts scaled down, and a box read during it
  // reports a scaled number.
  await page.waitForTimeout(300);
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

async function box(page: Page, selector: string): Promise<Box> {
  const rect = await page.locator(selector).boundingBox();
  if (!rect) throw new Error(`${selector} has no box`);
  return {
    top: rect.y,
    bottom: rect.y + rect.height,
    left: rect.x,
    right: rect.x + rect.width,
  };
}

/**
 * Read off the panel's dataset rather than its class list, which is what
 * the fixture chose to spell for a given answer.
 */
async function openAt(
  page: Page,
  arrangement: string,
): Promise<{ openUp: boolean; side: string }> {
  await open(page, arrangement);
  return page.evaluate(() => {
    const el = document.getElementById("anchored")!;
    return {
      openUp: el.dataset.openUp === "true",
      side: el.dataset.side ?? "",
    };
  });
}

/**
 * - `whole` — the picked direction puts the whole box on screen.
 * - `neither` — no direction fits, the panel keeps its usual direction,
 *   and the overhang is recovered by the scroller the row is drawn in.
 */
const CELLS = [
  { state: "peek", openUp: true, fits: "whole" },
  { state: "half", openUp: false, fits: "neither" },
  { state: "full", openUp: false, fits: "whole" },
] as const;

test("the table covers three sheet states, both directions and both outcomes", () => {
  expect(CELLS).toHaveLength(3);
  expect([...new Set(CELLS.map((c) => c.state))]).toEqual([
    "peek",
    "half",
    "full",
  ]);

  expect([...new Set(CELLS.map((c) => c.openUp))].sort()).toEqual([
    false,
    true,
  ]);

  expect(CELLS.filter((c) => c.fits === "neither").map((c) => c.state)).toEqual(
    ["half"],
  );
  expect(CELLS.filter((c) => c.fits === "whole").map((c) => c.state)).toEqual([
    "peek",
    "full",
  ]);
});

for (const cell of CELLS) {
  test(`the sheet's ${cell.state} menu hangs ${
    cell.openUp ? "up" : "down"
  } and lands ${cell.fits}`, async ({ page }) => {
    const answer = await openAt(page, `measured-sheet-${cell.state}`);
    const menu = await box(page, "#anchored");
    const viewport = page.viewportSize()!;

    expect(answer.openUp).toBe(cell.openUp);

    // The sheet's scroller does not scroll sideways, so nothing recovers a
    // panel that crosses either side edge.
    expect(menu.left).toBeGreaterThanOrEqual(0);
    expect(menu.right).toBeLessThanOrEqual(viewport.width);

    if (cell.fits === "whole") {
      expect(menu.top).toBeGreaterThanOrEqual(0);
      expect(menu.bottom).toBeLessThanOrEqual(viewport.height);
    } else {
      expect(menu.top).toBeLessThan(viewport.height);
      expect(menu.bottom).toBeGreaterThan(viewport.height);
    }
  });
}

/**
 * Each arrangement puts the trigger against one edge and asks for the side
 * that runs off it, so the answer has to be the one the preference did not
 * name.
 */
test("a menu at the column's left edge hangs the other way", async ({
  page,
}) => {
  const answer = await openAt(page, "measured-inspector-left-edge");
  const pane = await box(page, "#pane");
  const menu = await box(page, "#anchored");

  expect(answer.side).toBe("left");
  expect(menu.left).toBeGreaterThanOrEqual(pane.left);
  expect(menu.right).toBeLessThanOrEqual(pane.right);
});

test("a menu at the column's right edge hangs the other way", async ({
  page,
}) => {
  const answer = await openAt(page, "measured-inspector-right-edge");
  const pane = await box(page, "#pane");
  const menu = await box(page, "#anchored");

  expect(answer.side).toBe("right");
  expect(menu.right).toBeLessThanOrEqual(pane.right);
  expect(menu.left).toBeGreaterThanOrEqual(pane.left);
});
