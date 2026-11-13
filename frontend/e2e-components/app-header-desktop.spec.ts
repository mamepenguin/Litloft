/**
 * SPEC-CORE-099: the app header of the Video and Reading pages and their shelf pages at
 * 640px and wider, measured with the real pages on a pointer that can hover.
 */

import { test, expect } from "@playwright/test";

import {
  APP_PAGES,
  DEFAULT_TARGET_NAME,
  SHELF_PAGES,
  TRANSPARENT,
  colourOf,
  lookOf,
  openAppHeader,
  sameRow,
  snapshot,
  sortButton,
  targetButton,
} from "./app-header.measure";

const DRIVE = "fixture";
const SORT_CHOICE = "Added (newest first)";

for (const app of APP_PAGES) {
  for (const width of [640, 1280]) {
    test(`SPEC-CORE-099 I11 I12 I14 ${app} at ${width}px: the quiet Target is at the title row's right end, the tabs under the header`, async ({
      page,
    }) => {
      await openAppHeader(page, width, { app });
      const name = DEFAULT_TARGET_NAME[app];
      const m = await snapshot(page, { drive: DRIVE, targetName: name });
      const muted = await colourOf(page, "muted");
      const elevated = await colourOf(page, "elevated");

      expect(sameRow(m.target, m.h1)).toBe(true);
      expect(Math.abs(m.target.right - m.contentRight)).toBeLessThanOrEqual(1);
      if (m.tabs) {
        expect(m.tabs.top).toBeGreaterThanOrEqual(Math.max(m.h1.bottom, m.count.bottom, m.target.bottom) - 1);
      }
      expect(m.scrollWidth).toBeLessThanOrEqual(width);

      const rest = await lookOf(targetButton(page), name);
      expect(m.targetText).not.toMatch(/Target/);
      expect(rest.background).toBe(TRANSPARENT);
      expect(rest.borderWidths).toEqual(["0px", "0px", "0px", "0px"]);
      expect(rest.textColour).toBe(muted);
      expect(rest.fontSize).toBe("14px");

      await targetButton(page).hover();
      await expect.poll(async () => (await lookOf(targetButton(page), name)).background).toBe(elevated);
    });
  }
}

for (const app of SHELF_PAGES) {
  for (const width of [640, 1280]) {
    test(`SPEC-CORE-099 I13 I14 ${app} at ${width}px: the quiet sort menu is on the title row, left of the Target`, async ({
      page,
    }) => {
      await openAppHeader(page, width, { app });
      const m = await snapshot(page, { drive: DRIVE, targetName: DEFAULT_TARGET_NAME[app] });
      const elevated = await colourOf(page, "elevated");

      expect(m.sort).not.toBeNull();
      expect(sameRow(m.sort!, m.h1)).toBe(true);
      expect(m.sort!.right).toBeLessThanOrEqual(m.target.left);
      expect(m.sort!.text).toContain(SORT_CHOICE);

      const rest = await lookOf(sortButton(page), SORT_CHOICE);
      expect(rest.background).toBe(TRANSPARENT);
      expect(rest.borderWidths).toEqual(["0px", "0px", "0px", "0px"]);

      await sortButton(page).hover();
      await expect.poll(async () => (await lookOf(sortButton(page), SORT_CHOICE)).background).toBe(elevated);
    });
  }
}
