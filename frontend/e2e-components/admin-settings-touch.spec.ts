/**
 * The settings rows put Edit beside Delete. On a coarse pointer (this
 * project runs at Pixel 5) every button there reaches the 44px touch target
 * DESIGN.md §Buttons asks of every button.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const TOUCH_TARGET = 44;

async function buttonHeights(page: Page, scope: string): Promise<{ name: string; height: number }[]> {
  return page.evaluate((selector) => {
    return Array.from(document.querySelectorAll<HTMLButtonElement>(`${selector} button`)).map((b) => ({
      name: b.textContent?.trim() || b.getAttribute("aria-label") || "",
      height: b.getBoundingClientRect().height,
    }));
  }, scope);
}

function expectReachable(buttons: { name: string; height: number }[]): void {
  expect(buttons.length).toBeGreaterThan(0);
  const short = buttons.filter((b) => b.height < TOUCH_TARGET);
  expect(short).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto(`${FIXTURE}#admin-settings-rows`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "admin-settings-rows");
  await expect(page.getByText("Household Archive")).toBeVisible();
  await expect(page.getByText("family").first()).toBeVisible();
});

test("every button on the drive and password rows reaches the touch target", async ({ page }) => {
  expectReachable(await buttonHeights(page, "body"));
});
