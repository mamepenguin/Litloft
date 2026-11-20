/**
 * The flow form in Chromium with a coarse pointer: a horizontal touch drag on
 * the pinned ruler keeps its ruler point, and a vertical swipe the browser
 * takes over is still a reader's scroll.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  BOUNDED_STEP,
  CHIP,
  settled,
  type ListReading,
} from "./scenes-scroll-list.cases";

const FIXTURE = pathToFileURL(PAGE).href;
const FLOW = "#scenes-flow";
const FRAMES = 500;

let navigation = 0;

async function openFlow(page: Page): Promise<ListReading> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${FIXTURE}?run=${++navigation}${FLOW}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "scenes-flow",
  );
  await expect(page.getByRole("slider", { name: "Frame timeline" })).toBeVisible();
  await expect(page.locator("button[data-scene-tile]").first()).toBeVisible();
  await expect(
    page.locator('[data-testid="scenes-visual-placeholder"]'),
  ).toHaveCount(0);
  return settled(page, BOUNDED_STEP);
}

function at(reading: ListReading, fraction: number): number {
  return Math.round(
    reading.ruler.left + (reading.ruler.right - reading.ruler.left) * fraction,
  );
}

/** A frame index under a fraction of the ruler, from the fixture's 30 s frames. */
function frameAt(reading: ListReading, fraction: number): number {
  const time = fraction * reading.rulerMax;
  return Math.min(Math.floor(time / BOUNDED_STEP), FRAMES - 1) * BOUNDED_STEP;
}

/** The frames whose tiles carry a drawn outline. */
async function outlinedFrames(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("button[data-scene-tile]"))
      .map((tile) => {
        const span = tile.firstElementChild as HTMLElement | null;
        if (!span) return null;
        const style = getComputedStyle(span);
        if (style.outlineStyle === "none" || style.outlineWidth === "0px") {
          return null;
        }
        const label = (tile.getAttribute("aria-label") ?? "").replace(
          /^Play from /,
          "",
        );
        return label
          .split(":")
          .reduce((total, part) => total * 60 + Number(part), 0);
      })
      .filter((frame): frame is number => frame !== null),
  );
}

async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
): Promise<void> {
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

test("a horizontal touch drag along the ruler keeps its ruler point and its row's tile outlined", async ({
  page,
}) => {
  const opened = await openFlow(page);
  expect(opened.chip).toBeNull();
  const y = (opened.ruler.top + opened.ruler.bottom) / 2;
  const expected = frameAt(opened, 0.8);

  await touchDrag(
    page,
    { x: at(opened, 0.1), y },
    { x: at(opened, 0.8), y },
    8,
  );
  const after = await settled(page, BOUNDED_STEP);

  expect(after.rulerNow, "the dragged frame is the ruler point").toBe(expected);
  expect(after.chip, `no "${CHIP}" chip after a ruler drag`).not.toBeNull();
  expect(await outlinedFrames(page), "the dragged frame's tile is outlined").toContain(
    expected,
  );
  expect(after.visibleRows[0], "the drag placed its row").toBeGreaterThan(
    opened.visibleRows[0],
  );
});

test("a vertical swipe starting on the pinned ruler is still a reader's scroll", async ({
  page,
}) => {
  const opened = await openFlow(page);
  expect(opened.chip).toBeNull();
  const x = (opened.ruler.left + opened.ruler.right) / 2;
  const y = (opened.ruler.top + opened.ruler.bottom) / 2;

  await touchDrag(page, { x, y }, { x, y: y - 200 }, 12);
  const after = await settled(page, BOUNDED_STEP);

  expect(after.chip, `no "${CHIP}" chip after a vertical swipe`).not.toBeNull();
  expect(after.rulerNow, "no ruler point: the card is at the top row").toBe(
    after.rowFirstFrame[after.visibleRows[0]] * BOUNDED_STEP,
  );
});
