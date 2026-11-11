import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(resolve(__dirname, "fixtures", "scene-candidates.html")).href;

for (const width of [375, 1280]) {
  for (const state of ["loading", "1", "8", "20"]) {
    test(`SPEC-ADDON-045: ${state} candidates fit and wrap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${FIXTURE}#${state}`);
      await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
      const boxes = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>("[aria-busy]")!;
        return {
          pageWidth: document.documentElement.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          rowWidth: row.clientWidth,
          rowScrollWidth: row.scrollWidth,
          rowScrollHeight: row.scrollHeight,
          rowHeight: row.clientHeight,
          cards: Array.from(row.children, c => {
            const b = c.getBoundingClientRect();
            return { left: b.left, right: b.right, top: b.top };
          }),
        };
      });
      expect(boxes.pageScrollWidth).toBeLessThanOrEqual(boxes.pageWidth);
      expect(boxes.rowScrollWidth).toBeLessThanOrEqual(boxes.rowWidth);
      expect(boxes.rowScrollHeight).toBeLessThanOrEqual(boxes.rowHeight);
      for (const box of boxes.cards) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      if (state !== "1") expect(new Set(boxes.cards.map(c => c.top)).size).toBeGreaterThan(1);
      await page.locator("[aria-busy] > :last-child").scrollIntoViewIfNeeded();
      await expect(page.locator("[aria-busy] > :last-child")).toBeInViewport();
    });
  }
}
