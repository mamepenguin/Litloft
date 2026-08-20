import { expect, test, type Page } from "@playwright/test";
import {
  createTextFile,
  deleteFile,
  getDriveFiles,
  getFirstDrive,
  waitForApp,
  type FileItem,
} from "./helpers";

/**
 * E2E coverage for the Phase 2 inline Knowledge editor work
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md
 * §5 Phase 2). PR-7 ships the inline editor (flag default true) and
 * adds these journeys to verify the integration end-to-end:
 *
 *   1. Inline editor mounts when ``?file={mdId}`` opens a Markdown
 *      file in 2-pane.
 *   2. Editing then arrow-keying to a sibling triggers the global
 *      discard-changes dialog (PR-5 navigationGuard via DirtyBlocker).
 *   3. Cancelling the dialog keeps the user on the same file.
 *   4. The legacy Knowledge route ``/addons/knowledge?edit={mdId}``
 *      redirects to the canonical 2-pane URL with ``edit=1``.
 *
 * Each test skips loudly when its fixture (a writable Markdown file
 * with a sibling in the same folder) is missing rather than failing.
 */

interface PickedFile {
  id: string;
  title: string;
  filename: string;
  drive: string;
  folder_path: string;
  file_type: string;
}

let driveName: string | null = null;
let mdFile: PickedFile | null = null;
let mdSibling: PickedFile | null = null;
let wikiAnchorFile: FileItem | null = null;

const DISCARD_TITLE_RE = /未保存の変更|Unsaved changes/i;
const DISCARD_CONFIRM_RE = /破棄して移動|Discard and navigate/i;
const CANCEL_RE = /キャンセル|Cancel/i;
const EDITOR_RE = /Markdownエディタ|Markdown editor/i;

function folderUrl(drive: string, folderPath: string): string {
  const segs = folderPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return segs
    ? `/drive/${encodeURIComponent(drive)}/${segs}`
    : `/drive/${encodeURIComponent(drive)}`;
}

function fileSelectionUrl(file: PickedFile, extra?: Record<string, string>) {
  const params = new URLSearchParams({ file: file.id, ...(extra ?? {}) });
  return `${folderUrl(file.drive, file.folder_path)}?${params.toString()}`;
}

async function enableTreeFor(page: Page, drive: string) {
  // Same trick as right-pane.spec.ts: TwoPaneLayout only mounts when
  // the per-drive ``tree:enabled`` localStorage flag is true. Seed it
  // before the page loads so the right pane shows up.
  await page.addInitScript((d: string) => {
    try {
      localStorage.setItem(`tree:enabled:${d}`, "true");
    } catch {
      /* storage unavailable; the test will skip via timeout */
    }
  }, drive);
}

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive || drive.readonly) return;
  driveName = drive.name;

  const all = await getDriveFiles(driveName, { limit: 500 });
  const md = all.data.find((f) => f.filename.toLowerCase().endsWith(".md"));
  if (!md) return;
  mdFile = md;
  // Need any sibling in the same folder so arrow-right has somewhere
  // to navigate to.
  mdSibling =
    all.data
      .filter((f) => f.id !== md.id)
      .find((f) => (f.folder_path ?? "") === (md.folder_path ?? "")) ?? null;

  const unique = Date.now();
  wikiAnchorFile = await createTextFile(
    driveName,
    `wiki-anchor-e2e-${unique}.md`,
    Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n"),
  );
});

test.afterAll(async () => {
  if (wikiAnchorFile) await deleteFile(wikiAnchorFile.id).catch(() => {});
});

