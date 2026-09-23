/**
 * Pinch and pan in the full-screen viewers' frame, with real touch input.
 * jsdom lays nothing out, so where the picture ends up is only measurable here.
 */

import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

async function open(page: Page): Promise<void> {
  await page.goto(`${FIXTURE}#viewer-zoom`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "viewer-zoom");
  await expect
    .poll(() => page.locator("#zoom-picture").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(400);
}

type Touch = { x: number; y: number; id: number };

async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: Touch[],
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
  });
}

async function pinch(page: Page, cx: number, cy: number, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const at = (half: number): Touch[] => [
    { x: cx - half, y: cy, id: 1 },
    { x: cx + half, y: cy, id: 2 },
  ];
  await touch(cdp, "touchStart", at(from / 2));
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", at((from + ((to - from) * i) / steps) / 2));
  }
  await touch(cdp, "touchEnd", []);
}

async function swipe(page: Page, x0: number, x1: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, "touchStart", [{ x: x0, y, id: 1 }]);
  for (let i = 1; i <= 6; i++) {
    await touch(cdp, "touchMove", [{ x: x0 + ((x1 - x0) * i) / 6, y, id: 1 }]);
  }
  await touch(cdp, "touchEnd", []);
}

const picture = (page: Page) => page.locator("#zoom-picture").boundingBox();
const text = (page: Page, id: string) => page.locator(`#${id}`).textContent();

test("a pinch grows the picture about the point between the fingers", async ({ page }) => {
  await open(page);
  const before = (await picture(page))!;
  const frame = (await page.locator("#zoom-frame").boundingBox())!;
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;

  await pinch(page, cx, cy, 100, 200);
  await expect.poll(() => text(page, "settled")).toBe("2");

  const after = (await picture(page))!;
  expect(after.width).toBeCloseTo(before.width * 2, 0);
  // The picture point under the fingers' midpoint stays there.
  const u = (cx - before.x) / before.width;
  expect(after.x + u * after.width).toBeCloseTo(cx, 0);
  expect(await text(page, "toggled")).toBe("0");
  expect(await text(page, "paged")).toBe("0");
});

test("a swipe pans while zoomed and pages at fit", async ({ page }) => {
  await open(page);
  const frame = (await page.locator("#zoom-frame").boundingBox())!;
  const cy = frame.y + frame.height / 2;

  await pinch(page, frame.x + frame.width / 2, cy, 100, 200);
  await expect.poll(() => text(page, "settled")).toBe("2");
  const zoomed = (await picture(page))!;

  await swipe(page, frame.x + frame.width * 0.7, frame.x + frame.width * 0.4, cy);
  expect(await text(page, "paged")).toBe("0");
  const panned = (await picture(page))!;
  expect(panned.x).toBeLessThan(zoomed.x);
  // Never past the picture's own edge.
  expect(panned.x + panned.width).toBeGreaterThanOrEqual(frame.x + frame.width - 0.5);

  await pinch(page, frame.x + frame.width / 2, cy, 200, 50);
  await expect.poll(() => text(page, "settled")).toBe("1");
  await swipe(page, frame.x + frame.width * 0.7, frame.x + frame.width * 0.2, cy);
  await expect.poll(() => text(page, "paged")).toBe("-1");
});

test("a ctrl wheel zooms the picture", async ({ page }) => {
  await open(page);
  const before = (await picture(page))!;
  const frame = (await page.locator("#zoom-frame").boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await picture(page))!.width).toBeGreaterThan(before.width * 1.2);
});

test("a mouse drag at fit does not page", async ({ page }) => {
  await open(page);
  const frame = (await page.locator("#zoom-frame").boundingBox())!;
  const cy = frame.y + frame.height / 2;
  await page.mouse.move(frame.x + frame.width * 0.7, cy);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.3, cy, { steps: 6 });
  await page.mouse.up();
  expect(await text(page, "paged")).toBe("0");
});
