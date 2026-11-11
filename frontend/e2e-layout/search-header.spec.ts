/**
 * SPEC-CORE-039 I15 as revised by SPEC-CORE-066: the search results header at
 * a phone width and at desktop, measured in Chromium. At 390 px the field
 * spans the content width with the chips under it, and the results bar below
 * them holds the view switch, Scene search, the count and `…` on one row; at
 * desktop the field has its row to itself and the count shares the results
 * bar with the switch, Scene search, View, Sort and `…`.
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
  bar: Box | null;
  switch: Box | null;
  scene: Box | null;
  count: Box;
  countLineHeight: number;
  views: Box[];
  sorts: Box[];
  mores: Box[];
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

test("at 390px the field takes the content width and the results bar is one row under the chips", async ({
  page,
}) => {
  const m = await open(page, PHONE_WIDTH);

  expect(m.field).not.toBeNull();
  expect(m.field!.width).toBeCloseTo(m.contentWidth, 0);
  expect(m.field!.left).toBeGreaterThanOrEqual(m.header.left);
  expect(m.field!.right).toBeLessThanOrEqual(m.header.right);

  expect(m.chips).not.toBeNull();
  expect(m.chips!.top).toBeGreaterThanOrEqual(m.field!.bottom - 1);

  expect(m.bar).not.toBeNull();
  expect(overlapsVertically(m.field!, m.bar!)).toBe(false);
  expect(m.bar!.top).toBeGreaterThanOrEqual(m.chips!.bottom - 1);

  expect(m.switch).not.toBeNull();
  expect(m.scene).not.toBeNull();
  expect(m.mores).toHaveLength(1);
  expect(m.views).toHaveLength(0);
  expect(m.sorts).toHaveLength(0);

  for (const control of [m.switch!, m.scene!, m.count, ...m.mores]) {
    expect(overlapsVertically(control, m.count)).toBe(true);
    expect(control.left).toBeGreaterThanOrEqual(m.bar!.left);
    expect(control.right).toBeLessThanOrEqual(m.bar!.right);
  }
  expect(m.count.top).toBeGreaterThanOrEqual(m.bar!.top);
  expect(m.count.bottom).toBeLessThanOrEqual(m.bar!.bottom);
  expect(m.count.height).toBeLessThanOrEqual(m.countLineHeight * 1.5);

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});

test("at desktop width the field has its row and the count shares the results bar with View, Sort and …", async ({
  page,
}) => {
  const m = await open(page, DESKTOP_WIDTH);

  expect(m.field).not.toBeNull();
  expect(m.field!.width).toBeCloseTo(m.contentWidth, 0);
  expect(m.bar).not.toBeNull();
  expect(overlapsVertically(m.field!, m.bar!)).toBe(false);

  expect(m.switch).not.toBeNull();
  expect(m.scene).not.toBeNull();
  expect(m.views).toHaveLength(1);
  expect(m.sorts).toHaveLength(1);
  expect(m.mores).toHaveLength(1);

  for (const control of [m.switch!, m.scene!, ...m.views, ...m.sorts, ...m.mores]) {
    expect(overlapsVertically(control, m.count)).toBe(true);
  }
  expect(m.count.left).toBeGreaterThan(m.scene!.right);
  expect(m.views[0]!.left).toBeLessThan(m.sorts[0]!.left);
  expect(m.sorts[0]!.left).toBeLessThan(m.mores[0]!.left);
  expect(m.count.height).toBeLessThanOrEqual(m.countLineHeight * 1.5);

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});
