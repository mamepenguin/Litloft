/**
 * SPEC-CORE-044 I11: the collection header's actions (再生, 「ここに質問」, `…`)
 * stay inside the content width at a phone width and at desktop, with no
 * horizontal scroll, even with a long collection name.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "collection-actions.html"),
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
  contentWidth: number;
  header: Box;
  title: Box;
  actions: Box;
  play: Box;
  ask: Box;
  more: Box;
}

declare global {
  interface Window {
    measureCollectionActions: () => Measurement;
  }
}

async function open(page: Page, width: number): Promise<Measurement> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(FIXTURE);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => window.measureCollectionActions());
}

for (const width of [PHONE_WIDTH, DESKTOP_WIDTH]) {
  test(`at ${width}px the collection actions stay inside the header`, async ({
    page,
  }) => {
    const m = await open(page, width);

    expect(m.actions.right).toBeLessThanOrEqual(m.header.right + 0.5);
    expect(m.actions.left).toBeGreaterThanOrEqual(m.header.left - 0.5);
    for (const control of [m.play, m.ask, m.more]) {
      expect(control.width).toBeGreaterThan(0);
      expect(control.left).toBeGreaterThanOrEqual(m.actions.left - 0.5);
      expect(control.right).toBeLessThanOrEqual(m.actions.right + 0.5);
      expect(control.right).toBeLessThanOrEqual(m.viewport.width);
    }
    expect(m.title.right).toBeLessThanOrEqual(m.header.right + 0.5);

    expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
  });
}
