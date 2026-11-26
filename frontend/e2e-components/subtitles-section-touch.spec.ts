/**
 * The Subtitles list is an inspector section on a phone too: two 44px row
 * controls on a coarse pointer, and nothing that scrolls sideways at 375px.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const TOUCH_TARGET = 44;

test.beforeEach(async ({ page }) => {
  await page.goto(`${FIXTURE}?arrangement=subtitles-section-phone`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "subtitles-section-phone",
  );
  await expect(page.getByText("The Long Night.ja.srt")).toBeVisible();
});

test("two rows fit 375px without sideways scroll and their buttons reach 44px", async ({
  page,
}) => {
  const host = page.getByTestId("subtitles-host");
  const widths = await host.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);

  const buttons = await host.locator("li button").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  expect(buttons).toHaveLength(4);
  for (const box of buttons) {
    expect(box.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
    expect(box.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
  }
});

test("a row on a coarse pointer is the 44px controls plus 4px above and below", async ({
  page,
}) => {
  const heights = await page
    .getByTestId("subtitles-host")
    .locator("li")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
  expect(heights).toHaveLength(2);
  for (const height of heights) {
    expect(height).toBeLessThanOrEqual(TOUCH_TARGET + 8);
  }
});