test.describe("Inline Knowledge editor (PR-7)", () => {
  test.skip(() => !driveName || !mdFile, "No writable .md fixture");

  test("?file={mdId} mounts the inline CodeMirror editor", async ({ page }) => {
    await enableTreeFor(page, mdFile!.drive);
    await page.goto(fileSelectionUrl(mdFile!));
    await waitForApp(page);

    // Editor.tsx keeps the same accessible name after the CM6 migration.
    await expect(page.getByLabel(EDITOR_RE)).toBeVisible({ timeout: 10_000 });
  });

  test("editing + arrow-key shows the discard dialog; cancel keeps the file", async ({
    page,
  }) => {
    test.skip(!mdSibling, "No sibling file in the same folder");
    await enableTreeFor(page, mdFile!.drive);
    await page.goto(fileSelectionUrl(mdFile!));
    await waitForApp(page);

    const editor = page.getByLabel(EDITOR_RE);
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Type into the editor to publish dirty=true to dirtyRegistry.
    // We use ``pressSequentially`` rather than ``fill`` so the React
    // onChange handler fires per-character (autosave debounce won't
    // commit before we press arrow because the timer is 2s).
    await editor.click();
    await editor.pressSequentially(" edit");

    // Blur the editor so ArrowRight is delivered to ``useFileNav``
    // (its useShortcuts is editingOnly=false; editing surfaces otherwise
    // capture arrow keys for caret movement).
    await editor.evaluate((el) => (el as HTMLElement).blur());
    await page.keyboard.press("ArrowRight");

    // Global DirtyBlocker (mounted in app/layout.tsx) renders
    // ConfirmDialog with the common.discardUnsaved.* copy.
    await expect(page.getByText(DISCARD_TITLE_RE)).toBeVisible({
      timeout: 5_000,
    });

    // Cancel keeps us on the same file. URL should still carry the
    // original ?file=.
    await page.getByRole("button", { name: CANCEL_RE }).click();
    await expect(page.getByText(DISCARD_TITLE_RE)).toBeHidden();
    expect(page.url()).toContain(`file=${mdFile!.id}`);
  });

  test("editing + arrow-key + confirm proceeds to the sibling", async ({
    page,
  }) => {
    test.skip(!mdSibling, "No sibling file in the same folder");
    await enableTreeFor(page, mdFile!.drive);
    await page.goto(fileSelectionUrl(mdFile!));
    await waitForApp(page);

    const editor = page.getByLabel(EDITOR_RE);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    await editor.pressSequentially(" edit");
    await editor.evaluate((el) => (el as HTMLElement).blur());
    await page.keyboard.press("ArrowRight");

    await expect(page.getByText(DISCARD_TITLE_RE)).toBeVisible();
    await page
      .getByRole("button", { name: DISCARD_CONFIRM_RE })
      .click();

    // ``selectFile`` swapped ?file= via router.replace → URL now
    // points at the sibling. The discard-changes dialog has closed.
    await page.waitForURL((url) =>
      url.searchParams.get("file") === mdSibling!.id, {
      timeout: 5_000,
    });
    await expect(page.getByText(DISCARD_TITLE_RE)).toBeHidden();
  });

  test("/addons/knowledge?edit={mdId} redirects to the canonical 2-pane URL", async ({
    page,
  }) => {
    const legacy = `/drive/${encodeURIComponent(mdFile!.drive)}/addons/knowledge?edit=${encodeURIComponent(mdFile!.id)}`;
    await enableTreeFor(page, mdFile!.drive);
    const res = await page.goto(legacy);
    if (!res || res.status() === 404) {
      test.skip(true, "Knowledge addon route not installed");
    }
    // Page.tsx Phase 2 PR-3 case P: ``router.replace`` to canonical
    // URL when the inline-editor flag is on (PR-7 default true).
    await page.waitForURL(
      (url) =>
        url.searchParams.get("file") === mdFile!.id &&
        url.searchParams.get("edit") === "1",
      { timeout: 5_000 },
    );
    expect(page.url()).toContain(`file=${mdFile!.id}`);
    expect(page.url()).toContain("edit=1");
  });

  test("wiki-link popup stays anchored under the caret in split mode while scrolling", async ({
    page,
  }) => {
    test.skip(!wikiAnchorFile, "Could not create a writable Markdown fixture");
    await enableTreeFor(page, wikiAnchorFile!.drive);
    await page.goto(fileSelectionUrl(wikiAnchorFile!));
    await waitForApp(page);

    await page.getByLabel(/分割表示|Split/i).click();
    const editor = page.getByLabel(EDITOR_RE);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    await editor.press("Control+End");
    await editor.pressSequentially("\n[[anchor");

    const popup = page.getByTestId("wiki-link-autocomplete");
    await expect(popup).toBeVisible({ timeout: 5_000 });

    const assertAnchored = async () => {
      const trigger = await editor.evaluate(() => {
        const selection = window.getSelection();
        if (!selection?.focusNode || selection.focusOffset < 8) return null;
        const range = document.createRange();
        range.setStart(selection.focusNode, selection.focusOffset - 8);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, top: rect.top, bottom: rect.bottom };
      });
      const box = await popup.boundingBox();
      expect(trigger).not.toBeNull();
      expect(box).not.toBeNull();
      expect(Math.abs(box!.x - trigger!.left)).toBeLessThan(16);
      expect(box!.y).toBeGreaterThanOrEqual(trigger!.bottom - 2);
      expect(box!.y - trigger!.bottom).toBeLessThan(12);
    };

    await assertAnchored();
    await editor.evaluate((element) => {
      const scroller = element.closest(".cm-editor")?.querySelector(".cm-scroller");
      if (!(scroller instanceof HTMLElement)) return;
      scroller.scrollTop += 32;
      scroller.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(50);
    await assertAnchored();
  });
});
