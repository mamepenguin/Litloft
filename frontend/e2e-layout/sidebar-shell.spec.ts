/**
 * The sidebar beside the page at desktop widths and over it below, measured
 * in Chromium. Which state applies is decided in script from the viewport;
 * whether the page makes room is decided by the stylesheet, so the two
 * breakpoints are measured on both sides.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_PATH = resolve(__dirname, "fixtures", "sidebar-shell.html");
const FIXTURE = pathToFileURL(FIXTURE_PATH).href;

const SPEC: { inlineMinWidth: number } = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const SIDEBAR_WIDTH = 240;

type Box = { left: number; right: number; top: number; bottom: number };

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function open(page: Page, state: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  // A hash change keeps the document, and a resize under it would be read
  // mid-transition.
  await page.goto("about:blank");
  await page.goto(`${FIXTURE}#${state}`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate(() => {
    const box = (id: string) => document.getElementById(id)?.getBoundingClientRect() ?? null;
    const aside = box("aside")!;
    const hit = (x: number, y: number) => document.elementFromPoint(x, y)?.id ?? null;
    return {
      aside,
      first: box("first")!,
      scrim: box("scrim"),
      asidePosition: getComputedStyle(document.getElementById("aside")!).position,
      paddingLeft: parseFloat(getComputedStyle(document.getElementById("content")!).paddingLeft),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hitInsideAside: hit(aside.left + aside.width / 2, 100),
      hitOutsideAside: hit(aside.right + (window.innerWidth - aside.right) / 2, 100),
    };
  });
}

test("open at a desktop width, the sidebar sits beside the page", async ({ page }) => {
  const m = await open(page, "inline-open", 1280);
  expect(m.aside.width).toBe(SIDEBAR_WIDTH);
  expect(m.aside.left).toBe(0);
  expect(m.asidePosition).toBe("fixed");
  expect(m.paddingLeft).toBe(SIDEBAR_WIDTH);
  expect(m.first.left).toBeGreaterThanOrEqual(m.aside.right);
  expect(m.first.top).toBeLessThan(m.aside.bottom);
  expect(m.scrim).toBeNull();
});

test("open at a phone width, the sidebar covers the page behind a scrim", async ({ page }) => {
  const m = await open(page, "overlay-open", 375);
  expect(m.aside.left).toBe(0);
  expect(m.asidePosition).toBe("fixed");
  expect(m.paddingLeft).toBe(0);
  expect(overlaps(m.first, m.aside)).toBe(true);
  expect(m.hitInsideAside).toBe("aside");
  expect(m.hitOutsideAside).toBe("scrim");
  expect(m.scrim).toEqual(
    expect.objectContaining({ left: 0, top: 0, width: m.viewport.width, height: m.viewport.height }),
  );
});

test("the page makes room from the inline breakpoint up, and not below it", async ({ page }) => {
  expect((await open(page, "inline-open", SPEC.inlineMinWidth)).paddingLeft).toBe(SIDEBAR_WIDTH);
  expect((await open(page, "inline-open", SPEC.inlineMinWidth - 1)).paddingLeft).toBe(0);
});

for (const width of [375, 1280]) {
  test(`closed at ${width}px, the sidebar is off screen and the page takes the width`, async ({
    page,
  }) => {
    const m = await open(page, "closed", width);
    expect(m.aside.right).toBeLessThanOrEqual(0);
    expect(m.paddingLeft).toBe(0);
    expect(m.first.left).toBe(0);
    expect(m.scrim).toBeNull();
  });
}
