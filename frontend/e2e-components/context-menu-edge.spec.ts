/**
 * SPEC-CORE-178 I3 with a coarse pointer at 390x844: a long-press near an
 * edge paints the menu at its clamped place, full size, in the first frame.
 * The menu opens from a timer here, not from a discrete event.
 */

import { test, expect } from "@playwright/test";

import {
  expectEveryFrameFinal,
  holdTouch,
  openArrangement,
  recordedFrames,
  startRecording,
} from "./context-menu-edge.measure";

test.use({ viewport: { width: 390, height: 844 } });

test("SPEC-CORE-178 I3 a long-press 10 px from the bottom-right corner paints the menu 8 px inside both edges from its first frame", async ({ page }) => {
  await openArrangement(page, "context-menu-edge");
  await startRecording(page);
  const lift = await holdTouch(page, 380, 834, 700);
  await expect(page.getByRole("menuitem").first()).toBeVisible();

  const frames = await recordedFrames(page);
  await lift();
  expectEveryFrameFinal(frames, 380, 834);
  expect(Math.round(frames[0].left + frames[0].fullWidth)).toBe(390 - 8);
  expect(Math.round(frames[0].top + frames[0].fullHeight)).toBe(844 - 8);
});

test("SPEC-CORE-178 I3 a long-press 2 px from the top-left corner paints the menu 8 px inside both edges from its first frame", async ({ page }) => {
  await openArrangement(page, "context-menu-edge");
  await startRecording(page);
  const lift = await holdTouch(page, 2, 2, 700);
  await expect(page.getByRole("menuitem").first()).toBeVisible();

  const frames = await recordedFrames(page);
  await lift();
  expectEveryFrameFinal(frames, 2, 2);
  expect(Math.round(frames[0].left)).toBe(8);
  expect(Math.round(frames[0].top)).toBe(8);
});
