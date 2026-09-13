/**
 * One gesture moves the scroller or the sheet, and never both.
 *
 * Both "the sheet did not move" and "the scroller did not move" are true of
 * a harness that cannot scroll at all, so the first case drags the other
 * way and watches the scroller move.
 *
 * A dispatched gesture cannot be held open, so what happened in the middle
 * of one is read from the fixture's record of the extremes.
 *
 * Deleting the `preventDefault()` in `useSheetPullToCollapse` or the
 * scroller's `overscroll-contain` leaves every case green: both exist for
 * iOS Safari's rubber band, which Chromium does not draw.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  SHEET_PULL_DISMISS_PX,
  SHEET_PULL_DISMISS_VELOCITY,
  SHEET_PULL_HANDOFF_PX,
} from "../src/lib/sheetPullGesture";

const FIXTURE = pathToFileURL(PAGE).href;

/**
 * The hook reads the release velocity from the moves' timestamps, so the
 * gap is the input: a push is a third of the dismiss velocity, and a flick
 * is as fast as a CDP round trip allows.
 */
const STEP_PX = 20;
const PUSH = { gapMs: Math.round(STEP_PX / (SHEET_PULL_DISMISS_VELOCITY / 3)) };
const FLICK = { gapMs: 0 };

const stepsFor = (down: number) =>
  Math.max(2, Math.round(Math.abs(down) / STEP_PX));

const SCROLLER = "[data-testid='mobile-inspector-content']";
const SURFACE = "[data-testid='mobile-inspector-surface']";

let navigation = 0;

interface Reading {
  /** −1 once the sheet is gone. */
  surfaceTop: number;
  scrollTop: number;
  maxScroll: number;
  maxPull: number;
  maxScrolled: number;
  /** `""` if nothing changed it. */
  state: string;
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate(
    ([surfaceSel, scrollerSel]) => {
      const surface = document.querySelector(surfaceSel);
      const scroller = document.querySelector(scrollerSel);
      return {
        surfaceTop: surface ? surface.getBoundingClientRect().top : -1,
        scrollTop: scroller ? scroller.scrollTop : -1,
        maxScroll: scroller
          ? scroller.scrollHeight - scroller.clientHeight
          : -1,
        maxPull: Number(document.body.dataset.maxPull ?? -1),
        maxScrolled: Number(document.body.dataset.maxScroll ?? -1),
        state: document.body.dataset.sheetState ?? "",
      };
    },
    [SURFACE, SCROLLER],
  );
}

/** vaul animates the drawer up on mount, so wait for it to stop moving. */
async function open(page: Page, arrangement: string): Promise<void> {
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  await expect
    .poll(async () => {
      const first = (await read(page)).surfaceTop;
      await page.waitForTimeout(120);
      return (await read(page)).surfaceTop === first ? "still" : "moving";
    })
    .toBe("still");
}

/**
 * `down` is the finger's own direction — positive pushes the sheet away.
 *
 * `Input.dispatchTouchEvent`, not `Input.synthesizeScrollGesture`: a
 * headless Linux runner with no GPU has no compositor to synthesize
 * gestures through, and the synthesized one delivers nothing there. The
 * cost is the fling, which cannot be prevented, so readings wait for the
 * scroller to stop.
 */
async function swipe(
  page: Page,
  { down, steps, gapMs }: { down: number; steps: number; gapMs: number },
): Promise<void> {
  const box = (await page.locator(SCROLLER).boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y0 = Math.round(box.y + box.height / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: y0 }],
  });
  for (let step = 1; step <= steps; step += 1) {
    if (gapMs > 0) await page.waitForTimeout(gapMs);
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

  // Wait for the fling and the spring-back to finish: two consecutive
  // equal readings of both.
  let last = "";
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(
          ([surfaceSel, scrollerSel]) => {
            const surface = document.querySelector(surfaceSel);
            const scroller = document.querySelector(scrollerSel);
            return `${surface ? Math.round(surface.getBoundingClientRect().top) : -1}/${
              scroller ? Math.round(scroller.scrollTop) : -1
            }`;
          },
          [SURFACE, SCROLLER],
        );
        const settled = now === last;
        last = now;
        return settled ? "still" : "moving";
      },
      { intervals: [120, 120, 120, 120, 120, 120, 120, 120] },
    )
    .toBe("still");
}

async function scrollTo(page: Page, to: number): Promise<void> {
  await page.evaluate(
    ([sel, value]) => {
      document.querySelector(sel as string)!.scrollTop = value as number;
    },
    [SCROLLER, to] as const,
  );
  expect((await read(page)).scrollTop).toBe(to);
}

