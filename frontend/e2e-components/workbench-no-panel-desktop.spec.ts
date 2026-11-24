/**
 * The workbench with no panel on: jsdom cannot show that nothing is drawn
 * under the toggle row, so the area is measured in a real browser.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const CANONICAL = "#inspector-video";
const COLLECTION = "#inspector-video-collection";
const AREA = ".media-detail-workbench-grid";

let navigation = 0;

async function open(page: Page, hash: string) {
  await page.addInitScript(() => {
    localStorage.setItem("workbench-panels", "[]");
  });
  await page.goto(`${FIXTURE}?run=${++navigation}${hash}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    hash.slice(1),
  );
  await expect(page.getByRole("group", { name: "Panels" })).toBeVisible();
}

async function areaUnderTheRow(page: Page) {
  return page.locator(AREA).evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    display: getComputedStyle(element).display,
  }));
}

const SURFACES = [
  ["canonical", CANONICAL],
  ["collection", COLLECTION],
] as const;

for (const [surface, hash] of SURFACES) {
  test(`SPEC-CORE-085 I2 the ${surface} surface draws no panel area with no panel on`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, hash);

    const area = await areaUnderTheRow(page);
    expect(area.display).toBe("none");
    expect(area.height).toBe(0);
  });
}
