/**
 * SPEC-CORE-140 D1, D2, D3: the band in the touch layout, shown by a double
 * tap, with only the bottom bar drawn.
 */

import { test, expect, type Page } from "@playwright/test";

import { expectBandGeometry, measureBand, openBand } from "./watched-band.serve";

const FULL_SCREEN = 'button[aria-label="Full screen"]';
const SETTINGS = 'button[aria-label="Settings"]';
const CENTRE = '[data-testid="transport"] button';
const HAIRLINE = '[data-testid="progress-hairline"]';

/** Product of the opacities from the element up to the document; null if absent. */
function paintedOpacity(page: Page, selector: string): Promise<number | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    let opacity = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") return 0;
      opacity *= Number(style.opacity);
    }
    return opacity;
  }, selector);
}

function currentTime(page: Page): Promise<number> {
  return page.evaluate(
    () => (document.querySelector("#watched-band-video") as HTMLVideoElement).currentTime,
  );
}

async function doubleTap(page: Page): Promise<void> {
  const frame = (await page.locator("#player-frame").boundingBox())!;
  const x = frame.x + frame.width * 0.8;
  const y = frame.y + frame.height * 0.4;
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
}

test("SPEC-CORE-140 D1 D2 D3 a double tap shows the bottom bar with the band, and not the centre or top-right buttons", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const opened = await openBand(page);

  // Paused, so the whole chrome is up: every selector below finds its control.
  for (const selector of [FULL_SCREEN, SETTINGS, CENTRE]) {
    await expect.poll(() => paintedOpacity(page, selector), selector).toBe(1);
  }

  await doubleTap(page);
  await expect.poll(() => currentTime(page)).toBeCloseTo(10, 0);

  await expect.poll(opened.segmentsServed).toBe(true);
  await page.waitForTimeout(2500);
  await doubleTap(page);

  await expect(page.locator('[data-testid="watched-piece"]')).toHaveCount(3);
  const m = await measureBand(page);
  expect(m.knob, "the touch seek bar draws its knob").not.toBeNull();
  const fullScreen = await paintedOpacity(page, FULL_SCREEN);
  const settings = await paintedOpacity(page, SETTINGS);
  const centre = await paintedOpacity(page, CENTRE);
  const hairline = await paintedOpacity(page, HAIRLINE);

  expectBandGeometry(m);
  expect(fullScreen, "the full-screen button is drawn").toBe(1);
  expect(settings ?? 0, "the top-right buttons are not drawn").toBe(0);
  expect(centre ?? 0, "the centre play button is not drawn").toBe(0);
  expect(hairline ?? 0, "the hairline is not drawn").toBe(0);
});
