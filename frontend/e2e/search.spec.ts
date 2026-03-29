import { expect, test } from "@playwright/test";
import { getDriveFiles, getFirstDrive, waitForApp } from "./helpers";

let driveName: string;
let searchTerm: string;

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive) return;
  driveName = drive.name;

  // Find a file to use as search term (first 3 chars of title)
  const res = await getDriveFiles(driveName, { limit: 1 });
  if (res.data.length > 0) {
    const title = res.data[0].title;
    searchTerm = title.length > 3 ? title.slice(0, 3) : title;
  }
});

test.describe("Search", () => {
  test.skip(() => !driveName || !searchTerm, "No drive or files for search");

  test("open search and find file", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    // Open search via keyboard shortcut
    await page.keyboard.press("Meta+Shift+f");
    await page.waitForTimeout(300);

    // Desktop search input
    const input = page.locator('input[placeholder*="内を検索"]').last();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill(searchTerm);

    // Wait for results to load
    await page.waitForTimeout(1000);

    // Results are buttons inside the search modal (fixed overlay)
    // Each result has a file type icon and title text
    const modal = page.locator(".fixed").filter({ has: page.locator('input[placeholder*="内を検索"]') });
    const resultButtons = modal.locator("button").filter({ has: page.locator("svg") });
    const count = await resultButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("search result navigates to file", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    await page.keyboard.press("Meta+Shift+f");
    await page.waitForTimeout(300);

    const input = page.locator('input[placeholder*="内を検索"]').last();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill(searchTerm);
    await page.waitForTimeout(1000);

    // Click first result button in the desktop modal
    const modal = page.locator(".fixed.inset-0").last();
    const resultBtn = modal.locator("button").filter({ has: page.locator("svg") }).first();
    const hasResult = await resultBtn.isVisible().catch(() => false);

    if (hasResult) {
      await resultBtn.click();
      await page.waitForURL(/\/files\//, { timeout: 10_000 });
      await expect(page.locator("main h1")).toBeVisible();
    }
  });

  test("escape closes search", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    await page.keyboard.press("Meta+Shift+f");
    await page.waitForTimeout(300);

    const input = page.locator('input[placeholder*="内を検索"]').last();
    await expect(input).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
    await expect(input).not.toBeVisible();
  });
});
