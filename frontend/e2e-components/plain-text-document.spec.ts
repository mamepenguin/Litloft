/**
 * A `.txt` in the document layout, with the real components and stylesheet.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

for (const width of [1280, 390]) {
  test(`at ${width}px a plain-text document has one page row, a Read and Edit switch with no Split, and its suffix beside the stem`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${FIXTURE}?run=${++navigation}#plain-text-document`);
    await expect(page.locator("body")).toHaveAttribute("data-arrangement", "plain-text-document");

    await expect(page.getByTestId("file-detail-chrome")).toHaveCount(1);
    await expect(page.getByTestId("view-mode-preview")).toBeVisible();
    await expect(page.getByTestId("view-mode-edit")).toBeVisible();
    await expect(page.getByTestId("view-mode-split")).toHaveCount(0);

    const stem = page.getByRole("button", { name: "Click to rename" });
    await expect(stem).toHaveText("shopping list");
    const suffix = page.getByText(".txt", { exact: true });
    const stemBox = (await stem.boundingBox())!;
    const suffixBox = (await suffix.boundingBox())!;
    expect(suffixBox.x).toBeGreaterThanOrEqual(stemBox.x + stemBox.width - 1);
    expect(Math.abs(suffixBox.y + suffixBox.height / 2 - (stemBox.y + stemBox.height / 2))).toBeLessThan(4);
  });
}
