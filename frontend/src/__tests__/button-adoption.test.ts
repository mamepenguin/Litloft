import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { classValues } from "./helpers/sourceScan";

/**
 * Where the disabled treatment is still written by hand.
 *
 * `Button` exists so the recipe lives in one place; a hand-written copy is a
 * copy that will not receive a correction. This test holds the list of copies
 * that remain, so the set can only shrink by a change that edits this file.
 *
 * **Core and every addon.** The first version of this file scanned
 * `frontend/src` alone and skipped the `frontend/src/addons` symlinks, which
 * meant it measured 20 of the 43 sites the phase is about — the addons hold
 * 23 more. It condemned hand-maintained enumerations in this very comment
 * while being one: a scope that leaves out 23 sites cannot be contradicted by
 * them. Addons are read at their real roots rather than through the symlinks,
 * the way `design-tokens.test.ts` does, so an addon that is checked out but
 * not enabled is still counted.
 *
 * That failure is the reason the comment above is worth keeping: `ViewToggle`
 * named four screens when there were six, the h1 criterion measured "migrated
 * screens only", and this file measured "core only". Three times, one shape.
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
  // Core, brand surfaces outside the AppShell.
  "app/setup/steps/CompleteStep.tsx": 1,
  "app/setup/steps/DriveStep.tsx": 1,
  "app/setup/steps/LanguageStep.tsx": 1,
  "app/setup/steps/PasswordStep.tsx": 1,
  "app/unlock/page.tsx": 1,
  // Core, rebuilt whole by 案 15 / 案 16 in Phase 4.
  "app/admin/markdown-images/MarkdownImagesPresenter.tsx": 2,

  // Addons. `Button` lives in core and an addon imports it, so these convert
  // in the addon PRs — media_import in C1, intelligence in C2, knowledge in
  // C3 — each of which is a pull request in its own repository. cloud-sync is
  // out of Phase 3 entirely (DESIGN.md §6 records why).
  "addons/cloud-sync/frontend/SyncDriveCard.tsx": 2,
  "addons/intelligence/frontend/AdminEmbeddingSettingsSection.tsx": 1,
  "addons/intelligence/frontend/AdminFeaturesSettingsSection.tsx": 1,
  "addons/intelligence/frontend/AdminLLMSettingsSection.tsx": 1,
  "addons/intelligence/frontend/AdminRAGSettingsSection.tsx": 1,
  "addons/intelligence/frontend/AdminTranscriptionSettingsSection.tsx": 1,
  "addons/intelligence/frontend/KnowledgeSaveDialog.tsx": 1,
  "addons/intelligence/frontend/Page.tsx": 1,
  "addons/intelligence/frontend/UnverifiedSourceSection.tsx": 1,
  "addons/intelligence/frontend/pages/find.tsx": 1,
  "addons/intelligence/frontend/pages/search-compare.tsx": 1,
  "addons/knowledge/frontend/CaptureBasket.tsx": 3,
  "addons/knowledge/frontend/ClipDuplicateDialog.tsx": 1,
  "addons/knowledge/frontend/ClipInput.tsx": 1,
  "addons/knowledge/frontend/ClipPasteForm.tsx": 1,
  "addons/knowledge/frontend/FolderView.tsx": 1,
  "addons/knowledge/frontend/KnowledgeDashboard.tsx": 1,
  "addons/knowledge/frontend/MoveDialog.tsx": 1,
  "addons/knowledge/frontend/UnresolvedLinkDialog.tsx": 1,
  "addons/media_import/frontend/Composer.tsx": 1,
};
function handWritten(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [label, root] of SOURCE_ROOTS) {
    if (!existsSync(root)) continue;
    const walk = (dir: string) => {
      // The symlinks under `frontend/src/addons` point at the roots already
      // walked above; following them would count every addon site twice.
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
          // `classValues` reads attributes *and* `*_CLASS` constants, and
          // handles `{"..."}`, `{`...`}` and `{[...]}` alike. The first
          // version matched only `"..."` and `{`...`}`, so a recipe written
          // any other way — 38 files in core write `className={<expr>}` — was
          // invisible, and the set this file claims can only shrink could in
          // fact grow without it noticing.
          const n = classValues(readFileSync(full, "utf-8")).filter((v) =>
            /\bdisabled:bg-sand\b/.test(v),
          ).length;
          if (n > 0) counts[rel] = n;
        }
      }
    };
    walk(root);
  }
  return counts;
}

describe("Button adoption", () => {
  /**
   * The listed sites, minus any addon that is not checked out.
   *
   * Widening this test to the addons brought back the defect the page-heading
   * detector had already been fixed for: a `git clone` without
   * `--recurse-submodules` failed it with a 26-vs-25 object diff and nothing
   * naming the cause. An absent addon is absent, not converted.
   */
  function expected(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(NOT_CONVERTED).filter(([f]) => {
        if (!f.startsWith("addons/")) return true;
        const root = resolve(REPO_ROOT, f.split("/").slice(0, 3).join("/"));
        return existsSync(root);
      }),
    );
  }

  // Exact, and per file. A total alone would let a conversion in one screen
  // pay for a new hand-written button in another.
  //
  // Bidirectional, so this is also the stale-entry check: a listed file that
  // stopped writing the recipe by hand fails it just as a new hand-written one
  // does. An earlier version had a second test for staleness, which could not
  // fail on its own — `toEqual` had already caught every case it looked at. A
  // guard nothing can break is not a second defence, it is a sentence that
  // reads like one.
  it("leaves the disabled recipe written out only where it is listed", () => {
    expect(handWritten()).toEqual(expected());
  });

  // The population this phase is about. DESIGN.md §6 says 43 sites carry the
  // treatment and 13 are converted, so 30 remain. Asserting the total as well
  // as the per-file map is what makes both numbers checkable rather than
  // remembered — and the second half keeps it honest in a checkout holding
  // fewer addons than this one.
  it("leaves exactly thirty sites unconverted across the repository", () => {
    const total = Object.values(handWritten()).reduce((a, b) => a + b, 0);
    const listed = Object.values(expected()).reduce((a, b) => a + b, 0);
    expect(total).toBe(listed);
    if (listed === Object.values(NOT_CONVERTED).reduce((a, b) => a + b, 0)) {
      expect(total).toBe(30);
    }
  });

  it("still owns the recipe in one place", () => {
    const owner = readFileSync(resolve(SRC, OWNER), "utf-8");
    expect(owner).toContain("disabled:bg-sand");
    expect(owner).toContain("disabled:text-warm-silver");
    expect(owner).toContain("disabled:cursor-not-allowed");
  });
});
