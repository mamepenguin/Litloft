/**
 * SPEC-CORE-147 SPEC-ADDON-151 I8: the Library control row at desktop widths, measured
 * with the real apps: one row, the filter group, a 20px gap, then the view group, and
 * nothing scrolling sideways.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const WIDTHS = [1024, 1280, 1440] as const;
let navigation = 0;

const LABELS = {
  en: { tag: /^Tag/, state: /^State/, group: /^Group By/, sort: /^Sort By/ },
  ja: { tag: /^タグ/, state: /^状態/, group: /^分類/, sort: /^並び順/ },
} as const;

type Locale = keyof typeof LABELS;

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

function menus(page: Page, locale: Locale) {
  const l = LABELS[locale];
  return {
    tag: page.getByRole("button", { name: l.tag }),
    state: page.getByRole("button", { name: l.state }),
    group: page.getByRole("button", { name: l.group }),
    sort: page.getByRole("button", { name: l.sort }),
  };
}

for (const app of ["video", "reading"] as const) {
  for (const locale of ["en", "ja"] as const) {
    for (const width of WIDTHS) {
      test(`SPEC-CORE-147 I8 ${app} ${locale} at ${width}px: Tag, a 20px gap, then Group By and Sort By on one row`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        const q = new URLSearchParams({ run: String(++navigation), page: app, face: "library", locale });
        await page.goto(`${FIXTURE}?${q}#app-header`);
        await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
        const m = menus(page, locale);

        const tag = await box(m.tag);
        const group = await box(m.group);
        const sort = await box(m.sort);

        expect(Math.abs(tag.y - group.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(group.y - sort.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(group.x - (tag.x + tag.width) - 20), "20px between the groups").toBeLessThanOrEqual(1);
        expect(group.x + group.width).toBeLessThanOrEqual(sort.x);
        const o = await pageOverflow(page);
        expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
      });
    }
  }
}
