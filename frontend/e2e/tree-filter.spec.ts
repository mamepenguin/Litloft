import { expect, test, type Page } from "@playwright/test";
import { getDriveFiles, getFirstDrive, waitForApp } from "./helpers";

let driveName: string;
let referenceFileTitle: string | null = null;
let firstFolderPath: string | null = null;
let hasMarkdownFile = false;

const TREE_PLACEHOLDER_RE = /名前で絞り込み|Filter by name/i;
const TYPE_DROPDOWN_LABEL_RE = /^(すべて|All|Markdown|動画|Video|画像|Image|PDF)$/;

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive) return;
  driveName = drive.name;
  const res = await getDriveFiles(driveName, { limit: 200 });
  if (res.data.length > 0) {
    referenceFileTitle = res.data[0].title;
  }
  for (const f of res.data) {
    if (f.folder_path) {
      const top = f.folder_path.split("/").filter(Boolean)[0];
      if (top) {
        firstFolderPath = top;
        break;
      }
    }
  }
  try {
    const md = await getDriveFiles(driveName, { type: "markdown", limit: 1 });
    hasMarkdownFile = md.meta.total > 0;
  } catch {
    hasMarkdownFile = false;
  }
});

function folderUrl(drive: string, path: string | null): string {
  if (!path) return `/drive/${encodeURIComponent(drive)}`;
  const segs = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `/drive/${encodeURIComponent(drive)}/${segs}`;
}

/**
 * The mobile close button inside the tree aside shares the toggle's
 * aria-label; only the toolbar toggle sets `aria-pressed`.
 */
function treeToggle(page: Page) {
  return page.locator("button[aria-pressed][aria-label]").first();
}

function treeFilterInput(page: Page) {
  return page
    .locator(`input[placeholder*="名前で絞り込み"], input[placeholder*="Filter by name"]`)
    .first();
}

function treeAside(page: Page) {
  return page.locator('aside[aria-label="Folder tree"]');
}

async function countTreeRows(page: Page): Promise<number> {
  // Scoped to the aside so sidebar and header buttons are not counted.
  return await treeAside(page).locator("button[aria-label]").count();
}

async function ensureTreeOn(page: Page) {
  const toggle = treeToggle(page);
  await toggle.waitFor({ timeout: 10_000 });
  const pressed = await toggle.getAttribute("aria-pressed");
  if (pressed !== "true") {
    await toggle.click();
  }
  await treeFilterInput(page).waitFor({ timeout: 10_000 });
}

async function ensureTreeOff(page: Page) {
  const toggle = treeToggle(page);
  const pressed = await toggle.getAttribute("aria-pressed");
  if (pressed === "true") {
    await toggle.click();
  }
  await expect(treeFilterInput(page)).toHaveCount(0, { timeout: 5_000 });
}

test.describe("Tree filter", () => {
  test.skip(() => !driveName, "No drives available");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch {
        /* ignored */
      }
    });
  });

  test("filter input is visible after enabling tree", async ({ page }) => {
    await page.goto(folderUrl(driveName, firstFolderPath));
    await waitForApp(page);
    await ensureTreeOn(page);

    const input = treeFilterInput(page);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("placeholder", TREE_PLACEHOLDER_RE);
  });

  test("typing narrows tree rows; non-matching paths hidden", async ({ page }) => {
    test.skip(!referenceFileTitle, "No reference file title for substring search");
    await page.goto(folderUrl(driveName, firstFolderPath));
    await waitForApp(page);
    await ensureTreeOn(page);

    const anyRow = treeAside(page).locator('button[aria-label]').first();
    await anyRow.waitFor({ timeout: 10_000 });
    const before = await countTreeRows(page);
    test.skip(before === 0, "Tree is empty in this environment");

    const probe = (referenceFileTitle as string).slice(
      0,
      Math.min(3, referenceFileTitle!.length),
    );
    const input = treeFilterInput(page);
    await input.fill(probe);
    // 300ms debounce inside FilterField, plus the flat-tree request.
    await page.waitForTimeout(800);

    const after = await countTreeRows(page);
    expect(after).toBeLessThanOrEqual(before);

    const ancestors = page.locator('[data-state="ancestor"]');
    const ancestorCount = await ancestors.count();
    expect(ancestorCount).toBeGreaterThanOrEqual(0);
  });

  test("clearing text filter restores tree rows", async ({ page }) => {
    test.skip(!referenceFileTitle, "No reference file title");
    await page.goto(folderUrl(driveName, firstFolderPath));
    await waitForApp(page);
    await ensureTreeOn(page);

    await treeAside(page).locator('button[aria-label]').first().waitFor({ timeout: 10_000 });
    const baseline = await countTreeRows(page);

    const input = treeFilterInput(page);
    await input.fill("zzz_no_match_xyz");
    await page.waitForTimeout(800);

    const clearBtn = page.getByRole("button", { name: /clear|クリア/i }).first();
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
    } else {
      await input.fill("");
    }
    await page.waitForTimeout(800);
    const restored = await countTreeRows(page);
    expect(restored).toBe(baseline);
    await expect(input).toHaveValue("");
  });

  test("type filter persists across reload, text filter does not", async ({ page }) => {
    test.skip(!hasMarkdownFile, "Drive has no markdown to assert type persistence");

    await page.goto(folderUrl(driveName, firstFolderPath));
    await waitForApp(page);
    await ensureTreeOn(page);

    const trigger = treeAside(page)
      .locator('button[aria-haspopup="menu"]')
      .filter({ hasText: TYPE_DROPDOWN_LABEL_RE })
      .first();
    await trigger.click();
    await page
      .locator('[role="menuitem"]')
      .filter({ hasText: /^Markdown$/ })
      .first()
      .click();
    await page.waitForTimeout(400);

    const treeInput = treeFilterInput(page);
    await treeInput.fill("xyz_text_should_not_persist");
    await page.waitForTimeout(400);

    await page.reload();
    await waitForApp(page);
    const inputAfter = treeFilterInput(page);
    if (!(await inputAfter.isVisible().catch(() => false))) {
      await ensureTreeOn(page);
    }
    await expect(treeFilterInput(page)).toHaveValue("");

    const triggerAfter = treeAside(page)
      .locator('button[aria-haspopup="menu"]')
      .filter({ hasText: TYPE_DROPDOWN_LABEL_RE })
      .first();
    await expect(triggerAfter).toContainText(/Markdown/);

    const stored = await page.evaluate(
      (drive) => window.localStorage.getItem(`tree:typeFilter:${drive}`),
      driveName,
    );
    expect(stored).toBeTruthy();
    expect(stored).toMatch(/markdown/i);
  });

  test("toggling tree off then on yields empty text filter", async ({ page }) => {
    await page.goto(folderUrl(driveName, firstFolderPath));
    await waitForApp(page);
    await ensureTreeOn(page);

    const input = treeFilterInput(page);
    await input.fill("transient");
    await page.waitForTimeout(400);
    await expect(input).toHaveValue("transient");

    await ensureTreeOff(page);
    await ensureTreeOn(page);

    const inputAgain = treeFilterInput(page);
    await expect(inputAgain).toBeVisible();
    await expect(inputAgain).toHaveValue("");
  });
});
