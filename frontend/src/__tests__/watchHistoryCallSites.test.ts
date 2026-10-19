import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ROOTS = [
  resolve(REPO_ROOT, "frontend/src"),
  resolve(REPO_ROOT, "addons"),
];

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      // `frontend/src/addons/*` mirrors the second root as a symlink per
      // file; if that mirror were ever copies, every hit would be reported twice.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (["node_modules", ".git", ".next", "dist"].includes(entry.name)) {
          continue;
        }
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      if (!statSync(full).isFile()) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * The import half catches `import { deleteWatchProgress as dropRow }`,
 * which a scan for the call alone is blind to.
 */
function reaches(name: string, definedIn: string): string[] {
  const called = new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`);
  const imported = new RegExp(
    `import[^;]*\\b${name}\\b[^;]*from\\s*["'][^"']+["']`,
    "s",
  );
  const out: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const rel = relative(REPO_ROOT, file);
      if (rel === definedIn) continue;
      const source = readFileSync(file, "utf-8");
      if (called.test(source) || imported.test(source)) out.push(rel);
    }
  }
  return out.sort();
}

describe("watch history deletion", () => {
  it("finds both trees it is supposed to be scanning", () => {
    expect(sourceFiles(ROOTS[0]).length).toBeGreaterThan(100);
    expect(sourceFiles(ROOTS[1]).length).toBeGreaterThan(20);
  });

  it("is called from one place, and that place is a user pressing it", () => {
    expect(
      reaches("deleteWatchProgress", "frontend/src/lib/api.ts"),
    ).toEqual(["frontend/src/components/ContinueWatchingSection.tsx"]);
  });

  it("has no caller at all for the local-storage half", () => {
    expect(
      reaches("clearProgress", "frontend/src/lib/recentlyPlayed.ts"),
    ).toEqual([]);
  });
});
