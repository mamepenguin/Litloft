/**
 * The mouse layouts' control bar fades on the idle timer even though the
 * button the viewer clicked keeps focus, and keyboard focus still brings it
 * back. Measured in a real browser: jsdom does not match `:focus-visible`.
 */

import { test, expect, type Page } from "@playwright/test";

import { openPeakJump } from "./peak-jump.serve";

const LAYOUTS = [
  { name: "pointer", width: 600, root: '[data-testid="control-bar"]' },
  { name: "compact", width: 400, root: '[data-testid="compact-controls-root"]' },
];

function opacity(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) => Number(getComputedStyle(document.querySelector(sel)!).opacity),
    selector,
  );
}

for (const layout of LAYOUTS) {
  test(`${layout.name}: a clicked button does not hold the bar over playback`, async ({
    page,
  }) => {
    await openPeakJump(page, layout.width);
    const play = page.locator(`${layout.root} button[aria-label="Play"]`);
    await play.click();
    await expect(page.locator(`${layout.root} button[aria-label="Pause"]`)).toBeFocused();

    // Off the frame, so pointer movement stops re-arming the idle timer.
    await page.mouse.move(layout.width + 200, 10);
    await expect.poll(() => opacity(page, layout.root), { timeout: 6000 }).toBe(0);

    await page.keyboard.press("Tab");
    await expect.poll(() => opacity(page, layout.root)).toBe(1);
  });
}
