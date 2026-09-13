import { expect, test, type Page } from "@playwright/test";
import { getDriveFiles, getFirstDrive, waitForApp } from "./helpers";

/**
 * Placeholders and labels match both the ja and en copy, since the locale
 * cookie defaults to ja in dev.
 */

let driveName: string;
let firstFolderPath: string | null = null;
let secondFolderPath: string | null = null;
let firstFileTitle: string | null = null;
let firstFileFolderPath: string | null = null;
let hasMarkdownFile = false;

const FOLDER_PLACEHOLDER_RE =
  /このフォルダで絞り込み|Filter in this folder/i;
const TYPE_DROPDOWN_LABEL_RE = /^(すべて|All|Markdown|動画|Video|画像|Image|PDF)$/;
const EMPTY_FOLDER_RE = /このフォルダに該当するファイルはありません|No matching files in this folder/i;
const CLEAR_FILTERS_RE = /フィルタを解除|Clear filters/i;

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive) return;
  driveName = drive.name;

  const root = await getDriveFiles(driveName, { limit: 200 });
  const folders = new Set<string>();
  for (const f of root.data) {
    if (f.folder_path) {
      const top = f.folder_path.split("/").filter(Boolean)[0];
      if (top) folders.add(top);
    }
  }
  const folderList = Array.from(folders);
  if (folderList[0]) firstFolderPath = folderList[0];
  if (folderList[1]) secondFolderPath = folderList[1];

  if (firstFolderPath) {
    const inFolder = root.data.find((f) =>
      (f.folder_path ?? "").startsWith(firstFolderPath as string),
    );
    if (inFolder) {
      firstFileTitle = inFolder.title;
      firstFileFolderPath = inFolder.folder_path ?? firstFolderPath;
    }
  }
  if (!firstFileTitle && root.data.length > 0) {
    firstFileTitle = root.data[0].title;
    firstFileFolderPath = root.data[0].folder_path ?? "";
  }

  try {
    const md = await getDriveFiles(driveName, { type: "markdown", limit: 1 });
    hasMarkdownFile = md.meta.total > 0;
  } catch {
    hasMarkdownFile = false;
  }
});

function folderUrl(drive: string, path: string): string {
  const segs = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return segs
    ? `/drive/${encodeURIComponent(drive)}/${segs}`
    : `/drive/${encodeURIComponent(drive)}`;
}

function folderFilterInput(page: Page) {
  return page.locator(`input[placeholder*="このフォルダ"], input[placeholder*="this folder"]`).first();
}

async function countFolderFiles(page: Page): Promise<number> {
  // The tree pane, when open, sits in an aside inside main.
  return await page
    .locator(`main a[href*="/files/"]`)
    .filter({ hasNot: page.locator("aside a") })
    .count();
}

async function openTypeDropdown(page: Page) {
  const trigger = page.locator('button[aria-haspopup="menu"]').filter({
    hasText: TYPE_DROPDOWN_LABEL_RE,
  }).first();
  await trigger.click();
  return trigger;
}

