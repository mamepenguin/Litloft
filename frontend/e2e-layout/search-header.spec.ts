/**
 * SPEC-CORE-039 I15: the search results header at a phone width and at
 * desktop, measured in Chromium. At 390 px the field spans the content width
 * and the count sits on one line under the chips; at desktop the field, the
 * count and the actions share the subject row.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "search-header.html"),
).href;

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

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
  header: Box;
  contentWidth: number;
  field: Box | null;
  chips: Box | null;
  count: Box;
  countLineHeight: number;
  actions: Box;
}

declare global {
  interface Window {
    measureHeader: () => Measurement;
  }
}

const overlapsVertically = (a: Box, b: Box) => a.top < b.bottom && b.top < a.bottom;

async function open(page: Page, width: number): Promise<Measurement> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(FIXTURE);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => window.measureHeader());
}

test("at 390px the query field takes the content width and the count sits on one line under the chips", async ({
  page,
}) => {
  const m = await open(page, PHONE_WIDTH);

  expect(m.field).not.toBeNull();
  expect(m.field!.width).toBeCloseTo(m.contentWidth, 0);
  expect(m.field!.left).toBeGreaterThanOrEqual(m.header.left);
  expect(m.field!.right).toBeLessThanOrEqual(m.header.right);

  expect(m.chips).not.toBeNull();
  expect(m.count.top).toBeGreaterThanOrEqual(m.chips!.bottom - 1);
  expect(m.count.height).toBeLessThanOrEqual(m.countLineHeight * 1.5);
  expect(overlapsVertically(m.count, m.actions)).toBe(true);

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});

test("at desktop width the field, the count and the actions share the subject row", async ({
  page,
}) => {
  const m = await open(page, DESKTOP_WIDTH);

  expect(m.field).not.toBeNull();
  expect(overlapsVertically(m.field!, m.count)).toBe(true);
  expect(overlapsVertically(m.field!, m.actions)).toBe(true);
  expect(m.field!.width).toBeLessThan(m.contentWidth);

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});
