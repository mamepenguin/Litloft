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

/** Files that *call* the name, as opposed to defining or importing it. */
function callers(name: string): string[] {
  const called = new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`);
  const out: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf-8");
      if (called.test(source)) out.push(relative(REPO_ROOT, file));
    }
  }
  return out.sort();
}

describe("watch history deletion", () => {
  it("finds the trees it is supposed to be scanning", () => {
    // A scanner that walks nothing passes every assertion below it.
    expect(sourceFiles(ROOTS[0]).length).toBeGreaterThan(100);
  });

  it("is called from one place, and that place is a user pressing it", () => {
    // `ContinueWatchingSection` is the "remove from history" control.
    expect(callers("deleteWatchProgress")).toEqual([
      "frontend/src/components/ContinueWatchingSection.tsx",
    ]);
  });

  it("has no caller at all for the local-storage half", () => {
    // `clearProgress` exists in `lib/recentlyPlayed.ts` and nothing
    // calls it. Left defined on purpose; the point is that a playback
    // path has not picked it up.
    expect(callers("clearProgress")).toEqual([]);
  });
});
