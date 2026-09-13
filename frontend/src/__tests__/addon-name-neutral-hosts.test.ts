import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** By role, not by directory: the code that decides which addon entries a host shows. */
const HOSTS: Record<string, readonly string[]> = {
  "draws addon navigation rows": [
    "lib/addonNavigation.ts",
    "components/sidebar/AddonNavRows.tsx",
    "components/sidebar/SidebarLibrarySection.tsx",
    "components/Sidebar.tsx",
  ],
  "hosts the Add menu's addon rows": [
    "components/AddButton.tsx",
    "components/DriveHome.tsx",
    "components/folder/FolderToolbar.tsx",
  ],
};

const BUNDLED_ADDONS = ["cloud-sync", "intelligence", "knowledge", "media_import"];

/** Every string the file's code holds — literals and template pieces, never comments. */
function codeStrings(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(resolve(SRC, path), "utf8"), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push(node.text);
    }
    if (ts.isJsxText(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("hosts of addon entries name no bundled addon", () => {
  it("covers the files it was declared with", () => {
    expect(Object.values(HOSTS).flat().length).toBe(7);
  });

  it("reads strings out of code, so a planted name would be seen", () => {
    expect(codeStrings("components/AddButton.tsx")).toContain("folder-actions-menu");
  });

  it.each(Object.entries(HOSTS).flatMap(([role, files]) => files.map((f) => [role, f])))(
    "%s: %s",
    (_, file) => {
      const hits = codeStrings(file).filter((s) =>
        BUNDLED_ADDONS.some((name) => new RegExp(`(^|[^a-z_-])${name}($|[^a-z_-])`).test(s)),
      );
      expect(hits).toEqual([]);
    },
  );
});
