/**
 * SPEC-ADDON-148 I10 I12: the Notes Library on a phone. The sort menu is an
 * ArrowDownUp icon and its value, and the rail menu and that sort menu share
 * the row above the list without scrolling sideways; measured with the real
 * Library.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ROOT = '[data-testid="notes-library"]';
const WIDTH = 390;

const TEXT = {
  ja: {
    railMenu: /^フォルダ: すべて$/,
    sortMenu: /^並び順: 変更日$/,
    sortLabel: "並び順",
    sortValue: "変更日",
  },
  en: {
    railMenu: /^Folders: All$/,
    sortMenu: /^Sort By: Date Modified$/,
    sortLabel: "Sort By",
    sortValue: "Date Modified",
  },
} as const;

let run = 0;

async function open(page: Page, locale: "ja" | "en"): Promise<void> {
  await page.setViewportSize({ width: WIDTH, height: 844 });
  await page.goto(`${FIXTURE}?run=${++run}&locale=${locale}#notes-library`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "notes-library");
  await expect(page.locator(ROOT)).toHaveAttribute("data-layout", "list");
  await expect(page.getByText("ノート 1", { exact: true }).first()).toBeVisible();
}

for (const locale of ["ja", "en"] as const) {
  const text = TEXT[locale];

  test(`SPEC-ADDON-148 I10 I12 ${locale} at ${WIDTH}px: the rail menu and the ArrowDownUp sort menu share the row above the list and nothing scrolls sideways`, async ({
    page,
  }) => {
    await open(page, locale);

    const rail = page.getByRole("button", { name: text.railMenu });
    const sort = page.getByRole("button", { name: text.sortMenu });
    await expect(rail).toBeVisible();
    await expect(sort).toBeVisible();
    await expect(sort.locator("svg.lucide-arrow-down-up")).toHaveCount(1);
    const visible = (await sort.innerText()).trim();
    expect(visible, "the value alone, with no label").toBe(text.sortValue);
    expect(visible).not.toContain(text.sortLabel);

    const row = await page
      .locator(`${ROOT} > div`)
      .first()
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(row.scrollWidth, "the row does not scroll sideways").toBeLessThanOrEqual(row.clientWidth);

    const pageBox = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(pageBox.scrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(
      pageBox.clientWidth,
    );
  });
}
