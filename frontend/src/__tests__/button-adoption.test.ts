import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { stringLiterals, stripComments } from "./helpers/sourceScan";
import { addonPresent } from "./helpers/addonPresent";

/**
 * Addons are read at their real roots rather than through the symlinks, so
 * an addon that is checked out but not enabled is still counted.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(REPO_ROOT, "frontend/src");
const ADDON_LINK_DIR = resolve(SRC, "addons");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");

/** Core, plus every addon checked out beside it, read at its real root. */
const SOURCE_ROOTS: Array<[label: string, dir: string]> = [
  ["frontend/src", SRC],
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e): [string, string] => [
          `addons/${e.name}/frontend`,
          resolve(ADDONS_DIR, e.name, "frontend"),
        ])
    : []),
];

/** The component that owns the recipe. Not a leftover. */
const OWNER = "components/Button.tsx";

const NOT_CONVERTED: Record<string, number> = {
  // Core, brand surfaces outside the AppShell.
  "app/setup/steps/CompleteStep.tsx": 1,
  "app/setup/steps/DriveStep.tsx": 1,
  "app/setup/steps/LanguageStep.tsx": 1,
  "app/setup/steps/PasswordStep.tsx": 1,
  "app/setup/steps/UnlockStep.tsx": 1,
  "app/unlock/page.tsx": 1,
  // Addons. `Button` lives in core and an addon imports it, so these convert
  // in the addon's own repository.
  "addons/cloud-sync/frontend/SyncDriveCard.tsx": 2,
};
function handWritten(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [label, root] of SOURCE_ROOTS) {
    if (!existsSync(root)) continue;
    const walk = (dir: string) => {
      // `frontend/src/addons` mirrors the roots already walked above — a
      // directory per addon holding a symlink per file — so descending it
      // would count every addon site twice.
      if (dir === ADDON_LINK_DIR) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        if (!existsSync(full)) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const rel =
            label === "frontend/src"
              ? relative(SRC, full)
              : `${label}/${relative(root, full)}`;
          if (rel === OWNER) continue;
          // Every string literal, not only `className=` attributes: a class
          // string can live in any const, object literal or helper. Comments
          // are blanked first so prose about the recipe is not the recipe.
          const n = stringLiterals(
            stripComments(readFileSync(full, "utf-8")),
          ).filter((v) => /\bdisabled:bg-sand\b/.test(v)).length;
          if (n > 0) counts[rel] = n;
        }
      }
    };
    walk(root);
  }
  return counts;
}

describe("Button adoption", () => {
  /** An absent addon is absent, not converted. */
  function expected(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(NOT_CONVERTED).filter(([f]) => addonPresent(REPO_ROOT, f)),
    );
  }

  // Exact, and per file. A total alone would let a conversion in one screen
  // pay for a new hand-written button in another.
  it("leaves the disabled recipe written out only where it is listed", () => {
    expect(handWritten()).toEqual(expected());
  });

  it("leaves exactly eight sites unconverted across the repository", () => {
    const observed = handWritten();
    const total = Object.values(observed).reduce((a, b) => a + b, 0);
    const listed = Object.values(expected()).reduce((a, b) => a + b, 0);
    expect(total).toBe(listed);
    if (listed === Object.values(NOT_CONVERTED).reduce((a, b) => a + b, 0)) {
      expect(total).toBe(8);
    }
  });

  it("still owns the recipe in one place", () => {
    const owner = readFileSync(resolve(SRC, OWNER), "utf-8");
    expect(owner).toContain("disabled:bg-sand");
    expect(owner).toContain("disabled:text-warm-silver");
    expect(owner).toContain("disabled:cursor-not-allowed");
  });
});
