import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function openMenu(page: Page) {
  await page.goto(`${FIXTURE}?run=${++navigation}#add-menu`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "add-menu");
  const trigger = page.getByRole("button", { name: "Add" });
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  return trigger;
}

/** Registers the cases in whichever spec imports it, under that spec's project. */
export function addMenuCases(): void {
  test("Escape closes the menu and gives focus back to Add", async ({ page }) => {
    const trigger = await openMenu(page);
    // Opening by pointer leaves focus on the trigger; moving it into the menu
    // is what makes "gives focus back" something to observe.
    await page.getByRole("menuitem").first().focus();
    await expect(trigger).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("a press outside closes the menu and does not reach the page beneath", async ({
    page,
    isMobile,
  }) => {
    await openMenu(page);
    const underneath = page.locator("#underneath");
    const box = (await underneath.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (isMobile) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(underneath).toHaveAttribute("data-clicks", "0");
  });

  test("a row runs its action once and closes the menu", async ({ page }) => {
    await openMenu(page);
    await page.getByRole("menuitem", { name: "New Folder" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("#add-host")).toHaveAttribute("data-created", "1");
  });
}
