/**
 * SPEC-CORE-099: the app header of the Video and Reading pages and their shelf pages below
 * 640px, measured with the real pages on a coarse pointer.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  APP_PAGES,
  DEFAULT_TARGET_NAME,
  LONG_DRIVE_NAME,
  LONG_FOLDER_NAME,
  LONG_SHELF_TITLE,
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

const PHONE = 375;
const DRIVE = "fixture";
const SUMMER_FOLDER_NAME = "Holiday 25";
// The narrowest a drive name is cut to on a phone (`w-14`), which a short name
// such as `main` fits whole.
const DRIVE_FLOOR = 56;

for (const app of APP_PAGES) {
  for (const width of [PHONE, 639]) {
    test(`SPEC-CORE-099 I10 I11 ${app} at ${width}px: the title row holds only the icon and the title, the Target ends the scope line, and nothing is cut or runs past the viewport`, async ({
      page,
    }) => {
      await openAppHeader(page, width, { app });
      const m = await snapshot(page, { drive: DRIVE, targetName: DEFAULT_TARGET_NAME[app] });

      expect(sameRow(m.target, m.h1)).toBe(false);
      expect(m.target.top).toBeGreaterThanOrEqual(m.h1.bottom - 1);
      expect(sameRow(m.target, m.count)).toBe(true);
      expect(m.target.left).toBeGreaterThan(m.count.right);
      expect(Math.abs(m.targetSvgs[m.targetSvgs.length - 1].right - m.contentRight)).toBeLessThanOrEqual(1);
      if (m.sort) expect(sameRow(m.sort, m.h1)).toBe(false);
      if (m.sort) expect(sameRow(m.sort, m.count)).toBe(false);
      if (m.tabs) {
        expect(m.tabs.top).toBeGreaterThanOrEqual(Math.max(m.h1.bottom, m.count.bottom, m.target.bottom) - 1);
      }

      expect(m.h1.scrollWidth).toBeLessThanOrEqual(m.h1.clientWidth);
      expect(m.count.whole).toBe(true);
      expect(m.drive.whole).toBe(true);
      expect(m.targetName.whole).toBe(true);
      expect(m.scrollWidth).toBeLessThanOrEqual(width);
      expect(m.overflowRight).toBeLessThanOrEqual(width);
    });
  }

  test(`SPEC-CORE-099 I10 ${app} at 375px with a long folder name: the name is cut inside the Target, the title and scope text stay whole`, async ({
    page,
  }) => {
    await openAppHeader(page, PHONE, { app, longTarget: true });
    const m = await snapshot(page, { drive: DRIVE, targetName: LONG_FOLDER_NAME });

    expect(m.targetName.whole).toBe(false);
    expect(m.targetNameFirstThree.whole).toBe(true);
    expect(m.count.whole).toBe(true);
    expect(m.separator.whole).toBe(true);
    expect(m.drive.whole).toBe(true);
    expect(m.h1.scrollWidth).toBeLessThanOrEqual(m.h1.clientWidth);
    expect(sameRow(m.target, m.count)).toBe(true);
    expect(sameRow(m.target, m.h1)).toBe(false);
    expect(Math.abs(m.targetSvgs[m.targetSvgs.length - 1].right - m.contentRight)).toBeLessThanOrEqual(1);
    expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);
    expect(m.overflowRight).toBeLessThanOrEqual(PHONE);
  });

  test(`SPEC-CORE-099 I10 ${app} at 375px with a long drive name: the drive name is cut first, the count and the Target's name stay whole`, async ({
    page,
  }) => {
    await openAppHeader(page, PHONE, { app, drive: LONG_DRIVE_NAME });
    const m = await snapshot(page, { drive: LONG_DRIVE_NAME, targetName: DEFAULT_TARGET_NAME[app] });

    expect(m.drive.whole).toBe(false);
    expect(m.count.whole).toBe(true);
    expect(m.separator.whole).toBe(true);
    expect(m.targetName.whole).toBe(true);
    expect(sameRow(m.target, m.count)).toBe(true);
    expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);
    expect(m.overflowRight).toBeLessThanOrEqual(PHONE);
  });

  test(`SPEC-CORE-099 I10 ${app} at 375px with a long drive name and a folder name wider than two fifths of the line: the Target's name is cut only once the drive name is down to its floor`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: PHONE, height: 800 });
    const q = new URLSearchParams({ page: app, drive: LONG_DRIVE_NAME, target: "summer" });
    await page.goto(`${pathToFileURL(PAGE).href}?${q}#app-header`);
    await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
    await expect(page.locator("header h1")).toBeVisible();
    const m = await snapshot(page, { drive: LONG_DRIVE_NAME, targetName: SUMMER_FOLDER_NAME });

    const driveWidth = await page
      .locator("header span", { hasText: new RegExp(`^${LONG_DRIVE_NAME}$`) })
      .evaluate((el) => el.getBoundingClientRect().width);
    if (!m.targetName.whole) expect(driveWidth).toBeLessThanOrEqual(DRIVE_FLOOR + 0.5);
    expect(m.drive.whole).toBe(false);
    expect(m.count.whole).toBe(true);
    expect(m.targetSvgs[0].width).toBeCloseTo(14, 1);
    expect(m.targetSvgs[m.targetSvgs.length - 1].width).toBeCloseTo(14, 1);
    expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);
    expect(m.overflowRight).toBeLessThanOrEqual(PHONE);
  });

  for (const scenario of [
    { label: "a long folder name", drive: DRIVE, longTarget: true },
    { label: "a long drive name and a long folder name", drive: LONG_DRIVE_NAME, longTarget: true },
  ]) {
    test(`SPEC-CORE-099 I10 ${app} at 375px with ${scenario.label}: the Target's icon and chevron keep their 14px width`, async ({
      page,
    }) => {
      await openAppHeader(page, PHONE, { app, drive: scenario.drive, longTarget: scenario.longTarget });
      const m = await snapshot(page, { drive: scenario.drive, targetName: LONG_FOLDER_NAME });

      expect(m.targetName.whole).toBe(false);
      expect(m.targetSvgs[0].width).toBeCloseTo(14, 1);
      expect(m.targetSvgs[m.targetSvgs.length - 1].width).toBeCloseTo(14, 1);
    });

    test(`SPEC-CORE-099 I10 ${app} at 375px with ${scenario.label}: no blank is left between the count and the cut Target`, async ({
      page,
    }) => {
      await openAppHeader(page, PHONE, { app, drive: scenario.drive, longTarget: scenario.longTarget });
      const m = await snapshot(page, { drive: scenario.drive, targetName: LONG_FOLDER_NAME });

      expect(m.targetName.whole).toBe(false);
      expect(m.target.left - m.count.right).toBeLessThanOrEqual(16);
    });

    test(`SPEC-CORE-099 I10 ${app} at 375px with ${scenario.label}: the cut Target's icon starts 16px after the count`, async ({
      page,
    }) => {
      await openAppHeader(page, PHONE, { app, drive: scenario.drive, longTarget: scenario.longTarget });
      const m = await snapshot(page, { drive: scenario.drive, targetName: LONG_FOLDER_NAME });

      expect(m.targetName.whole).toBe(false);
      expect(Math.abs(m.targetSvgs[0].left - m.count.right - 16)).toBeLessThanOrEqual(1);
    });
  }

  test(`SPEC-CORE-099 I10 ${app} at 375px with a long drive name: the Target's icon and chevron keep their 14px width`, async ({
    page,
  }) => {
    await openAppHeader(page, PHONE, { app, drive: LONG_DRIVE_NAME });
    const m = await snapshot(page, { drive: LONG_DRIVE_NAME, targetName: DEFAULT_TARGET_NAME[app] });

    expect(m.targetSvgs[0].width).toBeCloseTo(14, 1);
    expect(m.targetSvgs[m.targetSvgs.length - 1].width).toBeCloseTo(14, 1);
  });

  test(`SPEC-CORE-099 I12 I14 ${app} at 375px: the Target is a quiet control named "<label>: <name>"`, async ({
    page,
  }) => {
    await openAppHeader(page, PHONE, { app });
    const name = DEFAULT_TARGET_NAME[app];
    const m = await snapshot(page, { drive: DRIVE, targetName: name });
    const look = await lookOf(targetButton(page), name);
    const muted = await colourOf(page, "muted");

    expect(m.targetText).not.toMatch(/Target/);
    expect(look.background).toBe(TRANSPARENT);
    expect(look.borderWidths).toEqual(["0px", "0px", "0px", "0px"]);
    expect(look.color).toBe(muted);
    expect(look.textColour).toBe(muted);
    expect(look.fontSize).toBe("14px");
    expect(look.height).toBeGreaterThanOrEqual(44);
    expect(m.targetSvgs.some((svg) => svg.right <= m.targetName.left + 0.5)).toBe(true);
    expect(m.targetSvgs.some((svg) => svg.left >= m.targetName.right - 0.5)).toBe(true);
  });

  test(`SPEC-CORE-099 I14 ${app}: the Target takes the elevated fill while its menu is open`, async ({ page }) => {
    await openAppHeader(page, PHONE, { app });
    const elevated = await colourOf(page, "elevated");

    await targetButton(page).click();
    await expect(targetButton(page)).toHaveAttribute("aria-expanded", "true");

    expect((await lookOf(targetButton(page), DEFAULT_TARGET_NAME[app])).background).toBe(elevated);
  });
}

for (const app of SHELF_PAGES) {
  test(`SPEC-CORE-099 I13 ${app} at 375px: the sort menu is the header's last row, at its right end, showing its choice`, async ({
    page,
  }) => {
    await openAppHeader(page, PHONE, { app });
    const m = await snapshot(page, { drive: DRIVE, targetName: DEFAULT_TARGET_NAME[app] });

    expect(m.sort).not.toBeNull();
    const sort = m.sort!;
    const above = [m.h1, m.count, m.target, ...(m.tabs ? [m.tabs] : [])];
    for (const b of above) expect(sort.top).toBeGreaterThanOrEqual(b.bottom - 1);
    expect(Math.abs(sort.svgs[sort.svgs.length - 1].right - m.contentRight)).toBeLessThanOrEqual(1);
    expect(sort.text).toContain("Added (newest first)");
    expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);
  });

  test(`SPEC-CORE-099 I14 ${app} at 375px: the sort menu is quiet, 44px tall, and takes the elevated fill while open`, async ({
    page,
  }) => {
    await openAppHeader(page, PHONE, { app });
    const muted = await colourOf(page, "muted");
    const elevated = await colourOf(page, "elevated");

    const rest = await lookOf(sortButton(page), "Added (newest first)");
    expect(rest.background).toBe(TRANSPARENT);
    expect(rest.borderWidths).toEqual(["0px", "0px", "0px", "0px"]);
    expect(rest.color).toBe(muted);
    expect(rest.fontSize).toBe("14px");
    expect(rest.height).toBeGreaterThanOrEqual(44);

    await sortButton(page).click();
    await expect(sortButton(page)).toHaveAttribute("aria-expanded", "true");
    expect((await lookOf(sortButton(page), "Added (newest first)")).background).toBe(elevated);
  });

  test(`SPEC-CORE-099 I14 ${app} at 375px: a long title is one line, cut with an ellipsis, with nothing beside it`, async ({
    page,
  }) => {
    await openAppHeader(page, PHONE, { app, key: LONG_SHELF_TITLE });
    const m = await snapshot(page, { drive: DRIVE, targetName: DEFAULT_TARGET_NAME[app] });

    expect(m.h1.height).toBeLessThan(m.h1.lineHeight * 1.5);
    expect(m.h1.scrollWidth).toBeGreaterThan(m.h1.clientWidth);
    expect(m.h1.textOverflow).toBe("ellipsis");
    expect(Math.abs(m.h1.right - m.contentRight)).toBeLessThanOrEqual(1);
    expect(sameRow(m.target, m.h1)).toBe(false);
    expect(sameRow(m.target, m.count)).toBe(true);
    expect(m.count.whole).toBe(true);
    expect(m.sort).not.toBeNull();
    expect(sameRow(m.sort!, m.h1)).toBe(false);
    expect(m.sort!.top).toBeGreaterThanOrEqual(m.target.bottom - 1);
    expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);
  });
}

for (const [app, name] of [
  ["video", "すべての動画"],
  ["reading", "すべての本"],
] as const) {
  test(`SPEC-CORE-099 I10 ${app} at 375px in Japanese with drive main: the default Target's name is whole`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: PHONE, height: 800 });
    await page.goto(`${pathToFileURL(PAGE).href}?page=${app}&drive=main&locale=ja#app-header`);
    const target = page.locator("header").getByRole("button", { name: `対象: ${name}` });
    await expect(target).toBeVisible();

    const whole = await target.evaluate((el) => {
      const nameSpan = Array.from(el.querySelectorAll("span")).find(
        (span) => (span.textContent ?? "").trim().length > 0,
      )!;
      return nameSpan.scrollWidth <= nameSpan.clientWidth;
    });
    expect(whole).toBe(true);
  });
}

test("SPEC-CORE-099 I12 the Japanese Target is named 対象: すべての本 and draws no 対象", async ({ page }) => {
  await page.setViewportSize({ width: PHONE, height: 800 });
  await page.goto(`${pathToFileURL(PAGE).href}?page=reading&locale=ja#app-header`);
  const target = page.locator("header").getByRole("button", { name: "対象: すべての本" });
  await expect(target).toBeVisible();

  expect(await target.innerText()).not.toContain("対象");
  expect(await target.innerText()).toContain("すべての本");
});