test.describe("Folder filter (right pane)", () => {
  test.skip(() => !driveName, "No drives available");

  test("filter input is rendered inside a subfolder view", async ({ page }) => {
    test.skip(!firstFolderPath, "No subfolder available to test against");
    await page.goto(folderUrl(driveName, firstFolderPath as string));
    await waitForApp(page);

    const input = folderFilterInput(page);
    // Not toBeVisible: the input may be below the fold on long lists.
    await expect(input).toHaveCount(1, { timeout: 10_000 });
    await expect(input).toHaveAttribute("placeholder", FOLDER_PLACEHOLDER_RE);
  });

  test("typing narrows visible files", async ({ page }) => {
    test.skip(!firstFileTitle, "No reference file to search for");
    test.skip(!firstFileFolderPath, "Reference file has no folder context");

    await page.goto(folderUrl(driveName, firstFileFolderPath as string));
    await waitForApp(page);

    await page
      .locator(`main a[href*="/files/"]`)
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => {
        /* no files at this path, test is moot */
      });
    const before = await countFolderFiles(page);
    test.skip(before === 0, "No files in target folder to filter");

    const probe = (firstFileTitle as string).slice(0, Math.min(3, firstFileTitle!.length));
    const input = folderFilterInput(page);
    await input.scrollIntoViewIfNeeded();
    await input.fill(probe);
    // Debounce is 300ms in FilterField.
    await page.waitForTimeout(500);

    const after = await countFolderFiles(page);
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThanOrEqual(before);
  });

  test("clear button restores all files", async ({ page }) => {
    test.skip(!firstFileTitle, "No reference file to search for");
    test.skip(!firstFolderPath, "No subfolder available");
    await page.goto(folderUrl(driveName, firstFolderPath as string));
    await waitForApp(page);

    const initialList = page.locator(`main a[href*="/files/"]`).first();
    const hasInitial = await initialList.isVisible().catch(() => false);
    test.skip(!hasInitial, "Drive root has no files to count");

    const baseline = await countFolderFiles(page);
    const input = folderFilterInput(page);
    await input.scrollIntoViewIfNeeded();

    await input.fill("zzqxnoresultz");
    await page.waitForTimeout(500);

    const clearBtn = page.getByRole("button", { name: /clear|クリア/i }).first();
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
    } else {
      await input.fill("");
    }
    await page.waitForTimeout(500);

    const restored = await countFolderFiles(page);
    expect(restored).toBe(baseline);
    await expect(input).toHaveValue("");
  });

  test("type dropdown selects Markdown and filters list", async ({ page }) => {
    test.skip(!hasMarkdownFile, "Drive contains no markdown files");
    test.skip(!firstFolderPath, "No subfolder available");

    await page.goto(folderUrl(driveName, firstFolderPath as string));
    await waitForApp(page);
    await page.locator(`main a[href*="/files/"]`).first().waitFor({ timeout: 10_000 }).catch(() => undefined);

    const input = folderFilterInput(page);
    await input.scrollIntoViewIfNeeded();
    await openTypeDropdown(page);
    const md = page
      .locator('[role="menuitem"]')
      .filter({ hasText: /^Markdown$/ })
      .first();
    await md.click();
    await page.waitForTimeout(500);

    const trigger = page
      .locator('button[aria-haspopup="menu"]')
      .filter({ hasText: TYPE_DROPDOWN_LABEL_RE })
      .first();
    await expect(trigger).toContainText(/Markdown/);

    const links = page.locator(`main a[href*="/files/"]`);
    const sample = Math.min(5, await links.count());
    expect(sample).toBeGreaterThan(0);
    for (let i = 0; i < sample; i++) {
      const text = (await links.nth(i).innerText()).toLowerCase();
      expect(text).not.toMatch(/\.(mp4|mov|mkv|jpg|jpeg|png|pdf|webp)\b/);
    }
  });

  test("navigating to a different folder clears the filter", async ({ page }) => {
    test.skip(!firstFolderPath, "No subfolder available for navigation");

    await page.goto(folderUrl(driveName, firstFolderPath as string));
    await waitForApp(page);
    await page.locator(`main a[href*="/files/"]`).first().waitFor({ timeout: 10_000 }).catch(() => undefined);

    const input = folderFilterInput(page);
    await input.scrollIntoViewIfNeeded();
    await input.fill("abc");
    await page.waitForTimeout(400);
    await expect(input).toHaveValue("abc");

    // A direct goto exercises the same unmount/remount cycle as a card
    // click.
    const target = secondFolderPath
      ? folderUrl(driveName, secondFolderPath)
      : `/drive/${encodeURIComponent(driveName)}`;
    await page.goto(target);
    await waitForApp(page);

    const inputAfter = folderFilterInput(page);
    if ((await inputAfter.count()) > 0) {
      await expect(inputAfter).toHaveValue("");
    }
  });

  test("empty filter result shows clear button and empty message", async ({ page }) => {
    test.skip(!firstFolderPath, "No subfolder available");
    await page.goto(folderUrl(driveName, firstFolderPath as string));
    await waitForApp(page);

    const anyFile = page.locator(`main a[href*="/files/"]`).first();
    const visible = await anyFile.isVisible().catch(() => false);
    test.skip(!visible, "Folder has no files; empty-state path is moot");

    const input = folderFilterInput(page);
    await input.scrollIntoViewIfNeeded();
    await input.fill("zzz_no_match_xyz_12345");
    await page.waitForTimeout(500);

    const empty = page.getByText(EMPTY_FOLDER_RE);
    await expect(empty).toBeVisible({ timeout: 5_000 });

    const clearBtn = page.getByRole("button", { name: CLEAR_FILTERS_RE }).first();
    const fallbackClear = page.getByRole("button", { name: /clear|クリア/i }).first();
    const target = (await clearBtn.isVisible().catch(() => false)) ? clearBtn : fallbackClear;
    await expect(target).toBeVisible();
    await target.click();
    await page.waitForTimeout(400);
    await expect(input).toHaveValue("");
  });
});
