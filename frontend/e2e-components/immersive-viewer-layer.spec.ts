/**
 * Pixels rather than `elementFromPoint`: the viewer makes the page inert, and
 * an inert element is skipped by hit testing while it still paints on top.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

async function open(page: Page): Promise<void> {
  await page.goto(`${FIXTURE}#archive-viewer-in-player`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "archive-viewer-in-player",
  );
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function brightnessAt(page: Page, x: number, y: number): Promise<number> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const { data } = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return { data: Array.from(ctx.getImageData(0, 0, 1, 1).data) };
  }, png.toString("base64"));
  return (data[0] + data[1] + data[2]) / 3;
}

test("an archive viewer opened in the player box paints over the page header", async ({
  page,
}) => {
  await open(page);
  const header = await page.locator("#page-header").boundingBox();
  // The viewer's top bar is a black gradient; the header is the light page
  // colour. A left-edge point misses the bar's text.
  expect(
    await brightnessAt(page, 2, header!.y + header!.height / 2),
  ).toBeLessThan(64);
});

test("an archive viewer opened in the player box paints over the resting strip", async ({
  page,
}) => {
  await open(page);
  const strip = await page.locator("#resting-strip").boundingBox();
  expect(
    await brightnessAt(page, 2, strip!.y + strip!.height / 2),
  ).toBeLessThan(64);
});
