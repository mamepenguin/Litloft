/**
 * The menu button and the tree toggle side by side, measured with the real
 * row at the root font sizes a reader can pick.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const ROOT_FONT_SIZES = ["16px", "20px", "24px"] as const;

let navigation = 0;

for (const fontSize of ROOT_FONT_SIZES) {
  test(`at a ${fontSize} root: the tree toggle sits right of the menu button, on its line`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${FIXTURE}?run=${++navigation}#chrome-buttons`);
    await expect(page.locator("body")).toHaveAttribute("data-arrangement", "chrome-buttons");
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, fontSize);

    const menu = page.getByRole("button", { name: "Menu" });
    const toggle = page.getByRole("button", { name: /tree/i });
    await expect(menu).toBeVisible();
    await expect(toggle).toBeVisible();

    const [m, t] = await Promise.all([menu.boundingBox(), toggle.boundingBox()]);
    expect(m).not.toBeNull();
    expect(t).not.toBeNull();
    // `gap-2` is 0.5rem, so it grows with the root as the buttons do.
    expect(t!.x).toBe(m!.x + m!.width + parseFloat(fontSize) / 2);
    expect(t!.y).toBe(m!.y);
    expect(t!.height).toBe(m!.height);
  });
}
