import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { stringLiterals, stripComments } from "./helpers/sourceScan";
import {
  MIGRATION_WINDOWS,
  addonPresent,
  openWindows as declaredWindows,
  windowSide,
} from "./helpers/migrationWindows";

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
  // in the addon PRs — media_import in C1, intelligence in C2a/C2b, knowledge
  // in C3 — each of which is a pull request in its own repository. The first
  // two have landed and their pointers have moved, so only knowledge is left.
  // cloud-sync is out of Phase 3 entirely (DESIGN.md §6 records why).
  //
  // knowledge's windows were declared *ahead of* the addon work, because
  // core's ledger has to admit the converted shape before that repository's own
  // CI can go green. **Its pointer must not move until C3 lands**, and D1b is
  // the pull request that moves it and removes them.
  "addons/cloud-sync/frontend/SyncDriveCard.tsx": 2,
  "addons/knowledge/frontend/CaptureBasket.tsx": 3,
  "addons/knowledge/frontend/ClipDuplicateDialog.tsx": 1,
  "addons/knowledge/frontend/ClipInput.tsx": 1,
  "addons/knowledge/frontend/ClipPasteForm.tsx": 1,
  "addons/knowledge/frontend/FolderView.tsx": 1,
  "addons/knowledge/frontend/KnowledgeDashboard.tsx": 1,
  "addons/knowledge/frontend/MoveDialog.tsx": 1,
  "addons/knowledge/frontend/UnresolvedLinkDialog.tsx": 1,
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
          // Every string literal, not only `className=` attributes and
          // `*_CLASS` constants.
          //
          // The first version read attributes plus constants named by
          // convention, and four ways of writing the same recipe hid from it:
          // `const btnCls = "…"`, an object literal, a helper that returns the
          // string, a `cva()` call. The convention was doing load-bearing work
          // and is not kept — `PropertiesPanel.tsx` and `RelatedFilesSection.tsx`
          // both hold class strings in a `const cls`. Enforcing it was the
          // other option and is worse: it adds a rule to keep and leaves the
          // premise in place. Reading every literal removes the premise.
          //
          // Breadth is free here because the filter is `disabled:bg-sand`,
          // which no literal carries by accident, and comments are blanked
          // first so prose about the recipe is not the recipe.
          //
          // This counts the literals that carry the recipe, which is to say
          // the *places* that write it — not the copies of it. One className
          // holding the token twice reads as one, and that is the right unit:
          // the ledger is a list of buttons to convert, and a second copy
          // inside one attribute is not a second button. A second button is a
          // second literal, and that does move the count.
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
  /**
   * The listed sites, minus any addon that is not checked out.
   *
   * Widening this test to the addons brought back the defect the page-heading
   * detector had already been fixed for: a `git clone` without
   * `--recurse-submodules` failed it with a 26-vs-25 object diff and nothing
   * naming the cause. An absent addon is absent, not converted.
   */
  /**
   * The windows whose file is actually in this checkout.
   *
   * An addon that is not checked out is absent, not mid-migration — the same
   * distinction `expected()` draws two lines down.
   */
  function openWindows(): string[] {
    return declaredWindows("button-adoption", (path) =>
      addonPresent(REPO_ROOT, path),
    );
  }

  const side = (observed: Record<string, number>, path: string) =>
    windowSide(observed[path] ?? 0, "button-adoption", path, {
      exists: existsSync(resolve(REPO_ROOT, path)),
    });

  function expected(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(NOT_CONVERTED).filter(([f]) => {
        if (!f.startsWith("addons/")) return true;
        const root = resolve(REPO_ROOT, f.split("/").slice(0, 3).join("/"));
        return existsSync(root);
      }),
    );
  }

  /**
   * The listed sites a given observation has already crossed off.
   *
   * Taken as an argument so the crossing can be asked about a tree this
   * checkout does not hold. D1 deleted the last window sitting on `after`;
   * every one that remains is on `before`, so `side(...) === "after"` is
   * false everywhere here and both of these branches became unreachable.
   * They could be broken and nothing would notice until an addon's CI dropped
   * a converted tree into core, a repository away and weeks later.
   *
   * The ledger still judges. `observed` supplies counts; `windowSide` reads
   * `MIGRATION_WINDOWS` and refuses anything that is neither endpoint.
   */
  function crossedFrom(observed: Record<string, number>): number {
    return openWindows()
      .filter((path) => side(observed, path) === "after")
      .reduce(
        (a, path) => a + MIGRATION_WINDOWS["button-adoption"][path].before,
        0,
      );
  }

  /** The listed map with everything that observation has crossed removed. */
  function wantFrom(observed: Record<string, number>): Record<string, number> {
    const want = expected();
    for (const path of openWindows()) {
      if (side(observed, path) === "after") delete want[path];
    }
    return want;
  }

  it("crosses a converted addon off the listed sites", () => {
    // The half D1 made unreachable, asked about a tree where knowledge has
    // been converted: no file writes the recipe, so every one of its eight
    // windows resolves to `after`.
    const converted = {};
    expect(crossedFrom(converted)).toBe(10);
    expect(
      Object.keys(wantFrom(converted)).filter((k) =>
        k.startsWith("addons/knowledge/"),
      ),
    ).toEqual([]);
    // The near side through the same functions: nothing crossed, and every
    // knowledge entry still listed.
    const unconverted = handWritten();
    expect(crossedFrom(unconverted)).toBe(0);
    expect(
      Object.keys(wantFrom(unconverted)).filter((k) =>
        k.startsWith("addons/knowledge/"),
      ),
    ).toHaveLength(8);
  });

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
    // Two acceptable ledgers while a window is open — the listed entry
    // present, or gone — and nothing else. Deep-equal against whichever the
    // observed side names, so a *different* file changing still fails.
    expect(handWritten()).toEqual(wantFrom(handWritten()));
  });

  // The population this phase is about. DESIGN.md §6 says 43 sites carry the
  // treatment; 13 were converted in A2b and a further 11 in C1/C2a/C2b, so 19
  // remain. Asserting the total as well
  // as the per-file map is what makes both numbers checkable rather than
  // remembered — and the second half keeps it honest in a checkout holding
  // fewer addons than this one.
  it("leaves exactly nineteen sites unconverted across the repository", () => {
    const observed = handWritten();
    const total = Object.values(observed).reduce((a, b) => a + b, 0);
    const crossed = crossedFrom(observed);
    const listed = Object.values(expected()).reduce((a, b) => a + b, 0);
    expect(total).toBe(listed - crossed);
    if (listed === Object.values(NOT_CONVERTED).reduce((a, b) => a + b, 0)) {
      expect(total).toBe(19 - crossed);
    }
  });

  it("still owns the recipe in one place", () => {
    const owner = readFileSync(resolve(SRC, OWNER), "utf-8");
    expect(owner).toContain("disabled:bg-sand");
    expect(owner).toContain("disabled:text-warm-silver");
    expect(owner).toContain("disabled:cursor-not-allowed");
  });
});
