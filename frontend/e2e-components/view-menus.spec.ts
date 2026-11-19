/**
 * SPEC-CORE-146: the Video and Reading Library's 分類 and 並び順 menus on a phone, measured
 * with the real apps: one row at equal widths, nothing scrolling sideways.
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
    test(`SPEC-CORE-146 I15 I10 ${app} ${locale} at 390px: the two view menus share one row at equal widths and nothing scrolls sideways`, async ({
      page,
    }) => {
      const { group, sort } = await openLibrary(page, app, 390, locale);
      const g = (await group.boundingBox())!;
      const s = (await sort.boundingBox())!;

      expect(Math.abs(g.y - s.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.width - s.width)).toBeLessThanOrEqual(1);
      expect(g.x).toBeLessThan(s.x);
      expect(s.x + s.width).toBeLessThanOrEqual(390);
      const o = await pageOverflow(page);
      expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
    });
  }
}

for (const app of APPS) {
  test(`SPEC-CORE-146 I12 ${app} ja at 390px: a view menu whose value is cut keeps its icon at 16px`, async ({ page }) => {
    const { group, sort } = await openLibrary(page, app, 390, "ja");
    for (const menu of [group, sort]) {
      const icon = (await menu.locator("svg").first().boundingBox())!;
      expect(icon.width).toBeCloseTo(16, 0);
      expect(icon.height).toBeCloseTo(16, 0);
    }
  });
}
