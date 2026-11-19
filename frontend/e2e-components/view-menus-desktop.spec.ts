/**
 * SPEC-CORE-146: the Video and Reading Library's 分類 and 並び順 menus at desktop widths,
 * measured with the real apps: grouping first, one row, nothing scrolling sideways.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const APPS = ["video", "reading"] as const;
let navigation = 0;

const LABELS = {
  en: { group: /^Group By/, sort: /^Sort By/ },
  ja: { group: /^分類/, sort: /^並び順/ },
} as const;

async function openLibrary(page: Page, app: (typeof APPS)[number], width: number, locale: "en" | "ja") {
  await page.setViewportSize({ width, height: 800 });
  const q = new URLSearchParams({ run: String(++navigation), page: app, face: "library" });
  if (locale === "ja") q.set("locale", "ja");
  await page.goto(`${FIXTURE}?${q}#app-header`);
  await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
  const group = page.getByRole("button", { name: LABELS[locale].group });
  const sort = page.getByRole("button", { name: LABELS[locale].sort });
  await expect(group).toBeVisible();
  await expect(sort).toBeVisible();
  return { group, sort };
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

for (const app of APPS) {
  for (const locale of ["en", "ja"] as const) {
    for (const width of [1024, 1280, 1440]) {
      test(`SPEC-CORE-146 I10 I12 ${app} ${locale} at ${width}px: Group By precedes Sort By on one row and nothing scrolls sideways`, async ({
        page,
      }) => {
        const { group, sort } = await openLibrary(page, app, width, locale);
        const g = (await group.boundingBox())!;
        const s = (await sort.boundingBox())!;

        expect(Math.abs(g.y - s.y)).toBeLessThanOrEqual(1);
        expect(g.x + g.width).toBeLessThanOrEqual(s.x);
        const sortHandle = await sort.elementHandle();
        const row = await group.evaluate((el, other) => {
          let common: HTMLElement = el.parentElement!;
          while (!common.contains(other as Node)) common = common.parentElement!;
          return { scrollWidth: common.scrollWidth, clientWidth: common.clientWidth };
        }, sortHandle);
        expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
        const o = await pageOverflow(page);
        expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
      });
    }
  }
}
