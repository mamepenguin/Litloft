import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Who is allowed to delete a watch-history row.
 *
 * `.claude/rules/design-decisions.md`, watch history: **reaching the end
 * of a media file records the final position; it never deletes the
 * record.** Deleting is reserved for an explicit user action, because
 * the row is the only thing that distinguishes "watched to the end"
 * from "never opened" — and the 90% gate already keeps a finished file
 * out of continue-watching, so a completion path has nothing to gain by
 * removing it.
 *
 * A call-site scan rather than a behavioural test, because the failure
 * this guards against is not a bug in today's code: it is the next
 * person wiring `onEnded` to a tidy-up. `usePlaybackProgress` has its
 * own tests for what completion writes; nothing there can see a new
 * caller appearing in a component three files away.
 *
 * The lists are exact. A `>=` here, or a "these files are among the
 * callers", would pass for a caller nobody meant to add — which is the
 * entire failure.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ROOTS = [
  resolve(REPO_ROOT, "frontend/src"),
  resolve(REPO_ROOT, "addons"),
];

/** Source files, skipping tests, builds and the symlinked addon copies. */
function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      // `frontend/src/addons/*` are symlinks to the same trees the
      // second root walks; following them reports every hit twice.
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
 * Files that reach for the name at all — calling it, or importing it
 * under any name.
 *
 * The import half is what makes this survive a rename at the call site.
 * A scan for `deleteWatchProgress(` alone is blind to
 * `import { deleteWatchProgress as dropRow }`, which is one keystroke
 * from the exact edit this exists to catch. Nothing can use the
 * function without naming it in an import first, so the import is the
 * chokepoint and the call is the convenience.
 *
 * The defining module is excluded by name rather than by pattern:
 * `export async function deleteWatchProgress` would otherwise report
 * `lib/api.ts` as its own caller.
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
    // A scanner that walks nothing passes every assertion below it, and
    // the addon half is the one that goes missing quietly — `addons/`
    // is absent in a frontend-only checkout and `sourceFiles` returns
    // an empty list rather than complaining.
    expect(sourceFiles(ROOTS[0]).length).toBeGreaterThan(100);
    expect(sourceFiles(ROOTS[1]).length).toBeGreaterThan(20);
  });

  it("is called from one place, and that place is a user pressing it", () => {
    // `ContinueWatchingSection` is the "remove from history" control.
    expect(
      reaches("deleteWatchProgress", "frontend/src/lib/api.ts"),
    ).toEqual(["frontend/src/components/ContinueWatchingSection.tsx"]);
  });

  it("has no caller at all for the local-storage half", () => {
    // `clearProgress` exists in `lib/recentlyPlayed.ts` and nothing
    // calls it. Left defined on purpose; the point is that a playback
    // path has not picked it up.
    expect(
      reaches("clearProgress", "frontend/src/lib/recentlyPlayed.ts"),
    ).toEqual([]);
  });
});
