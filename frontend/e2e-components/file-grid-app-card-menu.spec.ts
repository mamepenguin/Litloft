/**
 * SPEC-CORE-169 I4: FileGrid's cards with `appCardMenu`, in both layouts, in
 * a real browser.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

async function open(page: Page): Promise<void> {
  await page.goto(`${FIXTURE}#file-grid-app-card-menu`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.getByText("Video 0").first()).toBeVisible();
}

/** The computed `user-select` of each card's link, keyed by the file id in its href. */
async function linkStyles(page: Page, layout: string): Promise<Record<string, string>> {
  return page.locator(`[data-layout=${layout}]`).evaluate((root) => {
    const out: Record<string, string> = {};
    for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href*='file=']")) {
      const id = new URL(a.href).searchParams.get("file") ?? "";
      const value = getComputedStyle(a).userSelect;
      out[id] = out[id] === undefined || out[id] === value ? value : `${out[id]}|${value}`;
    }
    return out;
  });
}

test("SPEC-CORE-169 I4 every 16:9 card computes user-select none on its link", async ({ page }) => {
  await open(page);
  const styles = await linkStyles(page, "cards");

  expect(Object.keys(styles).sort()).toEqual(
    Array.from({ length: 4 }, (_, i) => `video${String(i).padStart(7, "0")}`),
  );
  for (const [id, value] of Object.entries(styles)) expect(value, id).toBe("none");
});

test("SPEC-CORE-169 I4 every justified cell computes user-select none on its link", async ({ page }) => {
  await open(page);
  await expect(page.locator("[data-layout=justified] .justified-grid-cell").first()).toBeVisible();
  const styles = await linkStyles(page, "justified");

  expect(Object.keys(styles).sort()).toEqual(
    Array.from({ length: 20 }, (_, i) => `photo${String(i).padStart(7, "0")}`).sort(),
  );
  for (const [id, value] of Object.entries(styles)) expect(value, id).toBe("none");
});
