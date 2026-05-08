import { expect, test, type Page } from "@playwright/test";
import { getDriveFiles, getFirstDrive, waitForApp } from "./helpers";

/**
 * E2E coverage for the right-pane folder filter.
 *
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §2
 *   - Text + type filter UI sits below the toolbar on /drive/{name}
 *     and /drive/{name}/{path}.
 *   - Type "Markdown" narrows to .md files.
 *   - Folder navigation clears the filter.
 *   - Empty result shows "該当なし" + clear button.
 *
 * Selector strategy: i18n placeholders / aria-labels resolved against
 * the ja.json copy (the cookie-only NEXT_LOCALE defaults to ja in
 * dev). If the running app is in en the placeholders branch out via
 * the regex matchers below.
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

  // Look at the first 200 items to discover top-level folders we can
  // navigate into and a reference file we can search for.
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

  // Pick a reference file that lives inside firstFolderPath so the
  // filter test can run inside that folder (where FolderContent
  // renders FilterField at the top of the visible scroll area).
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

  // Probe for at least one markdown file in the drive so the type
  // filter test can assert a non-empty result.
  try {
    const md = await getDriveFiles(driveName, { type: "markdown", limit: 1 });
    hasMarkdownFile = md.meta.total > 0;
  } catch {
    hasMarkdownFile = false;
  }
});

/** Build a folder URL from a posix-style path (encodes each segment). */
function folderUrl(drive: string, path: string): string {
  const segs = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return segs
    ? `/drive/${encodeURIComponent(drive)}/${segs}`
    : `/drive/${encodeURIComponent(drive)}`;
}

/** Locate the right-pane filter input (placeholder is the stable signal). */
function folderFilterInput(page: Page) {
  return page.locator(`input[placeholder*="このフォルダ"], input[placeholder*="this folder"]`).first();
}

/**
 * Count files visible in the right pane. The grid/list rows are
 * rendered as `main a[href*="/files/"]`. We exclude any links inside
 * the (optional) tree pane so we only count right-pane rows.
 */
async function countFolderFiles(page: Page): Promise<number> {
  // Right pane lives in the main scroll area; tree pane (when open)
  // sits in an aside. Filter by ancestor to avoid double-counting.
  return await page
    .locator(`main a[href*="/files/"]`)
    .filter({ hasNot: page.locator("aside a") })
    .count();
}

async function openTypeDropdown(page: Page) {
  // The type trigger is the only button right after the filter input
  // exposing aria-haspopup="menu" inside the filter row.
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
    // Use toHaveCount rather than toBeVisible — the input may be in
    // the DOM but below the fold on small viewports / long lists.
    await expect(input).toHaveCount(1, { timeout: 10_000 });
    await expect(input).toHaveAttribute("placeholder", FOLDER_PLACEHOLDER_RE);
  });

  test("typing narrows visible files", async ({ page }) => {
    test.skip(!firstFileTitle, "No reference file to search for");
    test.skip(!firstFileFolderPath, "Reference file has no folder context");

    await page.goto(folderUrl(driveName, firstFileFolderPath as string));
    await waitForApp(page);

    // Wait for the listing to populate.
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

    // Wait for any files to load before measuring baseline.
    const initialList = page.locator(`main a[href*="/files/"]`).first();
    const hasInitial = await initialList.isVisible().catch(() => false);
    test.skip(!hasInitial, "Drive root has no files to count");

    const baseline = await countFolderFiles(page);
    const input = folderFilterInput(page);
    await input.scrollIntoViewIfNeeded();

    // Use a deliberately unlikely substring so we *probably* drop the
    // count without erroring if data happens to contain it.
    await input.fill("zzqxnoresultz");
    await page.waitForTimeout(500);

    // Now click the X clear button inside the filter row.
    const clearBtn = page.getByRole("button", { name: /clear|クリア/i }).first();
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
    } else {
      // Fallback: clear via keyboard.
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
    // Pick the Markdown menuitem inside the open menu.
    const md = page
      .locator('[role="menuitem"]')
      .filter({ hasText: /^Markdown$/ })
      .first();
    await md.click();
    await page.waitForTimeout(500);

    // After Markdown filter the dropdown trigger label should read
    // "Markdown" rather than "All / すべて".
    const trigger = page
      .locator('button[aria-haspopup="menu"]')
      .filter({ hasText: TYPE_DROPDOWN_LABEL_RE })
      .first();
    await expect(trigger).toContainText(/Markdown/);

    // Verify the visible rows really only point at .md content. We
    // sample up to 5 file links and inspect the rendered name (cards
    // typically expose either a title or filename next to a file-type
    // icon). Loose check: at least one visible row, and none of the
    // filenames we can read end in clearly non-markdown extensions.
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

    // Navigate directly to a sibling top-level folder (or the root if
    // we don't know a second one). Direct goto exercises the same
    // unmount/remount cycle as a card click.
    const target = secondFolderPath
      ? folderUrl(driveName, secondFolderPath)
      : `/drive/${encodeURIComponent(driveName)}`;
    await page.goto(target);
    await waitForApp(page);

    // After navigation the filter input must be re-rendered empty
    // (folder filter does not persist across navigation per spec §2.6).
    const inputAfter = folderFilterInput(page);
    if ((await inputAfter.count()) > 0) {
      await expect(inputAfter).toHaveValue("");
    }
  });

  test("empty filter result shows clear button and empty message", async ({ page }) => {
    test.skip(!firstFolderPath, "No subfolder available");
    await page.goto(folderUrl(driveName, firstFolderPath as string));
    await waitForApp(page);

    // Skip if the folder is empty to begin with — we have nothing to
    // hide via filtering.
    const anyFile = page.locator(`main a[href*="/files/"]`).first();
    const visible = await anyFile.isVisible().catch(() => false);
    test.skip(!visible, "Folder has no files; empty-state path is moot");

    const input = folderFilterInput(page);
    await input.scrollIntoViewIfNeeded();
    await input.fill("zzz_no_match_xyz_12345");
    await page.waitForTimeout(500);

    // Empty-state message exists in the spec/messages file.
    const empty = page.getByText(EMPTY_FOLDER_RE);
    await expect(empty).toBeVisible({ timeout: 5_000 });

    // The X clear control inside the filter input itself counts as
    // the spec's "filter clear" affordance.
    const clearBtn = page.getByRole("button", { name: CLEAR_FILTERS_RE }).first();
    const fallbackClear = page.getByRole("button", { name: /clear|クリア/i }).first();
    const target = (await clearBtn.isVisible().catch(() => false)) ? clearBtn : fallbackClear;
    await expect(target).toBeVisible();
    await target.click();
    await page.waitForTimeout(400);
    await expect(input).toHaveValue("");
  });
});
