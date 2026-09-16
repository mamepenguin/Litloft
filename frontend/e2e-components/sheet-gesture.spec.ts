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
const KNOB = "[data-vaul-handle]";

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
  /** `NaN` until it collapses. */
  surfaceTopAtCollapse: number;
  viewportHeight: number;
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
        surfaceTopAtCollapse: Number(
          document.body.dataset.surfaceTopAtCollapse || NaN,
        ),
        viewportHeight: window.innerHeight,
      };
    },
    [SURFACE, SCROLLER],
  );
}

/**
 * A third of the sheet still on screen, rounded up so a run of exactly
 * this length is past it.
 */
async function dismissPx(page: Page): Promise<number> {
  const { surfaceTop, viewportHeight } = await read(page);
  return Math.ceil((viewportHeight - surfaceTop) / 3);
}

/** vaul animates the drawer up on mount, so wait for it to stop moving. */
async function open(page: Page, arrangement: string): Promise<number> {
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
  return dismissPx(page);
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
  {
    down,
    steps,
    gapMs,
    from = SCROLLER,
    wait = true,
  }: {
    down: number;
    steps: number;
    gapMs: number;
    from?: string;
    /** `false` returns as the finger lifts, with the sheet still moving. */
    wait?: boolean;
  },
): Promise<void> {
  const box = (await page.locator(from).boundingBox())!;
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
  if (!wait) return;

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
    const dismiss = await open(page, "sheet-gesture");

    await swipe(page, {
      down: dismiss - 20,
      steps: stepsFor(dismiss - 20),
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
    const dismiss = await open(page, "sheet-gesture");
    await swipe(page, {
      down: dismiss + 60,
      steps: stepsFor(dismiss + 60),
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
    const dismiss = await open(page, "sheet-gesture");
    await swipe(page, {
      down: dismiss - 20,
      steps: stepsFor(dismiss - 20),
      ...FLICK,
    });

    expect((await read(page)).state).toBe("peek");
  });

  test("a sheet with nothing to scroll, pushed down", async ({ page }) => {
    const dismiss = await open(page, "sheet-gesture-short");
    expect((await read(page)).maxScroll).toBe(0);

    await swipe(page, {
      down: dismiss + 60,
      steps: stepsFor(dismiss + 60),
      ...PUSH,
    });

    expect((await read(page)).state).toBe("peek");
  });

  test("scrolling to the top without lifting, then pushing on", async ({
    page,
  }) => {
    const dismiss = await open(page, "sheet-gesture");
    await scrollTo(page, 120);

    // A clear run past the dismiss distance rather than one pixel past: a
    // remainder sitting on the threshold would be a coin toss on rounding.
    await swipe(page, {
      down: 120 + SHEET_PULL_HANDOFF_PX + dismiss * 2,
      steps: stepsFor(120 + SHEET_PULL_HANDOFF_PX + dismiss * 2),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("peek");
    expect(after.maxPull).toBeGreaterThan(dismiss);
  });
});

test.describe("what leaves the sheet where it was", () => {
  test("a slow push from the top that stops short", async ({ page }) => {
    const dismiss = await open(page, "sheet-gesture");
    const before = await read(page);

    await swipe(page, {
      down: dismiss - 20,
      steps: stepsFor(dismiss - 20),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("");
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
  });

  test("a slow push past a quarter of the sheet but short of a third", async ({
    page,
  }) => {
    // Far enough apart that the threshold must be measured at rest: one
    // re-measured under the finger has shrunk to a quarter by now.
    await open(page, "sheet-gesture");
    const { surfaceTop, viewportHeight } = await read(page);
    const down = Math.floor((viewportHeight - surfaceTop) * 0.3);

    await swipe(page, { down, steps: stepsFor(down), ...PUSH });

    expect((await read(page)).state).toBe("");
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

test.describe("how the sheet leaves", () => {
  /** A pixel of rounding either way. */
  const offScreen = (reading: Reading) =>
    expect(reading.surfaceTopAtCollapse).toBeGreaterThanOrEqual(
      reading.viewportHeight - 1,
    );

  test("a slow push slides it off the screen before it collapses", async ({
    page,
  }) => {
    const dismiss = await open(page, "sheet-gesture");
    await swipe(page, {
      down: dismiss + 20,
      steps: stepsFor(dismiss + 20),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("peek");
    offScreen(after);
  });

  test("a flick slides it off the screen before it collapses", async ({
    page,
  }) => {
    const dismiss = await open(page, "sheet-gesture");
    await swipe(page, {
      down: dismiss - 20,
      steps: stepsFor(dismiss - 20),
      ...FLICK,
    });

    const after = await read(page);
    expect(after.state).toBe("peek");
    offScreen(after);
  });

  test("closing while it springs back still slides it off the screen", async ({
    page,
  }) => {
    const dismiss = await open(page, "sheet-gesture");
    await swipe(page, {
      down: dismiss - 20,
      steps: stepsFor(dismiss - 20),
      ...PUSH,
      wait: false,
    });
    await page.keyboard.press("Escape");

    await expect(page.locator("body")).toHaveAttribute(
      "data-sheet-state",
      "peek",
    );
    offScreen(await read(page));
  });

});

test.describe("the page behind the raised sheet", () => {
  test("takes a tap, and the sheet stays where it is", async ({ page }) => {
    await open(page, "sheet-gesture");
    const before = await read(page);
    await page.locator("#underneath").tap({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(600);

    expect(
      await page.evaluate(() => ({
        clicks: (document.getElementById("underneath") as HTMLElement).dataset
          .clicks,
        hidden: document.querySelector("[aria-hidden='true'] #underneath"),
        pointerEvents: document.body.style.pointerEvents,
      })),
    ).toEqual({ clicks: "1", hidden: null, pointerEvents: "auto" });
    const after = await read(page);
    expect(after.state).toBe("");
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
  });

  test("is covered by an overlay sidebar opened over it", async ({ page }) => {
    await open(page, "sheet-under-sidebar");
    const hit = await page.evaluate(() => {
      const top = document
        .querySelector("[data-testid='mobile-inspector-content']")!
        .getBoundingClientRect().top;
      const at = (x: number) =>
        document.elementFromPoint(x, top + 40)?.id ?? "";
      return { underPanel: at(40), besidePanel: at(window.innerWidth - 20) };
    });
    expect(hit).toEqual({
      underPanel: "sidebar",
      besidePanel: "sidebar-backdrop",
    });
  });
});

test.describe("dragging the knob down", () => {
  test("past a third of the sheet, it leaves instead of springing back to half", async ({
    page,
  }) => {
    const dismiss = await open(page, "sheet-gesture");
    await swipe(page, {
      from: KNOB,
      down: dismiss + 20,
      steps: stepsFor(dismiss + 20),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("peek");
    expect(after.surfaceTopAtCollapse).toBeGreaterThanOrEqual(
      after.viewportHeight - 1,
    );
  });

  test("closing while it springs back to half still slides it off the screen", async ({
    page,
  }) => {
    const dismiss = await open(page, "sheet-gesture");
    await swipe(page, {
      from: KNOB,
      down: dismiss - 30,
      steps: stepsFor(dismiss - 30),
      ...PUSH,
      wait: false,
    });
    // Where the sheet was when the close arrived, and the highest it went
    // after: frozen, it only ever moves down from there.
    await page.evaluate((surfaceSel) => {
      const top = () =>
        document.querySelector(surfaceSel)?.getBoundingClientRect().top;
      // On the window, which hears the key before the dialog's own
      // listener on the document closes the sheet.
      window.addEventListener(
        "keydown",
        () => {
          const record = { atClose: top() ?? NaN, highest: top() ?? NaN };
          (window as unknown as { closeRecord: typeof record }).closeRecord =
            record;
          const sample = () => {
            const now = top();
            if (now === undefined) return;
            record.highest = Math.min(record.highest, now);
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        },
        { capture: true, once: true },
      );
    }, SURFACE);
    await page.keyboard.press("Escape");

    await expect(page.locator("body")).toHaveAttribute(
      "data-sheet-state",
      "peek",
    );
    const after = await read(page);
    expect(after.surfaceTopAtCollapse).toBeGreaterThanOrEqual(
      after.viewportHeight - 1,
    );
    const record = await page.evaluate(
      () =>
        (window as unknown as { closeRecord: { atClose: number; highest: number } })
          .closeRecord,
    );
    expect(record.highest).toBeGreaterThanOrEqual(record.atClose - 1);
  });

  test("short of a third, it springs back to half", async ({ page }) => {
    const dismiss = await open(page, "sheet-gesture");
    const before = await read(page);
    await swipe(page, {
      from: KNOB,
      down: dismiss - 30,
      steps: stepsFor(dismiss - 30),
      ...PUSH,
    });

    const after = await read(page);
    expect(after.state).toBe("");
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
  });
});
