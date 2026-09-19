/**
 * The seek indicator, measured inside a frame that clips it the way a
 * video frame does.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const CORAL = "rgb(214, 48, 49)";
const WHITE = "rgb(255, 255, 255)";

let navigation = 0;

async function open(page: import("@playwright/test").Page, arrangement: string) {
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
}

function backgroundOf(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<string> {
  return page.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel)!).backgroundColor,
    selector,
  );
}

test("the knob stays inside the frame, clear of its bottom edge", async ({
  page,
}) => {
  await open(page, "player-seek-bar");

  const frame = (await page.locator("#player-frame").boundingBox())!;
  const knob = (await page.locator('[data-testid="seek-knob"]').boundingBox())!;

  expect(frame.y + frame.height - (knob.y + knob.height)).toBeCloseTo(4, 1);
});

test("the bar runs through the middle of the knob", async ({ page }) => {
  await open(page, "player-seek-bar");

  const played = (await page
    .locator('[data-testid="played-range"]')
    .boundingBox())!;
  const knob = (await page.locator('[data-testid="seek-knob"]').boundingBox())!;

  expect(knob.y + knob.height / 2).toBeCloseTo(played.y + played.height / 2, 1);
  // The knob is 12px on a 4px track, so it stands 4px out of it either way.
  expect(knob.y).toBeCloseTo(played.y - 4, 1);
  expect(knob.y + knob.height).toBeCloseTo(played.y + played.height + 4, 1);
});

test("the hairline left behind sits on the frame's bottom edge", async ({
  page,
}) => {
  await open(page, "player-hairline");

  const frame = (await page.locator("#player-frame").boundingBox())!;
  const hairline = (await page
    .locator('[data-testid="progress-hairline"]')
    .boundingBox())!;

  expect(hairline.y + hairline.height).toBeCloseTo(frame.y + frame.height, 1);
  expect(await backgroundOf(page, '[data-testid="progress-hairline"]')).toBe(
    "rgba(112, 112, 112, 0.85)",
  );
});

for (const [theme, indicator] of [
  ["light", CORAL],
  ["dark", WHITE],
] as const) {
  test(`in ${theme} the bar, the knob and the hairline are all ${indicator}`, async ({
    page,
  }) => {
    await open(page, "player-seek-bar");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);

    expect(await backgroundOf(page, '[data-testid="played-range"]')).toBe(
      indicator,
    );
    expect(await backgroundOf(page, '[data-testid="seek-knob"]')).toBe(
      indicator,
    );

    await open(page, "player-hairline");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);

    expect(await backgroundOf(page, '[data-testid="hairline-played"]')).toBe(
      indicator,
    );
  });
}
