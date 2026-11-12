/**
 * SPEC-ADDON-100 D2: the Clips page's primary action measured in Chromium.
 * At the phone width it has to be a 44px icon-only box, which only a real
 * browser can confirm; jsdom lays nothing out.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const LABEL = "Clip a web page";

let run = 0;

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${FIXTURE}?run=${++run}#clips-page`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-page");
}

test("SPEC-ADDON-100 D2 at 390px on a coarse pointer the primary action is a 44x44 icon-only button named by its label", async ({
  page,
}) => {
  await open(page, 390);

  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    "the phone project has a coarse pointer",
  ).toBe(true);

  const button = page.getByRole("button", { name: LABEL, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName(LABEL);

  const box = (await button.boundingBox())!;
  expect(Math.abs(box.width - 44), "width").toBeLessThanOrEqual(0.5);
  expect(Math.abs(box.height - 44), "height").toBeLessThanOrEqual(0.5);

  await expect(button.getByText(LABEL), "the label is not drawn").toBeHidden();
  await expect(button.locator("svg"), "the icon is drawn").toBeVisible();
});

test("SPEC-ADDON-100 D2 at 1280px the primary action shows its label", async ({
  page,
}) => {
  await open(page, 1280);

  const button = page.getByRole("button", { name: LABEL, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName(LABEL);

  const label = button.getByText(LABEL);
  await expect(label, "the label is drawn").toBeVisible();
  expect((await label.boundingBox())!.width).toBeGreaterThan(0);

  const box = (await button.boundingBox())!;
  expect(box.width, "the button is wider than the round phone box").toBeGreaterThan(44);
});
