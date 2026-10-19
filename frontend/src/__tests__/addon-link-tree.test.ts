/**
 * `frontend/src/addons/<name>` is a real directory holding a link per file.
 * Tools that enumerate a tree — node-`glob` among them, which is how
 * `@vitest/coverage-v8` finds files no test imported — do not descend a
 * symlinked directory, and vitest exposes no way to ask them to.
 */
import { describe, it, expect } from "vitest";
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

/**
 * The population comes from `addons/`, never from `src/addons/`: built from
 * the link trees that exist, an addon checked out and never linked would
 * simply generate fewer cases instead of failing.
 */
const installed: string[] = existsSync(ADDONS_DIR)
  ? readdirSync(ADDONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .filter((name) => existsSync(join(ADDONS_DIR, name, "frontend")))
      .sort()
  : [];

/**
 * `lstat`, never `stat`: a link to a file must count as a file rather than
 * being followed, or the two sides of the comparison below stop being
 * independent — one would walk the addon repository twice instead of once
 * through each layout.
 */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry.startsWith(".")) continue;
      const full = join(d, entry);
      if (lstatSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

describe("the addon link tree", () => {
  it.runIf(installed.length > 0).each(installed)(
    "links %s as a real directory, not a symlink",
    (name) => {
      // Existence first: an addon checked out and never linked is the state
      // this file exists to catch, and `lstat` on a missing path throws an
      // ENOENT that says nothing about which addon or why.
      const dir = join(ADDON_LINK_DIR, name);
      expect(
        existsSync(dir),
        `addons/${name}/frontend is checked out but ${dir} does not exist — run ./setup-addons.sh`,
      ).toBe(true);

      // `isDirectory()` alone would also be true of a
      // symlink under `stat`, which is why this reads `lstat` and asserts
      // both halves.
      const stat = lstatSync(dir);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.isDirectory()).toBe(true);
    },
  );

  it.runIf(installed.length > 0).each(installed)(
    "mirrors every file of %s, and nothing else",
    (name) => {
      const source = filesUnder(join(ADDONS_DIR, name, "frontend"));
      const linked = filesUnder(join(ADDON_LINK_DIR, name));
      expect(linked).toEqual(source);
    },
  );

  it.runIf(installed.length > 0).each(installed)(
    "leaves no dangling link in %s",
    (name) => {
      // A dangling link here is not a skipped file: it fails the whole vitest
      // run with ENOENT. It is what a file deleted from an addon leaves
      // behind until `setup-addons.sh` runs again.
      const dir = join(ADDON_LINK_DIR, name);
      const dangling = filesUnder(dir).filter(
        (rel) => !existsSync(join(dir, rel)),
      );
      expect(dangling).toEqual([]);
    },
  );

  it.runIf(installed.length > 0)(
    "puts the addon frontends where a walk that skips symlinked directories finds them",
    () => {
      // Models node-glob's default traversal rather than asking a collector,
      // because none is configured and `glob` is not a dependency of this
      // package.
      const reached: string[] = [];
      const walk = (d: string) => {
        for (const entry of readdirSync(d)) {
          if (entry.startsWith(".") || entry === "node_modules") continue;
          const full = join(d, entry);
          if (lstatSync(full).isSymbolicLink()) {
            // A symlinked *directory* is where this walk stops. A symlinked
            // file is still a file, and a dangling link is neither.
            if (!existsSync(full)) continue;
            if (statSync(full).isDirectory()) continue;
            reached.push(full);
            continue;
          }
          if (lstatSync(full).isDirectory()) walk(full);
          else reached.push(full);
        }
      };
      walk(resolve(REPO_ROOT, "frontend/src"));

      const expected = installed.flatMap((name) =>
        filesUnder(join(ADDONS_DIR, name, "frontend")).map((rel) =>
          join(ADDON_LINK_DIR, name, rel),
        ),
      );
      const missing = expected.filter((f) => !reached.includes(f));
      expect(missing).toEqual([]);
    },
  );
});
