/**
 * A toolbar menu opened from inside the file page's player box, which is a
 * sticky stacking context at phone width.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

async function openMenu(page: Page, arrangement: string, trigger: RegExp) {
  await page.goto(`${FIXTURE}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);
  await page.locator("#player").getByRole("button", { name: trigger }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function ownsPoint(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.closest('[role="menu"]') != null,
    [x, y],
  );
}

for (const trigger of [/^More actions$/, /^View:/]) {
  test(`the ${trigger.source} menu sits above the resting strip`, async ({ page }) => {
    const menu = await openMenu(page, "player-menu-peek", trigger);
    const box = (await menu.boundingBox())!;
    const strip = (await page.getByTestId("mobile-inspector-peek").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(strip.y);
    expect(await ownsPoint(page, box.x + box.width / 2, box.y + box.height - 4)).toBe(true);
  });

  test(`the ${trigger.source} menu is drawn over a half-raised sheet`, async ({ page }) => {
    const menu = await openMenu(page, "player-menu-half", trigger);
    const box = (await menu.boundingBox())!;
    const sheet = (await page.getByTestId("mobile-inspector-sheet").boundingBox())!;
    const y = Math.max(box.y, sheet.y) + 8;
    expect(y).toBeLessThan(box.y + box.height);
    expect(await ownsPoint(page, box.x + box.width / 2, y)).toBe(true);
  });
}
