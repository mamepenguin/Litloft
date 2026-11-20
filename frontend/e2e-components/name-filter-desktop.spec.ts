/**
 * SPEC-CORE-156 SPEC-ADDON-159 I8 I12: the name field at desktop widths on a fine pointer,
 * measured with the real apps. The icon is 36x36; open, the field is 260px wide and 36px
 * tall at the end of the tab row; on a See all page it is 260px, before the sort, on one
 * row; nothing scrolls sideways with a 40-character name.
 */

import { test, expect } from "@playwright/test";

import {
  LABELS,
  NAME_40,
  appTabs,
  box,
  clipsTabs,
  fieldBox,
  fieldIcon,
  fieldInput,
  noSidewaysScroll,
  openApp,
  openClips,
  openSeeAll,
  widths,
} from "./name-filter.measure";

const WIDTHS = [1024, 1280, 1440] as const;

for (const app of ["video", "reading"] as const) {
  for (const locale of ["en", "ja"] as const) {
    for (const width of WIDTHS) {
      test(`SPEC-CORE-156 I8 ${app} ${locale} at ${width}px: a 36px icon opens into a 260px field at the end of the tab row`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await openApp(page, app, locale);
        const tabs = appTabs(page, locale);
        const before = await widths(tabs);

        const icon = await box(fieldIcon(page, locale));
        expect(Math.round(icon.width)).toBe(36);
        expect(Math.round(icon.height)).toBe(36);

        await fieldIcon(page, locale).click();
        await fieldInput(page, locale).fill(NAME_40);

        const field = await fieldBox(page, locale);
        const library = await box(tabs[1]);
        expect(Math.round(field.width), "a 260px field").toBe(260);
        expect(Math.round(field.height), "36px tall on a fine pointer").toBe(36);
        expect(field.x).toBeGreaterThanOrEqual(library.x + library.width);
        expect(Math.abs(field.y + field.height / 2 - (library.y + library.height / 2)), "on the tab row").toBeLessThanOrEqual(2);
        expect(await widths(tabs), "the tabs keep their width").toEqual(before);
        expect(await fieldInput(page, locale).evaluate((el) => getComputedStyle(el).fontSize)).toBe("14px");
        await noSidewaysScroll(page);
      });

      test(`SPEC-CORE-156 I8 I12 ${app} ${locale} See all at ${width}px: the field comes before the sort on one row`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await openSeeAll(page, app, locale);

        await expect(fieldIcon(page, locale)).toHaveCount(0);
        await fieldInput(page, locale).focus();
        const empty = await fieldBox(page, locale);
        await fieldInput(page, locale).fill(NAME_40);

        const field = await fieldBox(page, locale);
        const sort = await box(page.getByRole("button", { name: LABELS[locale].sort }).first());
        expect(Math.round(field.width), "a 260px field").toBe(260);
        expect(field.borderColor, "the border darkens while the field holds text").not.toBe(empty.borderColor);
        expect(field.x + field.width).toBeLessThanOrEqual(sort.x);
        expect(Math.abs(field.y + field.height / 2 - (sort.y + sort.height / 2)), "one row").toBeLessThanOrEqual(2);
        await noSidewaysScroll(page);
      });
    }
  }
}

for (const app of ["video", "reading"] as const) {
  for (const locale of ["en", "ja"] as const) {
    for (const width of [640, 768] as const) {
      test(`SPEC-CORE-156 I8 ${app} ${locale} See all at ${width}px: the sort keeps its whole value inside its box, short of the Target`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await openSeeAll(page, app, locale);
        await fieldInput(page, locale).fill(NAME_40);

        const sortButton = page.getByRole("button", { name: LABELS[locale].sort }).first();
        const overflow = await sortButton.evaluate((el) => el.scrollWidth - el.clientWidth);
        const sort = await box(sortButton);
        const target = await box(page.locator("header").getByRole("button", { name: /^(Target|対象): / }));
        expect(overflow, "the value does not spill out of the sort button").toBeLessThanOrEqual(0);
        expect(sort.x + sort.width, "the sort ends before the Target").toBeLessThanOrEqual(target.x);
        await noSidewaysScroll(page);
      });
    }
  }
}

for (const locale of ["en", "ja"] as const) {
  for (const width of WIDTHS) {
    test(`SPEC-ADDON-159 I8 clips ${locale} at ${width}px: a 40-character name in the tab row, the tabs keep their width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openClips(page, locale, "view=all&group=tags&sort=newest");
      const before = await widths(clipsTabs(page, locale));
      const icon = await box(fieldIcon(page, locale));
      expect(Math.round(icon.width)).toBe(36);
      expect(Math.round(icon.height)).toBe(36);

      await openClips(page, locale, `view=all&group=tags&sort=newest&q=${encodeURIComponent(NAME_40)}`);

      const tabs = clipsTabs(page, locale);
      const field = await fieldBox(page, locale);
      const library = await box(tabs[1]);
      await expect(fieldInput(page, locale)).toHaveValue(NAME_40);
      expect(await widths(tabs), "the tabs keep their width").toEqual(before);
      expect(Math.round(field.width), "a 260px field").toBe(260);
      expect(field.x).toBeGreaterThanOrEqual(library.x + library.width);
      await noSidewaysScroll(page);
    });
  }
}
