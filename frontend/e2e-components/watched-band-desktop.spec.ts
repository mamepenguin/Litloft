/**
 * SPEC-CORE-140 D1, D2: the band in the pointer layout, shown by hovering the
 * seek row, measured against the real seek line and knob.
 */

import { test, expect } from "@playwright/test";

import {
  expectBandGeometry,
  measureBand,
  measureLine,
  openBand,
} from "./watched-band.serve";

test("SPEC-CORE-140 D1 D2 the hovered band sits 4px over the knob, spans the line and draws levels 1 to 3", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const opened = await openBand(page);

  await expect(page.locator('[data-testid="watched-band"]')).toHaveCount(0);
  await page.getByRole("slider", { name: "Seek" }).hover();
  expect((await measureLine(page)).height).toBeCloseTo(4, 0);

  await expect.poll(opened.segmentsServed).toBe(true);
  await expect(page.locator('[data-testid="watched-piece"]')).toHaveCount(3);
  expectBandGeometry(await measureBand(page));

  await page.mouse.move(2, 2);
  await expect(page.locator('[data-testid="watched-band"]')).toHaveCount(0);
});
