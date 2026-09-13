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
    const driveCard = page.locator("main .grid a").first();
    await expect(driveCard).toBeVisible();
  });

  test("navigate to drive shows content", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await expect(page.locator("main")).toBeVisible();
  });

  test("click file navigates to detail page", async ({ page }) => {
    test.skip(!hasFiles, "No files in drive");

    // With the tree disabled the 2-pane host never mounts and the click
    // lands on a folder view rather than a detail page.
    await page.addInitScript((d: string) => {
      try {
        localStorage.setItem(`tree:enabled:${d}`, "true");
      } catch {
        /* ignored */
      }
    }, driveName);

    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    const fileLink = page.locator(`main a[href*="/files/"]`).first();
    await fileLink.waitFor({ timeout: 10_000 });
    await fileLink.click();

    // Either /files/{id} (e.g. playlist-exception fullscreen) or the
    // canonical 2-pane URL with ?file=… is acceptable.
    await page.waitForURL(/\/files\/|\?(?:.*&)?file=/, { timeout: 10_000 });
    const title = page.locator("main h1").first();
    await expect(title).toBeVisible({ timeout: 10_000 });
  });

  test("breadcrumb navigation works", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    const folderLink = page
      .locator(`main a[href*="/drive/${encodeURIComponent(driveName)}/"]`)
      .first();
    const hasFolders = await folderLink.isVisible().catch(() => false);

    if (hasFolders) {
      await folderLink.click();
      await page.waitForTimeout(1000);

      const breadcrumb = page.locator(
        `main a[href="/drive/${encodeURIComponent(driveName)}"]`
      );
      await expect(breadcrumb).toBeVisible();
      await breadcrumb.click();

      await expect(page).toHaveURL(
        new RegExp(`/drive/${encodeURIComponent(driveName)}$`)
      );
    }
  });
});
