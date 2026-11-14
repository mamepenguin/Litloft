/**
 * SPEC-CORE-099: the app header of the Video and Reading pages and their shelf pages at
 * 640px and wider, measured with the real pages on a pointer that can hover.
 */

import { test, expect } from "@playwright/test";

import {
  APP_PAGES,
  CAMERA_FOLDER_NAME,
  DEFAULT_TARGET_NAME,
  SHELF_PAGES,
  SHORT_FOLDER_NAME,
  TRANSPARENT,
  colourOf,
  lookOf,
  openAppHeader,
  sameRow,
  snapshot,
  sortButton,
  targetButton,
  valueSpanOf,
} from "./app-header.measure";

const DRIVE = "fixture";
const SORT_CHOICE = "Added (newest first)";
const TARGET_SHARE = 0.4;
const TITLE_FLOOR = 120;

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

for (const app of APP_PAGES) {
  test(`SPEC-CORE-099 I11 I14 ${app} at 640px with a long folder name: the Target is capped at 40% of the header and the title keeps 120px`, async ({
    page,
  }) => {
    await openAppHeader(page, 640, { app, target: "camera" });
    const m = await snapshot(page, { drive: DRIVE, targetName: CAMERA_FOLDER_NAME });

    expect(m.h1.clientWidth).toBeGreaterThanOrEqual(TITLE_FLOOR);
    expect(m.h1.height).toBeLessThan(m.h1.lineHeight * 1.5);
    expect(sameRow(m.target, m.h1)).toBe(true);
    expect(m.target.width).toBeLessThanOrEqual(m.headerWidth * TARGET_SHARE + 1);
    expect(m.targetNameSpan).not.toBeNull();
    expect(m.targetNameSpan!.scrollWidth).toBeGreaterThan(m.targetNameSpan!.clientWidth);
    expect(m.targetNameSpan!.textOverflow).toBe("ellipsis");
    expect(m.targetSvgs[0].width).toBeCloseTo(14, 1);
    expect(m.targetSvgs[m.targetSvgs.length - 1].width).toBeCloseTo(14, 1);
    if (m.sort) {
      const sort = await valueSpanOf(sortButton(page), SORT_CHOICE);
      expect(sort).not.toBeNull();
      expect(sort!.scrollWidth).toBeLessThanOrEqual(sort!.clientWidth);
    }
    expect(m.scrollWidth).toBeLessThanOrEqual(640);
  });
}

for (const app of APP_PAGES) {
  for (const width of [640, 1280]) {
    for (const target of ["default", "trips"] as const) {
      test(`SPEC-CORE-099 I11 ${app} at ${width}px with ${target === "default" ? "the default target" : "a short folder name"}: the Target's name is whole`, async ({
        page,
      }) => {
        const name = target === "default" ? DEFAULT_TARGET_NAME[app] : SHORT_FOLDER_NAME;
        await openAppHeader(page, width, target === "trips" ? { app, target } : { app });
        const m = await snapshot(page, { drive: DRIVE, targetName: name });

        expect(m.targetName.whole).toBe(true);
        expect(m.targetNameSpan).not.toBeNull();
        expect(m.targetNameSpan!.scrollWidth).toBeLessThanOrEqual(m.targetNameSpan!.clientWidth);
      });
    }
  }
}
