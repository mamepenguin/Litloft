import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");

/**
 * Core's tree and every addon's, each read at its own root.
 *
 * Addons are symlinked into `frontend/src/addons` and share core's tsconfig
 * paths, so an addon component can write `@/components/folder/ToolbarMenu`
 * and resolve it. Walking `frontend/src` alone would follow the symlink and
 * report addon files under a core-relative path; skipping the link without
 * reading the trees would drop them from the scan entirely, which is the
 * shape this test exists to refuse. `escape-listeners.test.ts` reads them the
 * same way.
 */
const ROOTS = [
  resolve(REPO_ROOT, "frontend/src"),
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => resolve(ADDONS_DIR, e.name, "frontend"))
        .filter(existsSync)
    : []),
];

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      // Read at its own root instead, so a file is never scanned twice under
      // two different paths.
      if (entry.name === "addons" && dir === ROOTS[0]) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Files naming a `ToolbarMenu` or `ViewMenu` module, by the path they name it
 * at. Every module specifier is read and then matched — a filter over names
 * that look like the ones we expect would score a `folder/ToolbarMenu` spelt
 * some other way as no import at all, which is the case this test exists to
 * catch. Both quote styles, `import(...)`, and an explicit extension are all
 * ways of writing the same specifier, so all four are read.
 */
function menuImporters(): Array<{ file: string; from: string }> {
  const out: Array<{ file: string; from: string }> = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(
        /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g
      )) {
        const from = match[1].replace(/\.(tsx?|jsx?)$/, "");
        if (/(^|\/)(ToolbarMenu|ViewMenu)$/.test(from)) {
          out.push({ file: relative(REPO_ROOT, file), from });
        }
      }
    }
  }
  // Code-unit order, not `localeCompare`: collation is ICU-dependent, and the
  // expected list below would then read differently on a machine with a
  // different one.
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
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
      "frontend/src/components/OverflowMenu.tsx",
      "frontend/src/components/PdfPreview.tsx",
      "frontend/src/components/ViewMenu.tsx",
      "frontend/src/components/__tests__/ToolbarMenu.test.tsx",
      "frontend/src/components/archive/ArchiveToolbar.tsx",
      "frontend/src/components/archive/ArchiveToolbar.tsx",
      "frontend/src/components/folder/FilterMenu.tsx",
      "frontend/src/components/folder/FolderToolbar.tsx",
      "frontend/src/components/folder/FolderToolbar.tsx",
      "frontend/src/components/folder/SortMenu.tsx",
      "frontend/src/components/folder/__tests__/toolbarBarScope.test.tsx",
    ]);
  });

  it("reads every addon tree, not only core's", () => {
    // Asserted rather than assumed: a non-recursive clone has no addon
    // sources, and the scan above would then be silently core-only. The
    // roots are named so that state is visible instead of invisible.
    const submodules = readFileSync(resolve(REPO_ROOT, ".gitmodules"), "utf-8")
      .split("\n")
      .flatMap((line) => line.match(/path\s*=\s*addons\/(.+)$/)?.[1] ?? []);
    expect(submodules.length).toBeGreaterThan(0);
    expect(ROOTS.map((r) => relative(REPO_ROOT, r))).toEqual([
      "frontend/src",
      ...submodules.sort().map((name) => `addons/${name}/frontend`),
    ]);
  });
});
