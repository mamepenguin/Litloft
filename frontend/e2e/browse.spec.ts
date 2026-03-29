import { expect, test } from "@playwright/test";
import { getDriveFiles, getFirstDrive, waitForApp } from "./helpers";

let driveName: string;
let hasFiles: boolean;

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive) return;
  driveName = drive.name;
  const res = await getDriveFiles(driveName, { limit: 1 });
  hasFiles = res.meta.total > 0;
});

test.describe("Browse", () => {
  test.skip(() => !driveName, "No drives available");

  test("home page shows drives", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await expect(page.locator("main h1")).toContainText("ドライブ");
    // Drive cards are in main content grid
    const driveCard = page.locator("main .grid a").first();
    await expect(driveCard).toBeVisible();
  });

  test("navigate to drive shows content", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);
    // Wait for content to load - either folders, files, or empty state
    await page.waitForTimeout(2000);
    // The main area should have visible content
    await expect(page.locator("main")).toBeVisible();
  });

  test("click file navigates to detail page", async ({ page }) => {
    test.skip(!hasFiles, "No files in drive");

    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    // Wait for files to load (file links are in main content)
    const fileLink = page.locator(`main a[href*="/files/"]`).first();
    await fileLink.waitFor({ timeout: 10_000 });
    await fileLink.click();

    // Should navigate to file detail page
    await page.waitForURL(/\/files\//, { timeout: 10_000 });
    const title = page.locator("main h1");
    await expect(title).toBeVisible();
  });

  test("breadcrumb navigation works", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    // Look for a folder link in the main content area
    const folderLink = page
      .locator(`main a[href*="/drive/${encodeURIComponent(driveName)}/"]`)
      .first();
    const hasFolders = await folderLink.isVisible().catch(() => false);

    if (hasFolders) {
      await folderLink.click();
      await page.waitForTimeout(1000);

      // Breadcrumb should show drive name as clickable link
      const breadcrumb = page.locator(
        `main a[href="/drive/${encodeURIComponent(driveName)}"]`
      );
      await expect(breadcrumb).toBeVisible();
      await breadcrumb.click();

      // Should navigate back to drive root
      await expect(page).toHaveURL(
        new RegExp(`/drive/${encodeURIComponent(driveName)}$`)
      );
    }
  });
});
