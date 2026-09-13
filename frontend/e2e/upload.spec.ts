import { expect, test } from "@playwright/test";
import { deleteFile, getDriveFiles, getWritableDrive, waitForApp } from "./helpers";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

let driveName: string;
let tempFile: string;
let uploadedFileId: string | null = null;

const TEST_FILENAME = `_e2e_test_${Date.now()}.txt`;

test.beforeAll(async () => {
  const drive = await getWritableDrive();
  if (!drive) return;
  driveName = drive.name;

  tempFile = path.join(os.tmpdir(), TEST_FILENAME);
  fs.writeFileSync(tempFile, "E2E test content for upload verification");
});

test.afterAll(async () => {
  if (uploadedFileId) {
    await deleteFile(uploadedFileId).catch(() => {});
  }
  if (tempFile && fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
});

test.describe("Upload", () => {
  test.skip(() => !driveName, "No writable drive available");

  test("upload file via button", async ({ page }) => {
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    const addBtn = page.locator("main button", { hasText: "追加" }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();

    const filesRow = page.getByRole("menuitem", { name: "ファイル", exact: true });
    await expect(filesRow).toBeVisible({ timeout: 5_000 });

    // The chooser promise is set up before the click that opens it.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await filesRow.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tempFile);

    await page.waitForTimeout(5000);

    const res = await getDriveFiles(driveName, { limit: 100 });
    const uploaded = res.data.find((f) => f.filename === TEST_FILENAME);

    if (uploaded) {
      uploadedFileId = uploaded.id;
    }

    expect(uploadedFileId).toBeTruthy();
  });
});
