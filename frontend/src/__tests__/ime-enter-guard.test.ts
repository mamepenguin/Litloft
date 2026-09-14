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
const ADDONS_DIR = resolve(SRC, "../../addons");

/** Text fields whose Enter acts: each is rendered by a test that confirms a conversion with Enter. */
const TEXT_FIELD_ENTER = [
  "components/CollectionDetail.tsx",
  "components/CollectionPicker.tsx",
  "components/EditableTagChips.tsx",
  "components/FileSaveDialog.tsx",
  "components/GlobalSearch.tsx",
  "components/InlineNameEditor.tsx",
  "components/PdfPreview.tsx",
  "components/SelectionBar.tsx",
  "components/SmartFolderSaveDialog.tsx",
  "components/folder/FolderToolbar.tsx",
  "components/settings/ProfileSection.tsx",
  "components/sidebar/SidebarCollectionsSection.tsx",
];

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

/** Addon text fields whose Enter acts, each guarded and render-tested in its own repository. */
const ADDON_TEXT_FIELD_ENTER = [
  "intelligence/frontend/Page.tsx",
  "intelligence/frontend/pages/search-compare.tsx",
  "media_import/frontend/Composer.tsx",
  "media_import/frontend/ImportFromUrlDialog.tsx",
];

/**
 * DetailedSummarySection moves between headings, not in a text field.
 * WikiLinkAutocomplete answers keys the Markdown editor forwards to it, not a
 * field of its own.
 */
const ADDON_NOT_A_GUARDED_ENTER = [
  "intelligence/frontend/DetailedSummarySection.tsx",
  "knowledge/frontend/WikiLinkAutocomplete.tsx",
];

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

function enterFiles(root: string): string[] {
  return sourceFiles(root)
    .map((file) => ({ rel: relative(root, file), text: stripComments(readFileSync(file, "utf-8")) }))
    .filter(({ rel, text }) => rel !== MECHANISM && /["'`]Enter["'`]|keyCode\s*===?\s*13/.test(text))
    .map(({ rel }) => rel)
    .sort();
}

describe("core files handling Enter", () => {
  it("are all declared as a text field or not", () => {
    const declared = [...TEXT_FIELD_ENTER, ...NOT_A_TEXT_FIELD_ENTER].sort();
    expect(declared).toHaveLength(17);
    expect(enterFiles(SRC)).toEqual(declared);
  });

  it("are all declared in the addons as well", () => {
    const declared = [...ADDON_TEXT_FIELD_ENTER, ...ADDON_NOT_A_GUARDED_ENTER].sort();
    expect(declared).toHaveLength(6);
    const found = readdirSync(ADDONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => resolve(ADDONS_DIR, e.name, "frontend"))
      .filter(existsSync)
      .flatMap((root) => enterFiles(root).map((rel) => relative(ADDONS_DIR, resolve(root, rel))))
      .sort();
    expect(found).toEqual(declared);
  });

  it("does not count Enter mentioned only in comments", () => {
    const root = mkdtempSync(join(tmpdir(), "ime-guard-"));
    try {
      mkdirSync(join(root, "components"));
      writeFileSync(
        join(root, "components", "Commented.tsx"),
        ['// if (e.key === "Enter") submit();', '/* "Enter" */', "export const x = 1;"].join("\n"),
      );
      writeFileSync(
        join(root, "components", "Real.tsx"),
        'export const f = (e: KeyboardEvent) => e.key === "Enter";\n',
      );
      expect(enterFiles(root)).toEqual(["components/Real.tsx"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
