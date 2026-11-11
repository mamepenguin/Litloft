/**
 * SPEC-CORE-046 I13: the image query's phone pill and header, measured in
 * Chromium. At 390 px both 「画像で探す」 pills reach the 44 px touch floor,
 * the chip and field fit the content width, and the page does not scroll
 * horizontally; at desktop width the image button sits inside the field's row.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "image-query.html"),
).href;

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;
const TOUCH_FLOOR = 44;

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
  fieldRow: Box;
  chip: Box;
  field: Box;
  phonePill: Box | null;
  modalPill: Box;
  desktopButton: Box | null;
  desktopButtonDisplay: string;
}

declare global {
  interface Window {
    measureImageQuery: () => Measurement;
  }
}

async function open(page: Page, width: number): Promise<Measurement> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(FIXTURE);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => window.measureImageQuery());
}

test("at 390px the image pills reach 44px and the chip and field fit the content width", async ({
  page,
}) => {
  const m = await open(page, PHONE_WIDTH);

  expect(m.phonePill).not.toBeNull();
  expect(m.phonePill!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
  expect(m.modalPill.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);

  expect(m.chip.left).toBeGreaterThanOrEqual(m.header.left);
  expect(m.field.right).toBeLessThanOrEqual(m.header.right);
  expect(m.fieldRow.right).toBeLessThanOrEqual(m.header.right);
  expect(m.fieldRow.width).toBeLessThanOrEqual(m.contentWidth + 1);

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});

test("at desktop width the image button sits inside the field's row", async ({
  page,
}) => {
  const m = await open(page, DESKTOP_WIDTH);

  expect(m.desktopButtonDisplay).not.toBe("none");
  expect(m.desktopButton).not.toBeNull();
  const button = m.desktopButton!;
  expect(button.top).toBeGreaterThanOrEqual(m.fieldRow.top - 1);
  expect(button.bottom).toBeLessThanOrEqual(m.fieldRow.bottom + 1);
  expect(button.left).toBeGreaterThanOrEqual(m.fieldRow.left - 1);
  expect(button.right).toBeLessThanOrEqual(m.fieldRow.right + 1);

  expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
});
