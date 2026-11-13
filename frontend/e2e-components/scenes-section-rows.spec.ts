/**
 * SPEC-ADDON-104 in Chromium with a coarse pointer: the real Scenes section in
 * the real file page's phone sheet, whose scroller holds the inspector in its
 * column form, at the sheet's half and full snaps.
 */

import { test, expect, type Page } from "@playwright/test";
import enMessages from "../src/messages-core/en.json";

import {
  CANONICAL,
  expectMoreThanThreeRows,
  expectRowsFillHeight,
  openFilePage,
  rowsOverFrames,
  settledRows,
  type RowsReading,
} from "./scenes-section-rows.cases";

const SHEET = '[data-testid="mobile-inspector-sheet"]';

/** vaul animates a snap, so the sheet is read once it has stopped moving. */
async function sheetSettled(page: Page, snap: "half" | "full"): Promise<void> {
  await expect(page.locator(SHEET)).toHaveAttribute("data-snap", snap);
  let last = NaN;
  await expect
    .poll(
      async () => {
        const top = await page
          .locator(SHEET)
          .evaluate((sheet) => sheet.getBoundingClientRect().top);
        const still = Math.abs(top - last) < 0.5;
        last = top;
        return still;
      },
      { intervals: [120] },
    )
    .toBe(true);
}

/** Drags the sheet's grabber by `down` pixels with one finger. */
async function dragGrabber(page: Page, down: number): Promise<void> {
  const box = (await page.locator("[data-vaul-handle]").boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y0 = Math.round(box.y + box.height / 2);
  const steps = 15;
  // The clicks before this leave the mouse over the sheet. vaul ends a knob
  // drag on any `pointerout` reaching its content, and Chromium sends the
  // mouse one when its hover update lands while the sheet moves under it:
  // the drag then ends 33px in, short of full on a slow runner. The sheet
  // never reaches the top row.
  await page.mouse.move(0, 0);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: y0 }],
  });
  for (let step = 1; step <= steps; step += 1) {
    await page.waitForTimeout(30);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: Math.round(y0 + (down * step) / steps) }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

async function openSheetOnScenes(
  page: Page,
  viewport: { width: number; height: number },
): Promise<RowsReading> {
  await page.setViewportSize(viewport);
  await openFilePage(page, CANONICAL, { frames: 300 });
  await page
    .getByTestId("mobile-inspector-peek")
    .getByRole("button", { name: enMessages.inspector.expandSheet })
    .click();
  await sheetSettled(page, "half");
  await page.getByRole("tab", { name: "Scenes" }).click();
  await expect(
    page.getByRole("slider", { name: "Frame timeline" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Regenerate scenes" }),
  ).toBeVisible();
  return settledRows(page);
}

async function toFull(page: Page): Promise<RowsReading> {
  await dragGrabber(page, -500);
  await sheetSettled(page, "full");
  return settledRows(page);
}

test("SPEC-ADDON-104 I1 — the 390×844 sheet at its half snap draws 3 rows and its scroller scrolls (D6)", async ({
  page,
}) => {
  const half = await openSheetOnScenes(page, { width: 390, height: 844 });
  expect(half.scrollerTestId).toBe("mobile-inspector-content");
  expectRowsFillHeight(half);
  expect(half.rows).toBe(3);
  expect(half.columns).toBe(3);
  expect(half.scrollHeight).toBeGreaterThan(half.clientHeight + 1);
});

test("SPEC-ADDON-104 I1 I2 — the 390×844 sheet at its full snap follows the rule", async ({
  page,
}) => {
  await openSheetOnScenes(page, { width: 390, height: 844 });
  const full = await toFull(page);
  expect(full.scrollerTestId).toBe("mobile-inspector-content");
  expect(full.columns).toBe(3);
  expectRowsFillHeight(full);
});

test("SPEC-ADDON-104 I1 I2 I5 — a 390×1000 sheet moving from half to full grows past 3 rows and holds", async ({
  page,
}) => {
  const half = await openSheetOnScenes(page, { width: 390, height: 1000 });
  expectRowsFillHeight(half);

  const full = await toFull(page);
  expect(full.scrollerTestId).toBe("mobile-inspector-content");
  expectMoreThanThreeRows(full);
  const frames = await rowsOverFrames(page, 30);
  expect(new Set(frames)).toEqual(new Set([`${full.rows}/${full.tiles}`]));
});
