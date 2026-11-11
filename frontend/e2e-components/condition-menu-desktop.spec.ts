/**
 * SPEC-CORE-039: the 「＋ 条件」 menu answers Escape, Tab and the arrows when
 * focus is where a pointer leaves it. jsdom moves no focus on a click, so
 * this is the real press-and-key path.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function openMenu(page: Page) {
  await page.goto(`${FIXTURE}?run=${++navigation}#condition-menu`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "condition-menu",
  );
  const trigger = page.getByRole("button", { name: "+ Filter" });
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  return trigger;
}

test("Escape closes the menu opened by pointer and leaves focus on the trigger", async ({
  page,
}) => {
  const trigger = await openMenu(page);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Tab closes the menu opened by pointer", async ({ page }) => {
  const trigger = await openMenu(page);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("arrows move through the rows after opening by pointer", async ({ page }) => {
  await openMenu(page);

  await page.keyboard.press("ArrowDown");

  await expect(page.getByRole("menuitem").first()).toBeFocused();
});

test("Escape in a value list opened by pointer returns to the first level, then closes", async ({
  page,
}) => {
  const trigger = await openMenu(page);
  await page.getByRole("menuitem", { name: "Type" }).click();
  await expect(page.getByRole("menuitem", { name: "Size" })).toHaveCount(0);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("menuitem", { name: "Size" })).toBeVisible();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});
