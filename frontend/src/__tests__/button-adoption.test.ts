import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { stripComments } from "./helpers/stripComments";

/**
 * Where the disabled treatment is still written by hand.
 *
 * `Button` exists so the recipe lives in one place; a hand-written copy is a
 * copy that will not receive a correction. This test holds the list of copies
 * that remain, so the set can only shrink by a change that edits this file.
 *
 * The alternative — a comment saying "the app screens are done, setup and
 * admin are not" — is the shape that has already failed twice in this phase:
 * a hand-maintained enumeration cannot be contradicted by what it leaves out.
 * `ViewToggle`'s comment said four screens when there were six, and the h1
 * acceptance criterion measured "the migrated screens only", which is a set
 * chosen so that it passes.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(REPO_ROOT, "frontend/src");
const ADDON_LINK_DIR = resolve(SRC, "addons");

/** The component that owns the recipe. Not a leftover. */
const OWNER = "components/Button.tsx";

/**
 * Screens Phase 3 does not touch, each for a reason that predates this test.
 *
 * The first-run wizard and the unlock gate are brand surfaces outside the
 * AppShell; `app/admin/` is rebuilt whole by 案 15 / 案 16 in Phase 4. They are
 * the same set the page-heading allowlist excludes, and for the same reason:
 * converting a button on a screen nobody is reviewing this phase changes
 * pixels no one is looking at.
 */
const NOT_CONVERTED: Record<string, number> = {
  "app/setup/steps/CompleteStep.tsx": 1,
  "app/setup/steps/DriveStep.tsx": 1,
  "app/setup/steps/LanguageStep.tsx": 1,
  "app/setup/steps/PasswordStep.tsx": 1,
  "app/unlock/page.tsx": 1,
  "app/admin/markdown-images/MarkdownImagesPresenter.tsx": 2,
};

/** Whole `className` values, however many lines they span. */
function classValues(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    out.push(m[1] ?? m[2] ?? "");
  }
  return out;
}

function handWritten(): Record<string, number> {
  const counts: Record<string, number> = {};
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        const rel = relative(SRC, full);
        if (rel === OWNER) continue;
        const text = stripComments(readFileSync(full, "utf-8"));
        const n = classValues(text).filter((v) =>
          /\bdisabled:bg-sand\b/.test(v),
        ).length;
        if (n > 0) counts[rel] = n;
      }
    }
  };
  walk(SRC);
  return counts;
}

describe("Button adoption", () => {
  // Exact, and per file. A total alone would let a conversion in one screen
  // pay for a new hand-written button in another.
  it("leaves the disabled recipe written out only where it is listed", () => {
    expect(handWritten()).toEqual(NOT_CONVERTED);
  });

  // A stale line reads as a considered exemption while excusing nothing.
  it("keeps the list free of files that no longer need it", () => {
    const counts = handWritten();
    const stale = Object.keys(NOT_CONVERTED).filter((f) => !(f in counts));
    expect(stale).toEqual([]);
  });

  it("still owns the recipe in one place", () => {
    const owner = readFileSync(resolve(SRC, OWNER), "utf-8");
    expect(owner).toContain("disabled:bg-sand");
    expect(owner).toContain("disabled:text-warm-silver");
    expect(owner).toContain("disabled:cursor-not-allowed");
  });
});
