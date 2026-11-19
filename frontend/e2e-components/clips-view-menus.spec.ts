/**
 * SPEC-ADDON-147 I10 I15: the Clips Library's control row on a phone. The two
 * view menus share one row at equal widths, 分類 before 並び順, and neither
 * the row nor the page scrolls sideways; measured with the real page.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const WIDTH = 390;
const GROUPS = ["tags", "folder", "month", "none"] as const;

const TEXT = {
  ja: {
    groupLabel: "分類",
    sortLabel: "並び順",
    group: { tags: "タグ", folder: "フォルダ", month: "追加日", none: "なし" },
    sortValue: "追加日（新しい順）",
  },
  en: {
    groupLabel: "Group By",
    sortLabel: "Sort By",
    group: { tags: "Tag", folder: "Folder", month: "Date Added", none: "None" },
    sortValue: "Date Added (Newest First)",
  },
} as const;

let run = 0;

async function open(
  page: Page,
  locale: "ja" | "en",
  group: (typeof GROUPS)[number],
): Promise<void> {
  await page.setViewportSize({ width: WIDTH, height: 844 });
  const q = new URLSearchParams({
    run: String(++run),
    locale,
    q: `view=all&group=${group}&sort=newest`,
  });
  await page.goto(`${FIXTURE}?${q}#clips-page`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-page");
}

for (const locale of ["ja", "en"] as const) {
  const text = TEXT[locale];

  for (const group of GROUPS) {
    test(`SPEC-ADDON-147 I10 I15 ${locale} at ${WIDTH}px grouped by ${group}: the two view menus share one row at equal widths and nothing scrolls sideways`, async ({
      page,
    }) => {
      await open(page, locale, group);

      const groupMenu = page.getByRole("button", {
        name: `${text.groupLabel}: ${text.group[group]}`,
      });
      const sortMenu = page.getByRole("button", {
        name: `${text.sortLabel}: ${text.sortValue}`,
      });
      await expect(groupMenu).toBeVisible();
      await expect(sortMenu).toBeVisible();
      await expect(page.locator("#clips-page-host li a").first()).toBeVisible();

      const g = (await groupMenu.boundingBox())!;
      const s = (await sortMenu.boundingBox())!;
      expect(Math.abs(g.y - s.y), "one row").toBeLessThanOrEqual(1);
      expect(Math.abs(g.width - s.width), "equal widths").toBeLessThanOrEqual(1);
      expect(g.x, "分類 before 並び順").toBeLessThan(s.x);
      expect(s.x + s.width, "within the phone width").toBeLessThanOrEqual(WIDTH);

      const sortHandle = await sortMenu.elementHandle();
      const row = await groupMenu.evaluate((el, other) => {
        let common: HTMLElement = el.parentElement!;
        while (!common.contains(other as Node)) common = common.parentElement!;
        return { scrollWidth: common.scrollWidth, clientWidth: common.clientWidth };
      }, sortHandle);
      expect(row.scrollWidth, "the control row does not scroll sideways").toBeLessThanOrEqual(
        row.clientWidth,
      );

      const pageBox = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(pageBox.scrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(
        pageBox.clientWidth,
      );
    });
  }
}
