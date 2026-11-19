/**
 * SPEC-ADDON-138 I9 on a fine pointer: the real Clips Home and Library at
 * 1440, 1280, 1024 and 390px do not scroll sideways, and the header draws
 * "Clip a web page" after the Target (a full-width row under the tabs on a
 * phone width).
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const LABEL = "Clip a web page";
const WIDTHS = [1440, 1280, 1024, 390] as const;
const SM = 640;

const VIEWS = [
  { name: "Home", search: "nick=1", ready: "Unread" },
  { name: "Library by tag", search: "q=view%3Dall%26group%3Dtags", ready: "research" },
  { name: "Library without grouping", search: "q=view%3Dall%26group%3Dnone", ready: null },
] as const;

let run = 0;

async function open(page: Page, width: number, search: string): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${FIXTURE}?run=${++run}&${search}#clips-page`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-page");
  await expect(page.getByRole("button", { name: LABEL, exact: true })).toBeVisible();
}

for (const width of WIDTHS) {
  for (const view of VIEWS) {
    test(`SPEC-ADDON-138 I9 ${view.name} at ${width}px does not scroll sideways and the primary action sits ${width >= SM ? "after the Target" : "full width under the tabs"}`, async ({
      page,
    }) => {
      await open(page, width, view.search);
      if (view.ready !== null) {
        await expect(page.getByRole("heading", { name: view.ready, exact: true })).toBeVisible();
      }
      await expect(page.locator("#clips-page-host li a").first()).toBeVisible();
      expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);

      const scroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);

      const button = (await page.getByRole("button", { name: LABEL, exact: true }).boundingBox())!;
      const target = (await page
        .locator("header")
        .getByRole("button", { name: /^Target: / })
        .boundingBox())!;
      if (width >= SM) {
        expect(button.x, "after the Target").toBeGreaterThanOrEqual(target.x + target.width - 0.5);
        expect(button.y < target.y + target.height && target.y < button.y + button.height, "on the Target's row").toBe(
          true,
        );
      } else {
        const tabs = (await page.getByRole("link", { name: "Library", exact: true }).first().boundingBox())!;
        expect(button.y, "under the tabs").toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
        expect(button.width, "full width").toBeGreaterThanOrEqual(width - 40);
      }
    });
  }
}
