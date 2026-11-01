/**
 * SPEC-ADDON-042: the scene candidates row does not widen the page, and the
 * section is as tall while loading as with 1 or 20 candidates, measured in
 * Chromium at a phone width and a desktop width.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "scene-candidates.html"),
).href;

const WIDTHS = [375, 1280] as const;
const STATES = ["loading", "1", "20"] as const;

async function open(page: Page, width: number, state: string) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("about:blank");
  await page.goto(`${FIXTURE}#${state}`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => {
    const doc = document.documentElement;
    const section = document.querySelector("section")!;
    const row = section.querySelector<HTMLElement>("[aria-busy]")!;
    const files = document.getElementById("files")!;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      sectionHeight: section.getBoundingClientRect().height,
      rowHeight: row.getBoundingClientRect().height,
      rowScrollHeight: row.scrollHeight,
      rowClientHeight: row.clientHeight,
      rowScrollWidth: row.scrollWidth,
      rowClientWidth: row.clientWidth,
      filesTop: files.getBoundingClientRect().top,
      cards: row.children.length,
    };
  });
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    for (const state of STATES) {
      test(`${state}: the document does not overflow horizontally`, async ({ page }) => {
        const m = await open(page, width, state);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
      });
    }

    test("the section is as tall while loading as with 1 and 20 candidates", async ({
      page,
    }) => {
      const heights: Record<string, { section: number; filesTop: number }> = {};
      for (const state of STATES) {
        const m = await open(page, width, state);
        heights[state] = { section: m.sectionHeight, filesTop: m.filesTop };
      }
      expect(heights["1"].section).toBeGreaterThan(0);
      expect(heights.loading.section).toBe(heights["1"].section);
      expect(heights["20"].section).toBe(heights["1"].section);
      expect(heights.loading.filesTop).toBe(heights["1"].filesTop);
      expect(heights["20"].filesTop).toBe(heights["1"].filesTop);
    });

    test("20 candidates scroll inside the row and fit its height", async ({ page }) => {
      const m = await open(page, width, "20");
      expect(m.cards).toBe(20);
      expect(m.rowScrollWidth).toBeGreaterThan(m.rowClientWidth);
      expect(m.rowScrollHeight).toBeLessThanOrEqual(m.rowClientHeight);
    });
  });
}
