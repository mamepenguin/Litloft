/**
 * The canvas rule for document viewers, measured against the real stylesheet.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function measure(page: Page, id: string) {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  return page.evaluate(() => {
    const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    const host = box("canvas-host");
    const viewer = box("viewer");
    const below = document.querySelector('[data-testid="below"]') ? box("below") : null;
    const radius = getComputedStyle(document.querySelector('[data-testid="viewer"]')!).borderTopLeftRadius;
    return { host, viewer, below, radius };
  });
}

test("a bled viewer spans the canvas from its top edge, square, and what follows keeps the padding", async ({
  page,
}) => {
  const m = await measure(page, "canvas-bleed");
  expect(m.viewer.left).toBe(m.host.left);
  expect(m.viewer.width).toBe(m.host.width);
  expect(m.viewer.top).toBe(m.host.top);
  expect(m.radius).toBe("0px");
  expect(m.below!.left).toBe(m.host.left + 16);
  expect(m.below!.top).toBe(m.viewer.bottom + 16);
  expect(m.host.bottom).toBe(m.below!.bottom + 16);
});

test("a bled viewer with nothing shown below it ends at the canvas's bottom", async ({ page }) => {
  const m = await measure(page, "canvas-bleed-alone");
  expect(m.host.bottom).toBe(m.viewer.bottom);
});

test("a viewer that does not bleed keeps one gap to what follows and the canvas's bottom padding", async ({
  page,
}) => {
  const m = await measure(page, "canvas-no-bleed");
  expect(m.below!.top).toBe(m.viewer.bottom + 16);
  expect(m.host.bottom).toBe(m.below!.bottom + 16);
  const alone = await measure(page, "canvas-no-bleed-alone");
  expect(alone.host.bottom).toBe(alone.viewer.bottom + 16);
});

test("on a phone, where the host has no top padding, a bled viewer starts at its top, not above it", async ({
  page,
}) => {
  const m = await measure(page, "canvas-bleed-phone");
  expect(m.viewer.top).toBe(m.host.top);
  expect(m.viewer.left).toBe(m.host.left);
  expect(m.viewer.width).toBe(m.host.width);
});

test("a viewer that does not bleed keeps the gutter and its card", async ({ page }) => {
  const m = await measure(page, "canvas-no-bleed");
  expect(m.viewer.left).toBe(m.host.left + 16);
  expect(m.viewer.top).toBe(m.host.top + 16);
  expect(m.radius).toBe("12px");
});
