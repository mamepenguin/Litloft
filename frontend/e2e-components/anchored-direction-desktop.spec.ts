/**
 * The one frame in the tree whose right edge is not the window's.
 *
 * `TwoPaneLayout`'s tree column is full width below `md` and 280px above
 * it, so it only exists as a bounded column at a desktop width. The frame
 * the arithmetic uses is the clipping box intersected with the visible
 * band; only a column bounded on the left separates the two right edges.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { DESKTOP_VIEWPORT } from "./projects";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function openAt(
  page: Page,
  arrangement: string,
): Promise<{ openUp: boolean; side: string }> {
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  await expect(page.locator("#trigger")).toBeVisible();
  await page.locator("#trigger").click();
  await expect(page.locator("#anchored")).toBeVisible();
  // The entry animation starts scaled down, and a box read during it
  // reports a scaled number.
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const el = document.getElementById("anchored")!;
    return {
      openUp: el.dataset.openUp === "true",
      side: el.dataset.side ?? "",
    };
  });
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

test("the run's context is the desktop one, and above md", async ({ page }) => {
  await page.goto(FIXTURE);
  expect(page.viewportSize()).toEqual({ ...DESKTOP_VIEWPORT });
  const measured = await page.evaluate(() => ({
    aboveMd: window.matchMedia("(min-width: 768px)").matches,
    innerWidth: window.innerWidth,
  }));
  expect(measured.aboveMd).toBe(true);
  expect(measured.innerWidth).toBe(DESKTOP_VIEWPORT.width);
});

test("a menu in a column bounded on the left takes the column's right edge, not the window's", async ({
  page,
}) => {
  const answer = await openAt(page, "measured-tree-pane");
  const pane = await box(page, "#tree-pane");
  const menu = await box(page, "#anchored");
  const viewport = page.viewportSize()!;

  // A column flush with the window would pass while measuring nothing.
  expect(pane.right).toBeLessThan(viewport.width);

  expect(answer.side).toBe("right");

  expect(menu.left).toBeGreaterThanOrEqual(pane.left);
  expect(menu.right).toBeLessThanOrEqual(pane.right);
});

test("the folder picker near the foot of a dialog opens upward", async ({
  page,
}) => {
  const answer = await openAt(page, "measured-picker-in-dialog");
  const menu = await box(page, "#anchored");
  const trigger = await box(page, "#trigger");
  const viewport = page.viewportSize()!;

  expect(viewport.height - trigger.bottom).toBeLessThan(menu.bottom - menu.top);

  expect(answer.openUp).toBe(true);
  expect(menu.top).toBeGreaterThanOrEqual(0);
  expect(menu.bottom).toBeLessThanOrEqual(viewport.height);
});
