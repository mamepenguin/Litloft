/**
 * One gesture moves the scroller or the sheet, and never both.
 *
 * The real `MobileInspectorSheet` — vaul, `handleOnly`, the pull hook and
 * the browser's own touch scrolling — driven by a synthesized touch
 * gesture, because that claim is not expressible anywhere else here:
 *
 * - `sheetPullGesture.test.ts` decides who owns a gesture, from numbers a
 *   caller hands it. jsdom lays nothing out, so it can never produce one:
 *   `scrollTop` is whatever the test wrote and `preventDefault()` cancels
 *   a scroll that never started.
 * - `e2e-layout/mobile-inspector-sheet.spec.ts` measures where the boxes
 *   land in a real browser, but off `file://` with hand-written markup —
 *   no component runs in it, so nothing there can be dragged.
 *
 * ## `Input.synthesizeScrollGesture`, and not `dispatchTouchEvent`
 *
 * Both run Chromium's gesture recognizer and both really scroll — a
 * hand-built `dispatchTouchEvent` sequence on this fixture scrolls
 * *further* than the finger travelled, because the recognizer adds a
 * fling. What `synthesizeScrollGesture` buys is control of the two things
 * every case here depends on:
 *
 * - **`preventFling: true`**, so a reading taken after the gesture is of
 *   a scroller that has stopped rather than one still coasting;
 * - **`speed`**, in px/s, which is the input the dismiss *velocity* is
 *   read from. Hand-dispatched moves carry whatever the test runner's
 *   scheduling gave them.
 *
 * Whichever API, the scroll has to be real: every case here says either
 * "the sheet did not move" or "the scroller did not move", and both are
 * true of a harness that cannot scroll at all. The first case is the
 * control for exactly that, and that is why it is first — it drags the
 * other way and watches the scroller move.
 *
 * The cost is that a gesture cannot be held open, so what happened in the
 * middle of one is read from the fixture's own record of the extremes
 * (`data-max-pull`, `data-max-scroll` — see `useGestureRecord`), both
 * taken off the real elements.
 *
 * What is still hand-written is the sheet's *content*: a box of a
 * declared height, because the inspector needs Next.js, `next-intl` and a
 * backend. That height is the only thing about it a gesture reads
 * (through `scrollHeight`), and both of its cases are drawn.
 *
 * ## What it cannot hold
 *
 * **Chromium only**, like the rest of this target — and two of the
 * mechanisms under test answer a browser that is not it. Deleting either
 * the `preventDefault()` in `useSheetPullToCollapse` or the scroller's
 * `overscroll-contain` leaves every case here green (measured): both
 * exist for iOS Safari's rubber band, which Chromium does not draw on an
 * inner scroller. Each says so where it is written.
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

/** px/s, which is what CDP's `speed` is. */
const FLICK_SPEED = Math.round(SHEET_PULL_DISMISS_VELOCITY * 1000 * 4);
const PUSH_SPEED = Math.round(SHEET_PULL_DISMISS_VELOCITY * 1000 * 0.5);

const SCROLLER = "[data-testid='mobile-inspector-content']";
const SURFACE = "[data-testid='mobile-inspector-surface']";

let navigation = 0;

interface Reading {
  /** The painted surface's top edge, or −1 once the sheet is gone. */
  surfaceTop: number;
  scrollTop: number;
  maxScroll: number;
  /** The furthest the sheet was drawn from its snap, during the gesture. */
  maxPull: number;
  /** The furthest the scroller got, during the gesture. */
  maxScrolled: number;
  /** What the sheet last said it is, or `""` if nothing changed it. */
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

/**
 * Open an arrangement and wait for the sheet to stop moving.
 *
 * vaul animates the drawer up on mount, so a box measured too early is a
 * box mid-animation — and the first draft of this file compared one
 * against a settled one and read the difference as the gesture's.
 */
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
 * One touch gesture down the sheet's scroller.
 *
 * `down` is the finger's direction — the way a reader pushes the sheet
 * away. CDP's `yDistance` is the other sign (negative moves the finger
 * down the screen, which scrolls the content up), and writing that
 * inversion once here keeps every case below readable.
 */
async function swipe(
  page: Page,
  { down, speed }: { down: number; speed: number },
): Promise<void> {
  const box = (await page.locator(SCROLLER).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    xDistance: 0,
    yDistance: down,
    speed,
    gestureSourceType: "touch",
    // No momentum after the finger leaves, so a reading taken afterwards
    // is of a scroller that has stopped rather than one still coasting.
    preventFling: true,
  });
  await cdp.detach();
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  // The settle transition is 200ms; wait it out so "where did it end up"
  // is not read mid-spring.
  await page.waitForTimeout(320);
}