test.describe("one gesture moves one thing", () => {
  test("dragging up scrolls the content, and the sheet does not move at all", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");
    const before = await read(page);
    expect(before.maxScroll).toBeGreaterThan(1000);

    await swipe(page, { down: -200, steps: stepsFor(200), ...FLICK });

    const after = await read(page);
    // A harness that cannot deliver a scroll passes every other case in
    // this file, and fails this one.
    expect(after.scrollTop).toBeGreaterThan(150);
    expect(after.maxPull).toBe(0);
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
    expect(after.state).toBe("");
  });

  test("pushing down from the top moves the sheet, and the scroller does not move at all", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");

    await swipe(page, {
      down: SHEET_PULL_DISMISS_PX - 20,
      steps: stepsFor(SHEET_PULL_DISMISS_PX - 20),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.maxPull).toBeGreaterThan(20);
    // True by construction: a gesture that began at the scroller's top
    // going down had no scroll to perform.
    expect(after.maxScrolled).toBe(0);
    expect(after.scrollTop).toBe(0);
  });
});

test.describe("what collapses the sheet", () => {
  test("a slow push from the top, past the dismiss distance", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");
    await swipe(page, {
      down: SHEET_PULL_DISMISS_PX + 60,
      steps: stepsFor(SHEET_PULL_DISMISS_PX + 60),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("peek");
    expect(after.maxScrolled).toBe(0);
  });

  test("a flick from the top, at a distance the slow push springs back from", async ({
    page,
  }) => {
    // Same distance as "stops short" below, released fast instead of slow.
    await open(page, "sheet-gesture");
    await swipe(page, {
      down: SHEET_PULL_DISMISS_PX - 20,
      steps: stepsFor(SHEET_PULL_DISMISS_PX - 20),
      ...FLICK,
    });

    expect((await read(page)).state).toBe("peek");
  });

  test("a sheet with nothing to scroll, pushed down", async ({ page }) => {
    await open(page, "sheet-gesture-short");
    expect((await read(page)).maxScroll).toBe(0);

    await swipe(page, {
      down: SHEET_PULL_DISMISS_PX + 60,
      steps: stepsFor(SHEET_PULL_DISMISS_PX + 60),
      ...PUSH,
    });

    expect((await read(page)).state).toBe("peek");
  });

  test("scrolling to the top without lifting, then pushing on", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");
    await scrollTo(page, 120);

    // A clear run past the dismiss distance rather than one pixel past: a
    // remainder sitting on the threshold would be a coin toss on rounding.
    await swipe(page, {
      down: 120 + SHEET_PULL_HANDOFF_PX + SHEET_PULL_DISMISS_PX * 2,
      steps: stepsFor(120 + SHEET_PULL_HANDOFF_PX + SHEET_PULL_DISMISS_PX * 2),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("peek");
    expect(after.maxPull).toBeGreaterThan(SHEET_PULL_DISMISS_PX);
  });
});

test.describe("what leaves the sheet where it was", () => {
  test("a slow push from the top that stops short", async ({ page }) => {
    await open(page, "sheet-gesture");
    const before = await read(page);

    await swipe(page, {
      down: SHEET_PULL_DISMISS_PX - 20,
      steps: stepsFor(SHEET_PULL_DISMISS_PX - 20),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("");
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
  });

  test("a hard flick that only reaches the top on the way out", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");
    await scrollTo(page, 400);
    const before = await read(page);

    // Only a little further than there is scroll: the scroller arrives at
    // the top as the finger leaves, so the sheet is never handed the gesture.
    await swipe(page, {
      down: 400 + SHEET_PULL_HANDOFF_PX - 8,
      steps: stepsFor(400 + SHEET_PULL_HANDOFF_PX - 8),
      ...FLICK,
    });

    const after = await read(page);
    expect(after.state).toBe("");
    expect(after.maxPull).toBe(0);
    expect(after.scrollTop).toBe(0);
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
  });

  test("dragging the content upward, which is the knob's job and not the content's", async ({
    page,
  }) => {
    // Without `handleOnly`, vaul reads this gesture as a drag on the sheet
    // whenever the scroller is at its top.
    await open(page, "sheet-gesture");
    const before = await read(page);

    await swipe(page, { down: -120, steps: stepsFor(120), ...PUSH });

    const after = await read(page);
    expect(after.maxPull).toBe(0);
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
    expect(after.state).toBe("");
  });
});
