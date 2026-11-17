/**
 * SPEC-CORE-120 I14 at 375 px: the running dialog's progress line stays inside
 * the dialog and nothing overflows horizontally.
 *
 * Fixture: `batch-progress` (the real `SelectionBar` with a held-open trash
 * request). Selector: the progress line's `role="status"`.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const PROGRESS = "Processing 0 of 300";

let run = 0;

async function openRunningDialog(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${FIXTURE}?arrangement=batch-progress&run=${++run}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");

  await page.getByRole("button", { name: "More actions for the selection" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  // The dialog focuses its confirm button on open; Enter is how the dialog is
  // confirmed without matching the bar's identically named action.
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(PROGRESS);
}

interface Placement {
  line: { left: number; right: number; width: number; scrollWidth: number; clientWidth: number };
  dialog: { left: number; right: number; width: number; clientWidth: number };
  viewport: number;
  scrollWidth: number;
  clientWidth: number;
}

function measure(page: Page): Promise<Placement> {
  return page.evaluate(() => {
    const line = document.querySelector<HTMLElement>('[role="status"]')!;
    const dialog = line.parentElement!;
    const lineBox = line.getBoundingClientRect();
    const dialogBox = dialog.getBoundingClientRect();
    return {
      line: {
        left: lineBox.left,
        right: lineBox.right,
        width: lineBox.width,
        scrollWidth: line.scrollWidth,
        clientWidth: line.clientWidth,
      },
      dialog: {
        left: dialogBox.left,
        right: dialogBox.right,
        width: dialogBox.width,
        clientWidth: dialog.clientWidth,
      },
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

test("SPEC-CORE-120 I14 the running progress line stays inside the dialog at 375px", async ({ page }) => {
  await openRunningDialog(page);

  const m = await measure(page);

  expect(m.viewport).toBe(375);
  expect(m.line.left).toBeGreaterThanOrEqual(m.dialog.left);
  expect(m.line.right).toBeLessThanOrEqual(m.dialog.right);
  expect(m.line.width).toBeLessThanOrEqual(m.dialog.width);
  // Layout widths, not boxes: the panel is still scaling in when it opens.
  expect(m.line.scrollWidth).toBeLessThanOrEqual(m.line.clientWidth);
  expect(m.line.clientWidth).toBeLessThanOrEqual(m.dialog.clientWidth);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
});
