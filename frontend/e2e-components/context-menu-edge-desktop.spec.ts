/**
 * SPEC-CORE-178 I3 with a fine pointer at 1280x800: a right-click near an
 * edge paints the menu at its clamped place, full size, in the first frame.
 */

import { test, expect } from "@playwright/test";

import {
  expectEveryFrameFinal,
  openArrangement,
  recordedFrames,
  startRecording,
} from "./context-menu-edge.measure";

test.use({ viewport: { width: 1280, height: 800 } });

test("SPEC-CORE-178 I3 a right-click 10 px from the bottom-right corner paints the menu 8 px inside both edges from its first frame", async ({ page }) => {
  await openArrangement(page, "context-menu-edge");
  await startRecording(page);
  await page.mouse.click(1270, 790, { button: "right" });
  await expect(page.getByRole("menuitem").first()).toBeVisible();

  const frames = await recordedFrames(page);
  expectEveryFrameFinal(frames, 1270, 790);
  expect(Math.round(frames[0].left + frames[0].fullWidth)).toBe(1280 - 8);
  expect(Math.round(frames[0].top + frames[0].fullHeight)).toBe(800 - 8);
});

test("SPEC-CORE-178 I3 a right-click 2 px from the top-left corner paints the menu 8 px inside both edges from its first frame", async ({ page }) => {
  await openArrangement(page, "context-menu-edge");
  await startRecording(page);
  await page.mouse.click(2, 2, { button: "right" });
  await expect(page.getByRole("menuitem").first()).toBeVisible();

  const frames = await recordedFrames(page);
  expectEveryFrameFinal(frames, 2, 2);
  expect(Math.round(frames[0].left)).toBe(8);
  expect(Math.round(frames[0].top)).toBe(8);
});

test("SPEC-CORE-178 I3 a menu taller than the viewport sits at top 8 and runs past the bottom", async ({ page }) => {
  await openArrangement(page, "context-menu-edge-tall");
  await startRecording(page);
  await page.mouse.click(1270, 790, { button: "right" });
  await expect(page.getByRole("menuitem").first()).toBeAttached();

  const frames = await recordedFrames(page);
  expect(frames[0].fullHeight).toBeGreaterThan(800 - 16);
  expectEveryFrameFinal(frames, 1270, 790);
  expect(Math.round(frames[0].top)).toBe(8);
});

test("SPEC-CORE-178 I3 a right-click away from every edge paints the menu with its corner at the pointer from its first frame", async ({ page }) => {
  await openArrangement(page, "context-menu-edge");
  await startRecording(page);
  await page.mouse.click(400, 300, { button: "right" });
  await expect(page.getByRole("menuitem").first()).toBeVisible();

  const frames = await recordedFrames(page);
  expectEveryFrameFinal(frames, 400, 300);
  expect(Math.round(frames[0].left)).toBe(400);
  expect(Math.round(frames[0].top)).toBe(300);
});

test("SPEC-CORE-178 I3 a second right-click near the corner while the menu is open never paints it unclamped", async ({ page }) => {
  await openArrangement(page, "context-menu-edge");
  await page.mouse.click(400, 300, { button: "right" });
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

  await startRecording(page);
  await page.mouse.click(1270, 790, { button: "right" });
  await expect(page.getByRole("menuitem").first()).toBeVisible();

  const frames = await recordedFrames(page);
  expectEveryFrameFinal(frames, 1270, 790);
});
