/**
 * `frontend/src/addons/<name>` is a directory, and it holds a link per file.
 *
 * That shape is not cosmetic. Tools that enumerate a tree — node-`glob`
 * among them, which is how `@vitest/coverage-v8` finds files no test
 * imported — do not descend a symlinked directory unless asked to, and
 * vitest exposes no way to ask. While each addon was linked in as one
 * directory symlink, an addon frontend file that nothing imported was
 * invisible to every such walk. Measured before this changed: the coverage
 * denominator was 517 of the tree's 524 production files, and the seven
 * missing ones were exactly the addon files no test reaches. Worse than the
 * gap, it moved — 411 for a single-test run, 517 for the full suite, because
 * the only addon files present were the ones some test happened to import.
 *
 * A real directory of symlinked files is descended normally, so the walk
 * reaches every addon file, while each file still resolves back to the addon
 * repository and is edited in one place.
 *
 * What this file holds is the shape, stated as the mechanism rather than as
 * a number: a directory is descended by anything that walks, which is a fact
 * about the filesystem and not about one globber's options. It deliberately
 * does NOT assert a coverage denominator — no coverage is configured yet, and
 * a test cannot read a report that does not exist. The instrument that asks
 * the collector what it actually found belongs with the coverage block.
 *
 * Zero installed addons is a supported state, not a failure: removing the
 * link is how `design-decisions.md` §Addons disables an in-process addon, and
 * a clone without `--recurse-submodules` starts there. So what is installed
 * gates these cases rather than being asserted — the same reasoning
 * `tailwind-scans-addons.test.ts` sets out at greater length. The armed state
 * is CI, which checks the submodules out, runs `setup-addons.sh`, and then
 * asks the collector whether each addon's tests were picked up.
 */
import { describe, it, expect } from "vitest";
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

/** Addons that are both checked out with a frontend and linked in. */
const installed: string[] = existsSync(ADDONS_DIR)
  ? readdirSync(ADDONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .filter((name) => existsSync(join(ADDONS_DIR, name, "frontend")))
      .filter((name) => existsSync(join(ADDON_LINK_DIR, name)))
      .sort()
  : [];

/**
 * Every file under `dir`, as paths relative to it.
 *
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
      // The whole point. `isDirectory()` alone would also be true of a
      // symlink under `stat`, which is why this reads `lstat` and asserts
      // both halves.
      const stat = lstatSync(join(ADDON_LINK_DIR, name));
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.isDirectory()).toBe(true);
    },
  );

  it.runIf(installed.length > 0).each(installed)(
    "mirrors every file of %s, and nothing else",
    (name) => {
      // Two walks of two different trees: the addon repository, which is the
      // source, and the link tree, which is derived from it. Set equality
      // both ways, so a file that was never linked fails as loudly as a link
      // left behind for a file that is gone — a count would catch neither on
      // its own, and enumerating only the links could not catch the first at
      // all.
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
      // Rule 4's teeth. Everything above describes the shape; this asserts
      // the consequence the shape exists for, by walking `frontend/src` the
      // way node-glob does by default — refusing to descend a symlinked
      // directory — and requiring the addon sources to be reached anyway.
      //
      // This models that traversal rule rather than asking a collector,
      // because none is configured yet and `glob` is not a dependency of this
      // package. The rule it models is one line (`if the entry is a symlink
      // to a directory, do not descend`), and before this change it put every
      // addon file out of reach; the coverage-side instrument that asks the
      // real collector belongs with the coverage block.
      const reached: string[] = [];
      const walk = (d: string) => {
        for (const entry of readdirSync(d)) {
          if (entry.startsWith(".") || entry === "node_modules") continue;
          const full = join(d, entry);
          if (lstatSync(full).isSymbolicLink()) {
            // A symlinked *directory* is where this walk stops — that is the
            // rule being modelled. A symlinked file is still a file, and a
            // dangling link is neither (the case above asserts there are
            // none).
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
