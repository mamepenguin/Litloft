/**
 * A `.txt` in the document layout, with the real components and stylesheet.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

test("at 1280px a plain-text document has one page row, a Read and Edit switch with no Split, and its suffix beside the stem", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
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
  const stemTextRight = await stem.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().right;
  });
  const gap = suffixBox.x - Math.min(stemTextRight, stemBox.x + stemBox.width);
  expect(gap).toBeGreaterThanOrEqual(-1);
  expect(gap).toBeLessThan(1);
  expect(Math.abs(suffixBox.y + suffixBox.height / 2 - (stemBox.y + stemBox.height / 2))).toBeLessThan(4);
});

test("SPEC-CORE-094 D6 / I10 (390px): a plain-text document shows one view-mode button, the mode it switches to", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#plain-text-document`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "plain-text-document");

  await expect(page.getByTestId("file-detail-chrome")).toHaveCount(1);
  await expect(page.locator('[data-testid^="view-mode-"]')).toHaveCount(0);
  await expect(page.locator("svg.lucide-pencil:visible")).toHaveCount(1);
  await expect(page.locator("svg.lucide-eye:visible")).toHaveCount(0);

  await page.locator("svg.lucide-pencil:visible").click();
  await expect(page.locator("svg.lucide-eye:visible")).toHaveCount(1);
  await expect(page.locator("svg.lucide-pencil:visible")).toHaveCount(0);

  const stem = page.getByRole("button", { name: "Click to rename" });
  await expect(stem).toHaveText("shopping list");
  await expect(page.getByText(".txt", { exact: true })).toHaveCount(1);
});
