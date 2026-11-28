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
  await expect(page.getByTestId("mobile-inspector-peek")).not.toBeVisible();
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

  const firstRow = pane.locator("li").first();
  for (const name of ["Move up", "Move down", "Remove"]) {
    const width = await firstRow
      .getByRole("button", { name })
      .evaluate((button) => button.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(44);
  }

  const thumbs = await pane
    .locator('[data-testid="queue-thumb"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }),
    );
  expect(thumbs.length).toBe(3);
  for (const thumb of thumbs) {
    expect(thumb.width).toBe(56);
    expect(thumb.height).toBe(32);
  }

  const titleSizes = await pane
    .locator("li span.truncate")
    .evaluateAll((titles) =>
      titles.map((title) => getComputedStyle(title).fontSize),
    );
  expect(titleSizes.length).toBe(3);
  for (const size of titleSizes) expect(size).toBe("13px");

  const loop = await pane
    .getByRole("button", { name: /^Loop / })
    .evaluate((button) => button.getBoundingClientRect().height);
  expect(loop).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Close the queue" }).click();
  await expect(pane).toHaveCSS("width", "0px");
  expect(await isPlaying(page)).toBe(true);
});

test("SPEC-CORE-193 I9 / D6 (390×844): the open queue covers the file sheet, and closing it brings the sheet back", async ({
  page,
}) => {
  await open(page);

  await page.getByRole("button", { name: "Open the sheet" }).click();
  const sheet = page.getByTestId("mobile-inspector-sheet");
  await expect(sheet).toBeVisible();
  const snap = await sheet.getAttribute("data-snap");

  await play(page);
  await page
    .locator("video")
    .evaluate((element) => ((element as HTMLVideoElement).loop = true));

  await page.getByRole("button", { name: "Show the queue" }).click();
  const pane = page.locator('aside[aria-label="Queue"]');
  await expect(pane).toBeVisible();

  const covered = await page.evaluate(() => {
    const element = document.elementFromPoint(195, 780);
    return element?.closest('aside[aria-label="Queue"]') !== null;
  });
  expect(covered).toBe(true);
  await expect(page.getByTestId("mobile-inspector-peek")).not.toBeVisible();
  await expect(sheet).not.toBeVisible();
  expect(await isPlaying(page)).toBe(true);

  await page.getByRole("button", { name: "Close the queue" }).click();
  await expect(pane).toHaveCSS("width", "0px");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-snap", snap!);
  expect(await isPlaying(page)).toBe(true);
});
