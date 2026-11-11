/**
 * SPEC-CORE-044 I11: on the Ask page's chip row a 200-character folder chip is
 * no wider than the row, keeps its ✕ visible and in the row, and the
 * 「＋ 範囲」 trigger stays inside the content width at phone and desktop.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "ask-scope-chips.html"),
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
  row: Box;
  chip: Box;
  value: string;
  dismiss: Box;
  scopeAdd: Box;
}

declare global {
  interface Window {
    measureAskScopeChips: () => Measurement;
  }
}

async function open(page: Page, width: number): Promise<Measurement> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(FIXTURE);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => window.measureAskScopeChips());
}

for (const width of [PHONE_WIDTH, DESKTOP_WIDTH]) {
  test(`at ${width}px the Ask scope chip stays inside its row`, async ({
    page,
  }) => {
    const m = await open(page, width);

    expect(m.value).toHaveLength(200);
    expect(m.chip.width).toBeLessThanOrEqual(m.row.width + 0.5);
    expect(m.chip.left).toBeGreaterThanOrEqual(m.row.left - 0.5);
    expect(m.chip.right).toBeLessThanOrEqual(m.row.right + 0.5);

    expect(m.dismiss.width).toBeGreaterThan(0);
    expect(m.dismiss.left).toBeGreaterThanOrEqual(m.row.left - 0.5);
    expect(m.dismiss.right).toBeLessThanOrEqual(m.row.right + 0.5);
    expect(m.dismiss.right).toBeLessThanOrEqual(m.viewport.width);

    expect(m.scopeAdd.width).toBeGreaterThan(0);
    expect(m.scopeAdd.right).toBeLessThanOrEqual(m.viewport.width);

    expect(m.documentScrollWidth).toBeLessThanOrEqual(m.documentWidth);
  });
}
