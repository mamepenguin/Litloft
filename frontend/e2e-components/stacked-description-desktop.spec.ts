/**
 * The description in the stacked inspector's Info header. Its width and its
 * clamp are layout properties, so they are measured in a real browser.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const VIDEO = "#inspector-video";
const INFO = "#inspector-panel-info";
const DESCRIPTION = "[data-inspector-header-description]";

const LONG_DESCRIPTION = Array.from(
  { length: 24 },
  (_, i) => `Sentence ${i + 1} of a description that runs well past three lines.`,
).join(" ");

let navigation = 0;

async function open(page: Page) {
  const query = new URLSearchParams({
    run: String(++navigation),
    description: LONG_DESCRIPTION,
  });
  await page.goto(`${FIXTURE}?${query}${VIDEO}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "inspector-video",
  );
  await expect(page.getByTestId("inspector-pane")).toBeVisible();
  await expect(page.getByTestId("inspector-fit-host")).toHaveAttribute(
    "data-inspector-fit",
    "stacked",
  );
}

/** The element's height in lines of its own text. */
function linesWithin(element: Element): number {
  const style = getComputedStyle(element);
  const line =
    style.lineHeight === "normal"
      ? parseFloat(style.fontSize) * 1.2
      : parseFloat(style.lineHeight);
  return element.getBoundingClientRect().height / line;
}

test("SPEC-CORE-088 I7 the description spans the stacked Info header, keeps three lines, and its Show more stays on one line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await open(page);

  const description = page.locator(`${INFO} ${DESCRIPTION}`);
  await expect(description).toHaveCount(1);

  const contentWidth = await page.locator(INFO).evaluate((panel) => {
    const style = getComputedStyle(panel);
    return (
      panel.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  });
  const width = await description.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(width).toBeGreaterThanOrEqual(contentWidth - 2);

  expect(await description.locator("p").evaluate(linesWithin)).toBeLessThanOrEqual(
    3.05,
  );

  const more = description.getByRole("button", { name: "Show more" });
  await expect(more).toBeVisible();
  expect(await more.evaluate(linesWithin)).toBeLessThanOrEqual(1.05);
});
