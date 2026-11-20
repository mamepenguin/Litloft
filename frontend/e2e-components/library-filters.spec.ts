/**
 * SPEC-CORE-147 SPEC-ADDON-151 I8: the Library control row on a phone, measured with the
 * real apps. Below 640px it is a 2x2 grid at equal widths: the filters on row 1 (a lone
 * filter in the left half), the view menus on row 2, nothing scrolling sideways.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const WIDTH = 390;
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
    test(`SPEC-CORE-147 I8 ${app} ${locale} at ${WIDTH}px without a profile: the lone tag filter takes the left half of row 1 and the view menus share row 2`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: WIDTH, height: 800 });
      const q = new URLSearchParams({ run: String(++navigation), page: app, face: "library", locale });
      await page.goto(`${FIXTURE}?${q}#app-header`);
      await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
      const m = menus(page, locale);

      const tag = await box(m.tag);
      const group = await box(m.group);
      const sort = await box(m.sort);
      await expect(m.state).toHaveCount(0);

      expect(Math.abs(group.y - sort.y), "view menus on one row").toBeLessThanOrEqual(1);
      expect(tag.y + tag.height, "filters above the view menus").toBeLessThanOrEqual(group.y);
      expect(Math.abs(group.width - sort.width), "view menus at equal widths").toBeLessThanOrEqual(1);
      expect(Math.abs(tag.width - group.width), "the lone filter is one column wide").toBeLessThanOrEqual(1);
      expect(Math.abs(tag.x - group.x), "the lone filter is in the left column").toBeLessThanOrEqual(1);
      expect(sort.x + sort.width).toBeLessThanOrEqual(WIDTH);
      const o = await pageOverflow(page);
      expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
    });
  }
}

for (const locale of ["en", "ja"] as const) {
  for (const group of ["tags", "folder", "month", "none"] as const) {
    test(`SPEC-ADDON-151 I8 clips ${locale} at ${WIDTH}px grouped by ${group}: Tag and State on row 1, the view menus on row 2, four equal widths, 44px tall`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: WIDTH, height: 844 });
      const q = new URLSearchParams({
        run: String(++navigation),
        locale,
        q: `view=all&group=${group}&sort=newest&tag=research&trust=unverified`,
      });
      await page.goto(`${FIXTURE}?${q}#clips-page`);
      await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-page");
      const m = menus(page, locale);

      const tag = await box(m.tag);
      const state = await box(m.state);
      const groupBox = await box(m.group);
      const sort = await box(m.sort);

      expect(Math.abs(tag.y - state.y), "filters on one row").toBeLessThanOrEqual(1);
      expect(Math.abs(groupBox.y - sort.y), "view menus on one row").toBeLessThanOrEqual(1);
      expect(tag.y + tag.height, "filters above the view menus").toBeLessThanOrEqual(groupBox.y);
      expect(tag.x).toBeLessThan(state.x);
      expect(groupBox.x).toBeLessThan(sort.x);
      for (const other of [state, groupBox, sort]) {
        expect(Math.abs(tag.width - other.width), "equal widths").toBeLessThanOrEqual(1);
      }
      expect(Math.abs(tag.x - groupBox.x), "columns line up").toBeLessThanOrEqual(1);
      expect(Math.round(tag.height)).toBe(44);
      expect(Math.round(state.height)).toBe(44);
      expect(sort.x + sort.width).toBeLessThanOrEqual(WIDTH);
      const o = await pageOverflow(page);
      expect(o.scrollWidth).toBeLessThanOrEqual(o.clientWidth);
    });
  }
}