/** Put the scroller somewhere other than its top, before a gesture. */
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
    // More to scroll than any gesture in this file asks for, so no case
    // reaches the end by accident.
    expect(before.maxScroll).toBeGreaterThan(1000);

    await swipe(page, { down: -200, speed: 800 });

    const after = await read(page);
    // The control: a harness that cannot deliver a scroll passes every
    // other case in this file, and fails this one.
    expect(after.scrollTop).toBeGreaterThan(150);
    expect(after.maxPull).toBe(0);
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
    expect(after.state).toBe("");
  });

  test("pushing down from the top moves the sheet, and the scroller does not move at all", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");

    // Short of the dismiss distance, so the sheet is still there to be
    // asked about afterwards.
    await swipe(page, { down: SHEET_PULL_DISMISS_PX - 20, speed: PUSH_SPEED });

    const after = await read(page);
    expect(after.maxPull).toBeGreaterThan(20);
    // The scroller stayed where it was — **and that half is true by
    // construction here, not by measurement.** The sheet only ever takes
    // a gesture that began at the scroller's top going down, so there was
    // no scroll for it to perform in that direction; deleting the
    // `preventDefault()` that refuses one leaves this green. The half of
    // "never both" that can fail is the other one, in the case above.
    expect(after.maxScrolled).toBe(0);
    expect(after.scrollTop).toBe(0);
  });
});

test.describe("what collapses the sheet", () => {
  test("a slow push from the top, past the dismiss distance", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");
    await swipe(page, { down: SHEET_PULL_DISMISS_PX + 60, speed: PUSH_SPEED });

    const after = await read(page);
    expect(after.state).toBe("peek");
    // True by construction, as at `:214` — the gesture began at the
    // scroller's top going down, so there was no scroll to perform. Kept
    // because it is the shape of the claim, marked because it is not the
    // evidence for it.
    expect(after.maxScrolled).toBe(0);
  });

  test("a flick from the top, at a distance the slow push springs back from", async ({
    page,
  }) => {
    // The pair that gives the velocity term something to mean: same
    // distance as "stops short" below, released fast instead of slow.
    await open(page, "sheet-gesture");
    await swipe(page, { down: SHEET_PULL_DISMISS_PX - 20, speed: FLICK_SPEED });

    expect((await read(page)).state).toBe("peek");
  });

  test("a sheet with nothing to scroll, pushed down", async ({ page }) => {
    await open(page, "sheet-gesture-short");
    expect((await read(page)).maxScroll).toBe(0);

    await swipe(page, { down: SHEET_PULL_DISMISS_PX + 60, speed: PUSH_SPEED });

    expect((await read(page)).state).toBe("peek");
  });

  test("scrolling to the top without lifting, then pushing on", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");
    await scrollTo(page, 120);

    // One gesture: 120px of it is answered by scrolling to the top, and
    // what is left is the handoff plus a clear run past the dismiss
    // distance. "A clear run" and not "one pixel past": the sheet takes
    // the gesture at the handoff point, so the travel is the remainder,
    // and a remainder sitting exactly on the threshold would make the
    // assertion below a coin toss on rounding.
    await swipe(page, {
      down: 120 + SHEET_PULL_HANDOFF_PX + SHEET_PULL_DISMISS_PX * 2,
      speed: PUSH_SPEED,
    });

    const after = await read(page);
    expect(after.state).toBe("peek");
    // And it was the distance that earned it, not the speed: `PUSH_SPEED`
    // is half the dismiss velocity.
    expect(after.maxPull).toBeGreaterThan(SHEET_PULL_DISMISS_PX);
  });
});

test.describe("what leaves the sheet where it was", () => {
  test("a slow push from the top that stops short", async ({ page }) => {
    await open(page, "sheet-gesture");
    const before = await read(page);

    await swipe(page, { down: SHEET_PULL_DISMISS_PX - 20, speed: PUSH_SPEED });

    const after = await read(page);
    expect(after.state).toBe("");
    // Back where it started, rather than left part-way down.
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
  });

  test("a hard flick that only reaches the top on the way out", async ({
    page,
  }) => {
    await open(page, "sheet-gesture");
    await scrollTo(page, 400);
    const before = await read(page);

    // Fast, and only a little further than there is scroll to answer it:
    // the scroller arrives at the top as the finger leaves, so nothing is
    // pushed past it and the sheet is never handed the gesture.
    await swipe(page, {
      down: 400 + SHEET_PULL_HANDOFF_PX - 8,
      speed: FLICK_SPEED,
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
    // The sheet moves between its states from the knob alone. Before
    // `handleOnly`, vaul read this same gesture as a drag on the sheet
    // whenever the scroller happened to be at its top.
    await open(page, "sheet-gesture");
    const before = await read(page);

    await swipe(page, { down: -120, speed: PUSH_SPEED });

    const after = await read(page);
    expect(after.maxPull).toBe(0);
    expect(after.surfaceTop).toBeCloseTo(before.surfaceTop, 0);
    expect(after.state).toBe("");
  });
});
