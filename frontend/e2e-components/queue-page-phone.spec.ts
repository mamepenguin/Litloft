/**
 * SPEC-CORE-193 / D6 on a phone: the queue opens over the file page at the
 * viewport's width, its rows and buttons are thumb-sized, and the open video
 * keeps playing through both transitions.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${FIXTURE}?run=${++navigation}#queue-page-overlay`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "queue-page-overlay",
  );
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
}

async function play(page: Page): Promise<void> {
  await page.locator("video").evaluate(async (element) => {
    const video = element as HTMLVideoElement;
    video.muted = true;
    await video.play();
  });
  await expect
    .poll(() =>
      page.locator("video").evaluate((element) => !(element as HTMLVideoElement).paused),
    )
    .toBe(true);
}

const isPlaying = (page: Page) =>
  page
    .locator("video")
    .evaluate((element) => !(element as HTMLVideoElement).paused);

test("SPEC-CORE-193 I9 / D6 (390×844): the queue opens at the viewport's width, with 44px rows and buttons, and the video keeps playing while it opens and closes", async ({
  page,
}) => {
  await open(page);
  await play(page);

  await page.getByRole("button", { name: "Show the queue" }).click();

  const pane = page.locator('aside[aria-label="Queue"]');
  await expect(pane).toBeVisible();
  await expect(pane).toHaveCSS("width", "390px");
  const paneBox = await pane.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { left: r.left, width: r.width };
  });
  expect(paneBox.left).toBe(0);
  expect(paneBox.width).toBe(390);
  expect(await isPlaying(page)).toBe(true);

  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(widths.scrollWidth).toBe(widths.clientWidth);
  expect(widths.clientWidth).toBe(page.viewportSize()!.width);

  const header = await page.locator("header").evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
  expect(header.left).toBe(0);
  expect(header.right).toBeLessThanOrEqual(390.5);

  const controls = await page
    .locator("header button, header a[href]")
    .filter({ visible: true })
    .evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
  for (const control of controls) {
    expect(control.left).toBeGreaterThanOrEqual(-0.5);
    expect(control.right).toBeLessThanOrEqual(390.5);
  }

  const heights = await pane.locator("li").evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().height),
  );
  expect(heights.length).toBe(3);
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);

  const buttonHeights = await pane
    .locator("li button, li a[href]")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
  for (const height of buttonHeights) expect(height).toBeGreaterThanOrEqual(44);

  const loop = await pane
    .getByRole("button", { name: /^Loop / })
    .evaluate((button) => button.getBoundingClientRect().height);
  expect(loop).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Close the queue" }).click();
  await expect(pane).toHaveCSS("width", "0px");
  expect(await isPlaying(page)).toBe(true);
});
