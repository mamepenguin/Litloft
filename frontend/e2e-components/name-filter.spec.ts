/**
 * SPEC-CORE-156 SPEC-ADDON-159 I8 I11 I12: the name field at 390px on a coarse pointer,
 * measured with the real apps. The tab-row field fills what the tabs leave, the tabs keep
 * their width, the 2x2 control grid is unchanged, and a See all page puts the field on a
 * full-width row of its own under the title, with the sort below it.
 */

import { test, expect } from "@playwright/test";

import {
  LABELS,
  NAME_40,
  appTabs,
  box,
  clipsTabs,
  fieldBox,
  gapAboveTabRule,
  fieldIcon,
  fieldInput,
  noSidewaysScroll,
  openApp,
  openClips,
  openSeeAll,
  widths,
} from "./name-filter.measure";

const WIDTH = 390;

for (const app of ["video", "reading"] as const) {
  for (const locale of ["en", "ja"] as const) {
    test(`SPEC-CORE-156 I11 ${app} ${locale} at ${WIDTH}px: the icon is at least 44x44 and sits at the end of the tab row`, async ({ page }) => {
      await page.setViewportSize({ width: WIDTH, height: 800 });
      await openApp(page, app, locale);

      const icon = await box(fieldIcon(page, locale));
      const library = await box(appTabs(page, locale)[1]);
      expect(icon.width).toBeGreaterThanOrEqual(44);
      expect(icon.height).toBeGreaterThanOrEqual(44);
      expect(icon.x).toBeGreaterThanOrEqual(library.x + library.width);
      expect(icon.x + icon.width).toBeLessThanOrEqual(WIDTH);
      expect(Math.abs(icon.y + icon.height / 2 - (library.y + library.height / 2)), "on the tab row").toBeLessThanOrEqual(2);
      await noSidewaysScroll(page);
    });

    test(`SPEC-CORE-156 I8 ${app} ${locale} at ${WIDTH}px: open with a 40-character name, the field fills the row after the tabs and the 2x2 grid stays`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: WIDTH, height: 800 });
      await openApp(page, app, locale);
      const tabs = appTabs(page, locale);
      const before = await widths(tabs);
      const l = LABELS[locale];

      expect(NAME_40).toHaveLength(40);
      await fieldIcon(page, locale).click();
      await fieldInput(page, locale).fill(NAME_40);

      const field = await fieldBox(page, locale);
      const library = await box(tabs[1]);
      expect(await widths(tabs), "the tabs keep their width").toEqual(before);
      expect(field.x).toBeGreaterThanOrEqual(library.x + library.width);
      expect(field.x + field.width).toBeLessThanOrEqual(WIDTH);
      expect(Math.round(field.height), "44px tall on a coarse pointer").toBe(44);
      expect(await gapAboveTabRule(tabs[1], field), "the field clears the rule under the tabs").toBeGreaterThanOrEqual(4);
      expect(await fieldInput(page, locale).evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");

      const tag = await box(page.getByRole("button", { name: l.tag }));
      const group = await box(page.getByRole("button", { name: l.group }));
      const sort = await box(page.getByRole("button", { name: l.sort }));
      expect(Math.abs(group.y - sort.y), "view menus on one row").toBeLessThanOrEqual(1);
      expect(tag.y + tag.height, "filters above the view menus").toBeLessThanOrEqual(group.y);
      expect(Math.abs(group.width - sort.width), "view menus at equal widths").toBeLessThanOrEqual(1);
      expect(Math.abs(tag.x - group.x), "columns line up").toBeLessThanOrEqual(1);
      await noSidewaysScroll(page);
    });

    test(`SPEC-CORE-156 I8 I12 ${app} ${locale} See all at ${WIDTH}px: the field is a full-width row under the title, the sort below it at the start`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: WIDTH, height: 800 });
      await openSeeAll(page, app, locale);

      await expect(fieldIcon(page, locale)).toHaveCount(0);
      await fieldInput(page, locale).fill(NAME_40);

      const field = await fieldBox(page, locale);
      const sort = await box(page.getByRole("button", { name: LABELS[locale].sort }).first());
      const heading = await box(page.getByRole("heading").first());
      // The header's own row for its actions: the field's ancestor that is a cell of the header grid.
      const row = await fieldInput(page, locale).evaluate((el) => {
        let cell = el as HTMLElement;
        while (cell.parentElement && getComputedStyle(cell.parentElement).display !== "grid") cell = cell.parentElement;
        const r = cell.getBoundingClientRect();
        const s = getComputedStyle(cell);
        return { x: r.x + parseFloat(s.paddingLeft), width: r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) };
      });
      expect(field.y).toBeGreaterThanOrEqual(heading.y + heading.height);
      expect(Math.abs(field.x - row.x), "the field starts at the row's start").toBeLessThanOrEqual(1);
      expect(
        Math.abs(WIDTH - (field.x + field.width) - field.x),
        "the field fills the row and keeps the page's gutter on both sides",
      ).toBeLessThanOrEqual(1);
      expect(Math.round(field.height), "44px tall on a coarse pointer").toBe(44);
      expect(sort.y, "the sort is on the line below").toBeGreaterThanOrEqual(field.y + field.height);
      expect(Math.abs(sort.x - field.x), "the sort starts where the field starts").toBeLessThanOrEqual(1);
      await noSidewaysScroll(page);
    });
  }
}

for (const locale of ["en", "ja"] as const) {
  test(`SPEC-ADDON-159 I8 clips ${locale} at ${WIDTH}px: a 40-character name fills the tab row after the tabs, the tabs keep their width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: WIDTH, height: 844 });
    await openClips(page, locale, "view=all&group=tags&sort=newest");
    const before = await widths(clipsTabs(page, locale));
    const icon = await box(fieldIcon(page, locale));
    expect(icon.width).toBeGreaterThanOrEqual(44);
    expect(icon.height).toBeGreaterThanOrEqual(44);

    await openClips(page, locale, `view=all&group=tags&sort=newest&q=${encodeURIComponent(NAME_40)}`);

    const tabs = clipsTabs(page, locale);
    const field = await fieldBox(page, locale);
    const library = await box(tabs[1]);
    await expect(fieldInput(page, locale)).toHaveValue(NAME_40);
    expect(await widths(tabs), "the tabs keep their width").toEqual(before);
    expect(field.x).toBeGreaterThanOrEqual(library.x + library.width);
    expect(field.x + field.width).toBeLessThanOrEqual(WIDTH);
    await noSidewaysScroll(page);
  });
}
