import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const SRC = resolve(__dirname, "../..");

/** Every source file under `src/`, addon trees excluded. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      // Addon trees are symlinked in here and read at their own root.
      if (entry.name === "addons" && dir === SRC) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(relative(SRC, full));
    }
  };
  walk(SRC);
  return out.sort();
}

/**
 * Files importing from a `ToolbarMenu` or `ViewMenu` module, by the path they
 * name it at. Every import specifier is read and then matched — a filter over
 * names that look like the ones we expect would score a `folder/ToolbarMenu`
 * spelt some other way as no import at all, which is the case this test
 * exists to catch.
 */
function menuImporters(): Array<{ file: string; from: string }> {
  const out: Array<{ file: string; from: string }> = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(resolve(SRC, file), "utf-8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const from = match[1];
      if (/(^|\/)(ToolbarMenu|ViewMenu)$/.test(from)) {
        out.push({ file, from });
      }
    }
  }
  return out;
}

describe("the shared toolbar menu has one home", () => {
  it("is imported from components/, never from folder/", () => {
    // P4V-5 moved `ToolbarMenu` and `ViewMenu` out of `folder/` because the
    // archive toolbar became their second caller. A path left behind still
    // resolves — the file is gone, but a `folder/`-shaped import can be
    // written again by hand or by a rename that fixes only what it touched.
    const strays = menuImporters().filter(({ from }) =>
      /folder\/(ToolbarMenu|ViewMenu)$/.test(from)
    );
    expect(strays).toEqual([]);
  });

  it("is imported by the callers that exist", () => {
    // "None of them are in `folder/`" is also true of a walk that found no
    // imports at all. These are the files that hold one.
    expect(menuImporters().map((i) => i.file)).toEqual([
      "components/ViewMenu.tsx",
      "components/__tests__/ToolbarMenu.test.tsx",
      "components/archive/ArchiveToolbar.tsx",
      "components/archive/ArchiveToolbar.tsx",
      "components/folder/FilterMenu.tsx",
      "components/folder/FolderToolbar.tsx",
      "components/folder/FolderToolbar.tsx",
      "components/folder/SortMenu.tsx",
      "components/folder/__tests__/toolbarBarScope.test.tsx",
    ]);
  });
});
