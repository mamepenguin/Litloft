import { describe, it, expect } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "@/__tests__/helpers/sourceScan";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADDON_LINK_DIR = resolve(SRC, "addons");

/** Text fields whose Enter acts: each keydown handler asks `isImeKeystroke` first. */
const GUARDED: Record<string, number> = {
  "components/CollectionDetail.tsx": 1,
  "components/CollectionPicker.tsx": 1,
  "components/EditableTagChips.tsx": 1,
  "components/FileSaveDialog.tsx": 1,
  "components/GlobalSearch.tsx": 1,
  "components/InlineNameEditor.tsx": 1,
  "components/PdfPreview.tsx": 1,
  "components/SelectionBar.tsx": 1,
  "components/ShortcutsProvider.tsx": 1,
  "components/SmartFolderSaveDialog.tsx": 1,
  "components/folder/FolderToolbar.tsx": 1,
  "components/settings/ProfileSection.tsx": 1,
  "components/sidebar/SidebarCollectionsSection.tsx": 2,
};

/**
 * Enter on something that is not a text field (a row, a card, a menu), or
 * Cmd/Ctrl+Enter in a textarea, which an IME never sends to confirm.
 */
const NOT_A_TEXT_FIELD_ENTER = [
  "components/CommentSection.tsx",
  "components/FileListRow.tsx",
  "components/folder/FilterField.tsx",
  "components/search/MergedResultItem.tsx",
  "hooks/useFileCardLink.ts",
];

/** Guarded, but reads the key through `normalizeKey` rather than naming Enter. */
const GUARDED_BY_NORMALIZED_KEY = ["components/ShortcutsProvider.tsx"];

const MECHANISM = "lib/ime.ts";

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue;
      if (full.startsWith(ADDON_LINK_DIR)) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function scan(root: string) {
  const enterFiles: string[] = [];
  const guardCalls: Record<string, number> = {};
  for (const file of sourceFiles(root)) {
    const rel = relative(root, file);
    if (rel === MECHANISM) continue;
    const text = stripComments(readFileSync(file, "utf-8"));
    if (/["'`]Enter["'`]|keyCode\s*===?\s*13/.test(text)) enterFiles.push(rel);
    const calls = text.match(/\bisImeKeystroke\(/g)?.length ?? 0;
    if (calls > 0) guardCalls[rel] = calls;
  }
  return { enterFiles: enterFiles.sort(), guardCalls };
}

describe("IME guard on Enter in text fields", () => {
  const { enterFiles, guardCalls } = scan(SRC);

  it("every core file handling Enter is declared", () => {
    expect(enterFiles).toEqual(
      [
        ...Object.keys(GUARDED).filter((f) => !GUARDED_BY_NORMALIZED_KEY.includes(f)),
        ...NOT_A_TEXT_FIELD_ENTER,
      ].sort(),
    );
  });

  it("each guarded file asks the guard once per text field", () => {
    expect(guardCalls).toEqual(GUARDED);
    expect(Object.values(guardCalls).reduce((a, b) => a + b, 0)).toBe(14);
  });

  it("does not count Enter or the guard mentioned only in comments", () => {
    const root = mkdtempSync(join(tmpdir(), "ime-guard-"));
    try {
      mkdirSync(join(root, "components"));
      writeFileSync(
        join(root, "components", "Commented.tsx"),
        [
          '// if (e.key === "Enter") ime.isImeKeystroke(e);',
          '/* isImeKeystroke(e) && "Enter" */',
          "export const x = 1;",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "components", "Real.tsx"),
        'export const f = (e: KeyboardEvent) => ime.isImeKeystroke(e) || e.key === "Enter";\n',
      );
      expect(scan(root)).toEqual({
        enterFiles: ["components/Real.tsx"],
        guardCalls: { "components/Real.tsx": 1 },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
