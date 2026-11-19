/**
 * SPEC-ADDON-148 I10 I12: the Notes Library's 分類 menu at the top of the rail
 * and its label-less 並び順 menu, measured with the real Library at desktop
 * widths; jsdom lays nothing out.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ROOT = '[data-testid="notes-library"]';
const WIDTHS = [1440, 1280, 1024] as const;

const TEXT = {
  ja: {
    railMenu: /^分類: フォルダ$/,
    folderOption: "フォルダ",
    sortMenu: /^並び順: 変更日$/,
    sortLabel: "並び順",
    sortValue: "変更日",
  },
  en: {
    railMenu: /^Group By: Folders$/,
    folderOption: "Folders",
    sortMenu: /^Sort By: Date Modified$/,
    sortLabel: "Sort By",
    sortValue: "Date Modified",
  },
} as const;

let run = 0;

async function open(page: Page, width: number, locale: "ja" | "en"): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${FIXTURE}?run=${++run}&locale=${locale}#notes-library`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "notes-library");
  await expect(page.locator(ROOT)).toHaveAttribute("data-layout", width >= 1280 ? "three" : "menu");
  await expect(page.getByText("ノート 1", { exact: true }).first()).toBeVisible();
}

function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** The widest box holding both the sort menu and the list's search field. */
function sortRowOverflow(sort: Locator) {
  return sort.evaluate((el) => {
    const search = document.querySelector('form[role="search"]');
    let row: HTMLElement = el.parentElement!;
    while (search !== null && !row.contains(search)) row = row.parentElement!;
    return { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth };
  });
}

for (const locale of ["ja", "en"] as const) {
  const text = TEXT[locale];

  for (const width of WIDTHS) {
    test(`SPEC-ADDON-148 I10 I12 ${locale} at ${width}px: the sort menu is an ArrowDownUp icon and its value, and nothing scrolls sideways`, async ({
      page,
    }) => {
      await open(page, width, locale);

      const sort = page.getByRole("button", { name: text.sortMenu });
      await expect(sort).toBeVisible();
      await expect(sort.locator("svg.lucide-arrow-down-up")).toHaveCount(1);
      const visible = (await sort.innerText()).trim();
      expect(visible, "the value alone, with no label").toBe(text.sortValue);
      expect(visible).not.toContain(text.sortLabel);

      const pageBox = await pageOverflow(page);
      expect(pageBox.scrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(
        pageBox.clientWidth,
      );
      const row = await sortRowOverflow(sort);
      expect(row.scrollWidth, "the sort's row does not scroll sideways").toBeLessThanOrEqual(
        row.clientWidth,
      );

      if (width >= 1280) {
        const rail = page.locator(`${ROOT} > aside`);
        const menu = rail.getByRole("button", { name: text.railMenu });
        await expect(menu, "the rail's first control is the 分類 menu").toBeVisible();
        await expect(menu.locator("svg.lucide-layout-list")).toHaveCount(1);
        await expect(
          rail.getByRole("button", { name: text.folderOption, exact: true }),
          "the two-button switch is gone",
        ).toHaveCount(0);

        const entries = rail.locator("nav > ul > li");
        await expect(entries.first()).toBeVisible();
        expect(await entries.count(), "the entries follow the menu").toBeGreaterThanOrEqual(2);
        const box = (await menu.boundingBox())!;
        const first = (await entries.first().boundingBox())!;
        expect(first.y, "the entries are below the menu").toBeGreaterThanOrEqual(
          box.y + box.height - 0.5,
        );
        const railRow = await menu.evaluate((el) => {
          const row = el.parentElement!;
          return { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth };
        });
        expect(railRow.scrollWidth, "the rail does not scroll sideways").toBeLessThanOrEqual(
          railRow.clientWidth,
        );
      }
    });
  }
}
