import { expect, test, type Page } from "@playwright/test";
import { deleteFile, getDriveFiles, getFirstDrive, waitForApp } from "./helpers";

/**
 * E2E coverage for Global Quick Note
 * (docs/superpowers/specs/2026-08-13-global-quick-note.md §12.3).
 *
 * The journey checks the parts that only exist once the real app, the real
 * API, and the real header are wired together:
 *
 *   1. the action is reachable from a page with no active drive (root);
 *   2. saving creates an ordinary Markdown file in the selected drive;
 *   3. the route does not change after Save;
 *   4. opening from a drive page targets that drive.
 *
 * Anything created here is deleted again in afterAll.
 */

const QUICK_NOTE_RE = /クイックノート|Quick note/i;
const BODY_RE = /ノート本文|Note text/i;
const SAVE_RE = /^(保存|Save)$/;
const DESTINATION_RE = /保存先|Destination/i;
const DRIVE_RE = /^(ドライブ|Drive)$/;

let driveName: string | null = null;
const createdFileIds: string[] = [];

function uniqueTitle(): string {
  return `Quick note e2e ${Date.now()}`;
}

async function openQuickNote(page: Page) {
  await page.getByRole("button", { name: QUICK_NOTE_RE }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
}

/** Reveal the destination controls. The panel opens them by itself when it
 *  could not resolve a drive, so the toggle is only clicked when needed. */
async function showDestination(page: Page) {
  const select = page.getByLabel(DRIVE_RE);
  if (await select.isVisible()) return select;
  await page.getByRole("button", { name: DESTINATION_RE }).click();
  await expect(select).toBeVisible({ timeout: 5_000 });
  return select;
}

async function selectDrive(page: Page, drive: string) {
  const select = await showDestination(page);
  await select.selectOption(drive);
}

/** Poll the API until the note shows up (the create is synchronous, but the
 *  scanner and the listing can lag by a beat). */
async function findNote(drive: string, filename: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await getDriveFiles(drive, { path: "Inbox", limit: 200 });
    const hit = res.data.find((f) => f.filename === filename);
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  driveName = drive?.name ?? null;
});

test.afterAll(async () => {
  for (const id of createdFileIds) {
    await deleteFile(id).catch(() => {});
  }
});

test.describe("Quick note", () => {
  test.skip(() => !driveName, "No drive available");

  test("saves from a page with no active drive and stays put", async ({ page }) => {
    const drive = driveName!;
    const title = uniqueTitle();

    await page.goto("/");
    await waitForApp(page);

    await openQuickNote(page);
    await selectDrive(page, drive);

    await page.getByLabel(BODY_RE).fill(`${title}\n\nbody line`);
    await page.getByRole("button", { name: SAVE_RE }).click();

    // Panel closes and the route is untouched.
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe("/");

    const created = await findNote(drive, `${title}.md`);
    expect(created, "quick note should exist in the selected drive").not.toBeNull();
    if (created) createdFileIds.push(created.id);
  });

  test("targets the drive of the page it was opened from", async ({ page }) => {
    const drive = driveName!;

    await page.goto(`/drive/${encodeURIComponent(drive)}`);
    await waitForApp(page);

    await openQuickNote(page);
    await expect(await showDestination(page)).toHaveValue(drive);
  });

  test("asks before discarding a written note", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    await openQuickNote(page);
    await page.getByLabel(BODY_RE).fill("unsaved thought");
    await page.keyboard.press("Escape");

    await expect(
      page.getByText(/このノートを破棄しますか|Discard this note/i),
    ).toBeVisible();

    await page.getByRole("button", { name: /編集を続ける|Keep editing/i }).click();
    await expect(page.getByLabel(BODY_RE)).toHaveValue("unsaved thought");

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^(破棄|Discard)$/ }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
