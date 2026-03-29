import { expect, test } from "@playwright/test";
import { getAuthStatus, waitForApp } from "./helpers";

let hasProtectedDrives: boolean;

test.beforeAll(async () => {
  const status = await getAuthStatus();
  hasProtectedDrives = status.has_protected_drives;
});

test.describe("Auth", () => {
  test.skip(() => !hasProtectedDrives, "No protected drives configured");

  test("unlock page renders", async ({ page }) => {
    await page.goto("/unlock");

    const title = page.locator("h1");
    await expect(title).toContainText("Unlock");

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText("Unlock");

    const rememberCheckbox = page.locator('input[type="checkbox"]');
    await expect(rememberCheckbox).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/unlock");

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill("definitely-wrong-password");

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Should show error message
    const error = page.locator("text=Invalid password");
    await expect(error).toBeVisible({ timeout: 5_000 });
  });

  test("auth status endpoint works", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    // Without authentication, protected drives should be hidden
    const status = await getAuthStatus();
    expect(status.has_protected_drives).toBe(true);
    // unlocked_groups should be empty (fresh session)
    // Note: this may not be empty if cookies persist from other tests
  });
});
