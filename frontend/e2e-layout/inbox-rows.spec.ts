/**
 * Where an inbox row's trailing controls land, measured in Chromium: the
 * done button's 32px fine box and 44px coarse floor, its visibility by
 * pointer type and width, and the checkbox that only a fine pointer gets.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "inbox-rows.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

const SPEC: {
  label: string;
  rowName: string;
} = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

interface Box {
  width: number;
  height: number;
  top: number;
  left: number;
}

interface Measurement {
  row: Box;
  link: Box;
  touchAction: string;
  name: Box & { truncated: boolean };
  done: Box & { opacity: number; display: string; visibility: string };
  checkbox: Box & { display: string };
}

declare global {
  interface Window {
    buildRows: () => void;
    measureRow: () => Measurement;
    pointerIsCoarse: () => boolean;
  }
}

/** Declared, not read off a measurement. */
const FINE_DONE_PX = 32;
const COARSE_DONE_PX = 44;
const CHECKBOX_PX = 16;
/** Tailwind's `md`, where a coarse pointer's Done button stays visible. */
const COARSE_ALWAYS_VISIBLE_PX = 768;

async function open(page: import("@playwright/test").Page) {
  await page.goto(FIXTURE);
  await page.evaluate(() => window.buildRows());
}

const measure = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.measureRow());

const ROW = '[data-row="r1"]';

test.describe("fine pointer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the context really reports a fine pointer", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.pointerIsCoarse())).toBe(false);
  });

  test("Done rests hidden, takes the 32px box, and the checkbox is there", async ({
    page,
  }) => {
    await open(page);
    const before = await measure(page);

    expect(before.done.opacity).toBe(0);
    expect(before.done.visibility).not.toBe("hidden");
    expect(before.done.height).toBe(FINE_DONE_PX);
    expect(before.checkbox.display).not.toBe("none");
    expect(before.checkbox.width).toBe(CHECKBOX_PX);
    expect(before.checkbox.height).toBe(CHECKBOX_PX);
  });

  test("hovering the row reveals Done without reflowing it", async ({ page }) => {
    await open(page);
    const before = await measure(page);
    await page.hover(ROW);
    await page.waitForTimeout(250);
    const after = await measure(page);

    expect(before.done.opacity).toBe(0);
    expect(after.done.opacity).toBe(1);
    expect(after.row.width).toBe(before.row.width);
    expect(after.row.height).toBe(before.row.height);
    expect(after.name.width).toBe(before.name.width);
    expect(after.link.width).toBe(before.link.width);
  });

  test("focus inside the row reveals Done too", async ({ page }) => {
    await open(page);
    await page.focus(`${ROW} a`);
    await page.waitForTimeout(250);
    expect((await measure(page)).done.opacity).toBe(1);
  });

  test("the long name truncates rather than reaching the controls", async ({
    page,
  }) => {
    await open(page);
    const measured = await measure(page);
    expect(measured.name.truncated).toBe(true);
    expect(measured.done.left).toBeGreaterThan(measured.name.left);
  });
});

test.describe("fine pointer on a phone width", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("still hides Done until the row is hovered, at 32px", async ({ page }) => {
    await open(page);
    const before = await measure(page);
    expect(before.done.opacity).toBe(0);
    expect(before.done.height).toBe(FINE_DONE_PX);
    expect(before.checkbox.display).not.toBe("none");
  });
});

test.describe("coarse pointer below the visible button's width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the context really reports a coarse pointer", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.pointerIsCoarse())).toBe(true);
  });

  test("Done is not rendered at all and the checkbox is gone", async ({ page }) => {
    await open(page);

    expect(await page.locator("[data-done]").count()).toBe(0);
    expect(
      await page
        .locator(`${ROW} [data-checkbox]`)
        .evaluate((el) => getComputedStyle(el).display),
    ).toBe("none");
  });

  test("the row claims horizontal pans so the swipe reaches the handler", async ({
    page,
  }) => {
    await open(page);
    expect(
      await page
        .locator(ROW)
        .evaluate((el) => getComputedStyle(el).touchAction),
    ).toBe("pan-y");
  });
});

test.describe("coarse pointer at the tablet width", () => {
  test.use({ viewport: { width: COARSE_ALWAYS_VISIBLE_PX, height: 900 }, hasTouch: true });

  test("Done is always visible at the 44px floor and the checkbox stays gone", async ({
    page,
  }) => {
    await open(page);
    const measured = await measure(page);

    expect(await page.evaluate(() => window.pointerIsCoarse())).toBe(true);
    expect(measured.done.opacity).toBe(1);
    expect(measured.done.height).toBe(COARSE_DONE_PX);
    expect(measured.checkbox.display).toBe("none");
    expect(measured.done.width).toBeGreaterThanOrEqual(COARSE_DONE_PX);
  });

  test("the name still truncates before the always-visible button", async ({
    page,
  }) => {
    await open(page);
    const measured = await measure(page);
    expect(measured.name.truncated).toBe(true);
    expect(measured.done.left).toBeGreaterThan(measured.name.left);
  });
});

test.describe("across the two pointer types", () => {
  test("the button grows to the floor and the checkbox disappears", async ({
    browser,
  }) => {
    const fine = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const coarse = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      hasTouch: true,
    });
    try {
      const finePage = await fine.newPage();
      const coarsePage = await coarse.newPage();
      await open(finePage);
      await open(coarsePage);

      const fineRow = await measure(finePage);
      const coarseRow = await measure(coarsePage);

      expect(fineRow.done.height).toBe(FINE_DONE_PX);
      expect(coarseRow.done.height).toBe(COARSE_DONE_PX);
      expect(fineRow.checkbox.display).not.toBe("none");
      expect(coarseRow.checkbox.display).toBe("none");
    } finally {
      await fine.close();
      await coarse.close();
    }
  });
});

test("the fixture names the label the cases read", () => {
  expect(SPEC.label).toBe("Done");
  expect(SPEC.rowName.length).toBeGreaterThan(20);
});
