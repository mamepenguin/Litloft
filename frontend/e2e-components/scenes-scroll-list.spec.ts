/**
 * SPEC-ADDON-152 in Chromium with a coarse pointer: the real Scenes section in
 * the real file page's phone sheet, the inspector's column form, at the
 * sheet's half and full snaps.
 */

import { test, expect, type Page } from "@playwright/test";
import enMessages from "../src/messages-core/en.json";

import {
  CANONICAL,
  CHIP,
  FRAMES,
  PAGE_STEP,
  openFilePage,
  readList,
  settled,
  type ListReading,
} from "./scenes-scroll-list.cases";

const SHEET = '[data-testid="mobile-inspector-sheet"]';
const SHARED = '[data-testid="mobile-inspector-content"]';

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

/** One finger moving from `from` to `to` in even steps. */
async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const steps = 12;
  await page.mouse.move(0, 0);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: Math.round(from.x), y: Math.round(from.y) }],
  });
  for (let step = 1; step <= steps; step += 1) {
    await page.waitForTimeout(20);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: Math.round(from.x + ((to.x - from.x) * step) / steps),
          y: Math.round(from.y + ((to.y - from.y) * step) / steps),
        },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function openSheet(page: Page, height = 844): Promise<ListReading> {
  await page.setViewportSize({ width: 390, height });
  await openFilePage(page, CANONICAL);
  await page
    .getByTestId("mobile-inspector-peek")
    .getByRole("button", { name: enMessages.inspector.expandSheet })
    .click();
  await sheetSettled(page, "half");
  await page.getByRole("tab", { name: "Scenes" }).click();
  await expect(page.getByRole("slider", { name: "Frame timeline" })).toBeVisible();
  return settled(page);
}

async function toFull(page: Page): Promise<ListReading> {
  const box = (await page.locator("[data-vaul-handle]").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await swipe(page, { x, y }, { x, y: y - 500 });
  await sheetSettled(page, "full");
  return settled(page);
}

/** A reader's wheel on the sheet's scroller, then the scroller moving by `by`. */
async function scrollShared(page: Page, by: number): Promise<void> {
  await page.locator(SHARED).evaluate((el, delta) => {
    el.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: delta }),
    );
    el.scrollTop += delta;
  }, by);
}

function expectFlow(reading: ListReading, at: string): void {
  expect(reading.form, at).toBe("flow");
  expect(reading.tiles, at).toBe(FRAMES);
  expect(reading.list, `${at}: the list scrolls by itself`).toBeNull();
  expect(reading.sectionScrollWidth, `${at}: the section scrolls sideways`).toBeLessThanOrEqual(
    reading.sectionClientWidth + 1,
  );
}

for (const snap of ["half", "full"] as const) {
  test(`SPEC-ADDON-152 I1 I10 — at the ${snap} snap the sheet scrolls the list, the ruler stays under the sticky top and the card at the bottom (D5)`, async ({
    page,
  }) => {
    let before = await openSheet(page);
    if (snap === "full") before = await toFull(page);
    expectFlow(before, snap);
    expect(before.card, "no card is drawn").not.toBeNull();

    await scrollShared(page, 900);
    const after = await settled(page);

    expectFlow(after, `${snap}, scrolled`);
    expect(after.visibleRows[0]).toBeGreaterThan(before.visibleRows[0]);
    expect(after.ruler.top).toBeCloseTo(before.ruler.top, 0);
    expect(after.ruler.top).toBeGreaterThanOrEqual(
      after.host.box.top + after.stickyTop - 0.5,
    );
    expect(after.card!.bottom).toBeLessThanOrEqual(after.host.box.bottom + 0.5);
    expect(after.card!.top).toBeCloseTo(before.card!.top, 0);
    expect(after.cardText.length).toBeGreaterThan(0);
  });
}

test("SPEC-ADDON-152 I10 — the action row comes after the last tile and scrolls with the list (D5)", async ({
  page,
}) => {
  const opened = await openSheet(page);
  expectFlow(opened, "half");
  await scrollShared(page, 1_000_000);
  const end = await settled(page);
  expect(end.action).not.toBeNull();
  expect(end.action!.top).toBeGreaterThanOrEqual(end.lastTile.bottom - 0.5);
});

test("SPEC-ADDON-152 I5 — in the sheet the card is one line", async ({ page }) => {
  const reading = await openSheet(page);
  expectFlow(reading, "half");
  expect(reading.card).not.toBeNull();
  expect(reading.card!.height).toBeLessThan(7.6 * 16 / 2);
});

test("SPEC-ADDON-152 I3 — a vertical swipe that starts on the pinned ruler stops following", async ({
  page,
}) => {
  const opened = await openSheet(page);
  expectFlow(opened, "half");
  expect(opened.chip).toBeNull();
  const x = (opened.ruler.left + opened.ruler.right) / 2;
  const y = (opened.ruler.top + opened.ruler.bottom) / 2;

  await swipe(page, { x, y }, { x, y: y - 200 });
  const after = await settled(page);

  expect(after.chip, `no "${CHIP}" chip`).not.toBeNull();
  expect(after.rulerNow, "no ruler point: the card is at the top row").toBe(
    after.rowFirstFrame[after.visibleRows[0]] * PAGE_STEP,
  );
});

test("SPEC-ADDON-152 I3 — a vertical swipe that starts on the pinned card stops following", async ({
  page,
}) => {
  const opened = await openSheet(page);
  expectFlow(opened, "half");
  expect(opened.card).not.toBeNull();
  const x = (opened.card!.left + opened.card!.right) / 2;
  const y = (opened.card!.top + opened.card!.bottom) / 2;

  await swipe(page, { x, y }, { x, y: y - 200 });
  const after = await settled(page);

  expect(after.chip, `no "${CHIP}" chip`).not.toBeNull();
});

test("SPEC-ADDON-152 I3 — a wheel over the pinned ruler stops following", async ({ page }) => {
  const opened = await openSheet(page);
  expectFlow(opened, "half");
  const x = (opened.ruler.left + opened.ruler.right) / 2;
  const y = (opened.ruler.top + opened.ruler.bottom) / 2;

  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 400);
  const after = await readList(page);

  expect(after.chip, `no "${CHIP}" chip`).not.toBeNull();
});

test("SPEC-ADDON-153 I9 — a touch drag on the ruler places its row; a pointercancel after 8 px puts back the scroll position, following and the ruler point", async ({
  page,
}) => {
  const opened = await openSheet(page);
  expectFlow(opened, "half");
  expect(opened.chip).toBeNull();
  const y = (opened.ruler.top + opened.ruler.bottom) / 2;
  const at = (fraction: number) =>
    Math.round(opened.ruler.left + (opened.ruler.right - opened.ruler.left) * fraction);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: at(0.1), y: Math.round(y) }],
  });
  for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
    await page.waitForTimeout(30);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: at(fraction), y: Math.round(y) }],
    });
  }
  const dragged = await settled(page);
  expect(dragged.visibleRows[0], "the drag placed its row").toBeGreaterThan(
    opened.visibleRows[0],
  );
  expect(dragged.rulerNow).not.toBe(opened.rulerNow);

  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await cdp.detach();
  const cancelled = await settled(page);

  expect(cancelled.visibleRows).toEqual(opened.visibleRows);
  expect(cancelled.rulerNow).toBe(opened.rulerNow);
  expect(cancelled.chip).toBeNull();
});
