/**
 * Below `sm` the page header's scope line and actions wrap onto another line
 * instead of widening the page.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "page-header-wrap.html"),
).href;

for (const width of [320, 390]) {
  test(`header controls stay inside a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(FIXTURE);
    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll(".action")].map((b) => {
        const r = b.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    }));
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
    for (const b of m.buttons) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(m.innerWidth);
    }
  });
}
