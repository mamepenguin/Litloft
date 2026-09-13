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
 * Each test skips when its fixture (a writable Markdown file with a sibling
 * in the same folder) is missing rather than failing.
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
let cursorNavigationFile: FileItem | null = null;

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
  // The 2-pane host only mounts when the per-drive ``tree:enabled`` flag
  // is true at load.
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
  cursorNavigationFile = await createTextFile(
    driveName,
    `cursor-navigation-e2e-${unique}.md`,
    [
      "plain one",
      "# heading two",
      "plain three",
      "***",
      "plain five",
      "**bold six**",
      "plain seven",
      "> quote eight",
      "plain nine",
      "[link ten](https://example.test)",
      "plain eleven",
      "- bullet twelve",
      "plain thirteen",
      "1. ordered fourteen",
      "plain fifteen",
      "- [ ] task sixteen",
      "plain seventeen",
    ].join("\n"),
  );
});

test.afterAll(async () => {
  if (wikiAnchorFile) await deleteFile(wikiAnchorFile.id).catch(() => {});
  if (cursorNavigationFile) {
    await deleteFile(cursorNavigationFile.id).catch(() => {});
  }
});

test.describe("Inline Knowledge editor (PR-7)", () => {
  test.skip(() => !driveName || !mdFile, "No writable .md fixture");

  test("?file={mdId} mounts the inline CodeMirror editor", async ({ page }) => {
    await enableTreeFor(page, mdFile!.drive);
    await page.goto(fileSelectionUrl(mdFile!));
    await waitForApp(page);

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

    // ``pressSequentially`` rather than ``fill``, so onChange fires per
    // character; the 2s autosave debounce does not commit before the arrow.
    await editor.click();
    await editor.pressSequentially(" edit");

    // Blurred, or the editor captures the arrow key for caret movement.
    await editor.evaluate((el) => (el as HTMLElement).blur());
    await page.keyboard.press("ArrowRight");

    await expect(page.getByText(DISCARD_TITLE_RE)).toBeVisible({
      timeout: 5_000,
    });

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

  test("Arrow keys visit every decorated Markdown line in order", async ({ page }) => {
    test.skip(
      !cursorNavigationFile,
      "Could not create a writable cursor-navigation fixture",
    );
    await enableTreeFor(page, cursorNavigationFile!.drive);
    await page.goto(fileSelectionUrl(cursorNavigationFile!, { edit: "1" }));
    await waitForApp(page);

    const editor = page.getByLabel(EDITOR_RE);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(editor.locator(".cm-live-list-marker")).toHaveText(["•", "1."]);
    await expect(
      editor.locator(".cm-line").filter({ hasText: "task sixteen" }),
    ).not.toContainText("•");
    const ruleMargins = await editor
      .locator(".cm-live-horizontal-rule")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          top: Number.parseFloat(style.marginTop),
          bottom: Number.parseFloat(style.marginBottom),
        };
      });
    expect(ruleMargins.top).toBeLessThanOrEqual(8);
    expect(ruleMargins.bottom).toBeLessThanOrEqual(8);
    await editor.locator(".cm-line").first().click();
    await editor.press("Home");

    const currentLineText = () =>
      editor.evaluate(() => {
        const focusNode = window.getSelection()?.focusNode;
        const focusElement =
          focusNode instanceof Element ? focusNode : focusNode?.parentElement;
        return focusElement?.closest(".cm-line")?.textContent?.trim() ?? "";
      });

    const expectedLines = [
      "plain one",
      "heading two",
      "plain three",
      "***",
      "plain five",
      "bold six",
      "plain seven",
      "quote eight",
      "plain nine",
      "link ten",
      "plain eleven",
      "bullet twelve",
      "plain thirteen",
      "ordered fourteen",
      "plain fifteen",
      "task sixteen",
      "plain seventeen",
    ];
    await expect.poll(currentLineText).toContain(expectedLines[0]);
    for (let index = 1; index < expectedLines.length; index += 1) {
      await editor.press("ArrowDown");
      await expect.poll(currentLineText).toContain(expectedLines[index]);
    }
    for (let index = expectedLines.length - 2; index >= 0; index -= 1) {
      await editor.press("ArrowUp");
      await expect.poll(currentLineText).toContain(expectedLines[index]);
    }

    // Core owns this shortcut. CM6 also binds Shift-Mod-k to deleteLine,
    // so verify the source line survives before the core code-block action.
    const codeBlockShortcut = await page.evaluate(() =>
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
        ? "Meta+Shift+K"
        : "Control+Shift+K",
    );
    await editor.press(codeBlockShortcut);
    await expect(editor).toContainText("plain one");
    await expect
      .poll(() => editor.locator(".cm-live-code-block").count())
      .toBeGreaterThanOrEqual(3);
  });
});
