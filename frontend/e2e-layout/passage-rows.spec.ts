/**
 * SPEC-CORE-040 I14 as revised by SPEC-CORE-066: the Passages view at a phone
 * width and at desktop, measured in Chromium. At 390 px the switch and the
 * count share the results bar's one row and the picture is 64 px wide; at
 * desktop the picture is 88 px wide, the rows start at the bar's first control
 * and stay within `max-w-list-row`.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "passage-rows.html"),
).href;

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

/** DESIGN.md §3.6: a column of list rows is 60rem. */
const LIST_ROW_MAX_PX = 960;

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface Measurement {
  viewport: { width: number; height: number };
  documentWidth: number;
  documentScrollWidth: number;
  bar: Box;
  controlWrapper: Box;
  control: Box;
  count: Box;
  countLineHeight: number;
  list: Box;
  rows: Array<{ row: Box; picture: Box; text: Box }>;
}

declare global {
  interface Window {
    measurePassages: () => Measurement;
  }
}

const overlapsVertically = (a: Box, b: Box) => a.top < b.bottom && b.top < a.bottom;

async function open(page: Page, width: number): Promise<Measurement> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(FIXTURE);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => window.measurePassages());
}

test("at 390px the switch and the count share one bar row and rows do not overflow", async ({
  page,
}) => {
  const m = await open(page, PHONE_WIDTH);

  expect(overlapsVertically(m.control, m.count)).toBe(true);
  expect(m.control.left).toBeGreaterThanOrEqual(m.bar.left);
  expect(m.control.right).toBeLessThanOrEqual(m.bar.right);
  expect(m.count.left).toBeGreaterThanOrEqual(m.control.right);
  expect(m.count.right).toBeLessThanOrEqual(m.bar.right);
  expect(m.count.bottom).toBeLessThanOrEqual(m.bar.bottom);
  expect(m.count.height).toBeLessThanOrEqual(m.countLineHeight * 1.5);

  for (const { picture } of m.rows) {
    expect(picture.width).toBeCloseTo(64, 0);
    expect(picture.height).toBeCloseTo(36, 0);
  }

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});

test("at desktop width the picture is 88 px and the rows start at the bar's first control", async ({
  page,
}) => {
  const m = await open(page, DESKTOP_WIDTH);

  const first = m.rows[0];
  expect(first.picture.width).toBeCloseTo(88, 0);
  expect(first.picture.height).toBeCloseTo(50, 0);

  expect(m.list.width).toBeLessThanOrEqual(LIST_ROW_MAX_PX);
  expect(Math.abs(m.list.left - m.control.left)).toBeLessThanOrEqual(1);
  expect(m.list.right - m.list.left).toBeLessThan(m.bar.width);
  for (const { row, text } of m.rows) {
    expect(row.right).toBeLessThanOrEqual(m.list.right + 0.5);
    expect(text.left).toBeGreaterThan(first.picture.right);
  }

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});
