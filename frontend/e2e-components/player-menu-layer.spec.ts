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

async function arrange(page: Page, arrangement: string) {
  await page.goto(`${FIXTURE}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);
}

async function openedMenuInBody(page: Page, name: string): Promise<boolean> {
  await page.getByRole("button", { name, exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu.evaluate((el) => el.parentElement === document.body);
}

test("only a menu that opts in leaves its toolbar on a phone", async ({ page }) => {
  await arrange(page, "menu-portal-choice");
  expect(await openedMenuInBody(page, "Plain")).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await openedMenuInBody(page, "Portalled")).toBe(true);
});

test("an opted-in menu stays in its toolbar from 640px up", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await arrange(page, "menu-portal-choice");
  expect(await openedMenuInBody(page, "Portalled")).toBe(false);
});

test("an opted-in menu is portalled at 639px", async ({ page }) => {
  await page.setViewportSize({ width: 639, height: 800 });
  await arrange(page, "menu-portal-choice");
  expect(await openedMenuInBody(page, "Portalled")).toBe(true);
});

test("crossing 640px with a menu open leaves one menu, in the right place", async ({ page }) => {
  await arrange(page, "menu-portal-choice");
  expect(await openedMenuInBody(page, "Portalled")).toBe(true);
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.getByRole("menu")).toHaveCount(1);
  expect(await page.getByRole("menu").evaluate((el) => el.parentElement === document.body)).toBe(false);
  await page.setViewportSize({ width: 393, height: 727 });
  await expect(page.getByRole("menu")).toHaveCount(1);
  expect(await page.getByRole("menu").evaluate((el) => el.parentElement === document.body)).toBe(true);
  expect(await page.locator("[data-dismiss-scrim]").count()).toBe(1);
});

test("with no resting strip the sheet keeps its 16px from the bottom", async ({ page }) => {
  await arrange(page, "menu-portal-choice");
  await openedMenuInBody(page, "Portalled");
  await page.waitForTimeout(250);
  const box = (await page.getByRole("menu").boundingBox())!;
  expect(Math.round(page.viewportSize()!.height - (box.y + box.height))).toBe(16);
});

const stripVar = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--resting-strip"),
  );

test("the strip publishes its height only while it is shown", async ({ page }) => {
  await arrange(page, "resting-strip-states");
  expect(await stripVar(page)).not.toBe("");
  await page.locator("#to-half").click();
  expect(await stripVar(page)).toBe("");
  await page.locator("#to-peek").click();
  expect(await stripVar(page)).not.toBe("");
  await page.locator("#to-gone").click();
  expect(await stripVar(page)).toBe("");
});
