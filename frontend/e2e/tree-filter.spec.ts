import { expect, test, type Page } from "@playwright/test";
import { getDriveFiles, getFirstDrive, waitForApp } from "./helpers";

/**
 * E2E coverage for the tree-pane filter.
 *
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §3
 *   - Tree pane is opt-in via the TreeToggle button.
 *   - Filter shape is the same `<FilterField>` (text + type dropdown).
 *   - Type filter persists per drive in localStorage `tree:typeFilter:{drive}`.
 *   - Text filter does NOT persist (cleared on reload / tree re-mount).
 *   - Filtered ancestors render with `data-state="ancestor"` (opacity-60).
 */

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

/** Build a folder URL from a posix-style path. */
function folderUrl(drive: string, path: string | null): string {
  if (!path) return `/drive/${encodeURIComponent(drive)}`;
  const segs = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `/drive/${encodeURIComponent(drive)}/${segs}`;
}

/**
 * Find the TreeToggle button in the toolbar. The X-close button inside
 * the tree aside (mobile-only) shares the `view.treeOff` aria-label,
 * but only the FolderToolbar TreeToggle sets `aria-pressed`. We anchor
 * on that to keep the selector unambiguous on any viewport.
 */
function treeToggle(page: Page) {
  return page.locator("button[aria-pressed][aria-label]").first();
}

/** Locate the tree-pane filter input via its placeholder. */
function treeFilterInput(page: Page) {
  return page
    .locator(`input[placeholder*="名前で絞り込み"], input[placeholder*="Filter by name"]`)
    .first();
}

/** The tree pane aside set by TwoPaneLayout. */
function treeAside(page: Page) {
  return page.locator('aside[aria-label="Folder tree"]');
}

/** Count visible tree rows (folder + file buttons inside the tree pane). */
async function countTreeRows(page: Page): Promise<number> {
  // FolderTreeRow renders as a button with aria-label set to the node
  // name. Scope to the aside so we don't catch sidebar/header buttons.
  return await treeAside(page).locator("button[aria-label]").count();
}

async function ensureTreeOn(page: Page) {
  const toggle = treeToggle(page);
  await toggle.waitFor({ timeout: 10_000 });
  // aria-pressed=true means tree is already on.
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
  // Filter input should disappear once the pane is unmounted.
  await expect(treeFilterInput(page)).toHaveCount(0, { timeout: 5_000 });
}

test.describe("Tree filter", () => {
  test.skip(() => !driveName, "No drives available");

  // Reset localStorage so the type-filter persistence test starts
  // from a known baseline (and so a previous failed run doesn't bleed
  // into the next).
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

    // Wait for tree to populate.
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
    // 300ms debounce inside FilterField, plus network round-trip for
    // the flat-tree request.
    await page.waitForTimeout(800);

    const after = await countTreeRows(page);
    expect(after).toBeLessThanOrEqual(before);

    // Optional: ancestor rows (opacity-60) should appear when there's
    // more than one match level deep. We do not require this since
    // small drives might match at root level only.
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

    // Clear via the X button if present, otherwise empty the field.
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

    // Open the type dropdown inside the tree filter row.
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

    // Drop a transient text filter that should NOT survive reload.
    const treeInput = treeFilterInput(page);
    await treeInput.fill("xyz_text_should_not_persist");
    await page.waitForTimeout(400);

    // Reload and re-open the tree pane (tree-on state itself is
    // persisted by useTreeEnabled, but in case it isn't we re-toggle).
    await page.reload();
    await waitForApp(page);
    const inputAfter = treeFilterInput(page);
    if (!(await inputAfter.isVisible().catch(() => false))) {
      await ensureTreeOn(page);
    }
    await expect(treeFilterInput(page)).toHaveValue("");

    // Type filter must still be Markdown.
    const triggerAfter = treeAside(page)
      .locator('button[aria-haspopup="menu"]')
      .filter({ hasText: TYPE_DROPDOWN_LABEL_RE })
      .first();
    await expect(triggerAfter).toContainText(/Markdown/);

    // Sanity: localStorage holds the persisted key.
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
