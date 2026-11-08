/**
 * SPEC-ADDON-080 I6: in the inspector's full-height layout, a thread taller
 * than the panel scrolls above a question box that stays at the bottom in
 * view. jsdom lays nothing out, so this is measured in a real browser.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

test("the question box stays at the bottom while the thread scrolls above it", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}#ask-thread`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "ask-thread",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-thread-ready",
    "1",
  );

  const panel = await page.locator("#ask-thread-panel").boundingBox();
  const box = await page.locator("#ask-thread-panel textarea").boundingBox();
  expect(panel).not.toBeNull();
  expect(box).not.toBeNull();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(panel!.y);
  expect(box!.y + box!.height).toBeLessThanOrEqual(
    panel!.y + panel!.height + 1,
  );
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  const scroller = page
    .locator("#ask-thread-panel .overflow-y-auto")
    .first();
  const scrollerBox = await scroller.boundingBox();
  const form = await page.locator("#ask-thread-panel form").boundingBox();
  expect(scrollerBox).not.toBeNull();
  expect(form).not.toBeNull();

  // The form is below the turns, and its bottom edge is the panel's.
  expect(box!.y).toBeGreaterThanOrEqual(
    scrollerBox!.y + scrollerBox!.height - 1,
  );
  expect(form!.y + form!.height).toBeGreaterThanOrEqual(
    panel!.y + panel!.height - 2,
  );
  expect(form!.y + form!.height).toBeLessThanOrEqual(
    panel!.y + panel!.height + 1,
  );

  const metrics = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  const atTop = await page.locator("#ask-thread-panel textarea").boundingBox();
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const atBottom = await page.locator("#ask-thread-panel textarea").boundingBox();

  expect(atTop!.y).toBeCloseTo(box!.y, 0);
  expect(atBottom!.y).toBeCloseTo(box!.y, 0);
  expect(atBottom!.y + atBottom!.height).toBeLessThanOrEqual(
    panel!.y + panel!.height + 1,
  );
});
