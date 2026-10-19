import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

/**
 * `locator.click()` sends a mouse press even in a touch project, so a touch
 * device is pressed with the touchscreen.
 */
async function press(page: Page, target: Locator, isMobile: boolean) {
  if (!isMobile) {
    await target.click();
    return;
  }
  const box = (await target.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function openMenu(page: Page, isMobile: boolean) {
  await page.goto(`${FIXTURE}?run=${++navigation}#add-menu`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "add-menu");
  const trigger = page.getByRole("button", { name: "Add" });
  await press(page, trigger, isMobile);
  await expect(page.getByRole("menu")).toBeVisible();
  return trigger;
}

/** Registers the cases in whichever spec imports it, under that spec's project. */
export function addMenuCases(): void {
  test("Escape closes the menu and gives focus back to Add", async ({ page, isMobile }) => {
    const trigger = await openMenu(page, isMobile);
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
    await openMenu(page, isMobile);
    const underneath = page.locator("#underneath");
    await press(page, underneath, isMobile);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(underneath).toHaveAttribute("data-clicks", "0");
  });

  test("pressing Add again closes the menu", async ({ page, isMobile }) => {
    const trigger = await openMenu(page, isMobile);
    await press(page, trigger, isMobile);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("a row runs its action once and closes the menu", async ({ page, isMobile }) => {
    await page.clock.install();
    await openMenu(page, isMobile);
    await press(page, page.getByRole("menuitem", { name: "New Folder" }), isMobile);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("#add-host")).toHaveAttribute("data-created", "1");
    // Runs every timer the press left behind, so a second call cannot arrive later.
    await page.clock.runFor(5_000);
    await expect(page.locator("#add-host")).toHaveAttribute("data-created", "1");
  });
}
