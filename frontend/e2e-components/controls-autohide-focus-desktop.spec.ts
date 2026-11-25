/**
 * The mouse layouts' control bar fades on the idle timer after the viewer
 * clicks one of its controls, even when a key is pressed afterwards, and
 * keyboard focus still brings it back. Measured in a real browser: jsdom
 * does not match `:focus-visible`.
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

async function startPlaying(page: Page, root: string): Promise<void> {
  await page.locator(`${root} button[aria-label="Play"]`).click();
}

async function clickSlider(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function waitOffFrame(page: Page, width: number, root: string): Promise<void> {
  // Off the frame, so pointer movement stops re-arming the idle timer.
  await page.mouse.move(width + 200, 10);
  await expect.poll(() => opacity(page, root), { timeout: 6000 }).toBe(0);
}

for (const layout of LAYOUTS) {
  test(`${layout.name}: a clicked button does not hold the bar, even after a key press`, async ({
    page,
  }) => {
    await openPeakJump(page, layout.width);
    await startPlaying(page, layout.root);
    // Any key press makes the browser treat the focused element as keyboard
    // focus, so the clicked button must not be holding focus by then.
    await page.keyboard.press("ArrowRight");
    await waitOffFrame(page, layout.width, layout.root);

    await page.keyboard.press("Tab");
    await expect.poll(() => opacity(page, layout.root)).toBe(1);
  });

  test(`${layout.name}: a clicked seek bar does not hold the bar, even after a key press`, async ({
    page,
  }) => {
    await openPeakJump(page, layout.width);
    await startPlaying(page, layout.root);
    await clickSlider(page, `${layout.root} input[aria-label="Seek"]`);
    await page.keyboard.press("m");
    await waitOffFrame(page, layout.width, layout.root);
  });
}

test("pointer: a clicked volume slider does not hold the bar, even after a key press", async ({
  page,
}) => {
  const root = LAYOUTS[0].root;
  await openPeakJump(page, LAYOUTS[0].width);
  await startPlaying(page, root);
  await clickSlider(page, `${root} input[aria-label="Volume"]`);
  await page.keyboard.press("m");
  await waitOffFrame(page, LAYOUTS[0].width, root);
});
