import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { stripComments } from "./helpers/sourceScan";
import { addonPresent } from "./helpers/addonPresent";

/**
 * Every `<h1>` in core and in every addon checked out beside it.
 *
 * The UI redesign found H1 rendered at four different sizes across fourteen
 * page headers, and the cause was partly in the spec: DESIGN.md §3.2 left the
 * Size cell empty, so each call site chose. §3.2 now says `text-2xl` and
 * `PageHeader` is the one component that emits the tag — this is what keeps
 * both true as screens migrate.
 *
 * **Why the whole tree and an exact count, rather than the migrated screens.**
 * The acceptance criterion this replaces read "the size that appears on `<h1>`
 * is one kind (migrated screens only)". Measuring a set you chose is the same
 * defect as asserting `>=` on a count: what you did not look at cannot fail
 * you, and a screen left out of the list is invisible in exactly the way that
 * matters. `search-compare.tsx` was missing from the spec's own table of
 * fourteen for that reason. So every `<h1>` is listed, the total is asserted
 * exactly, and a screen that has not migrated yet is named below with why —
 * which makes leaving it a decision someone wrote down rather than a gap.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

const SOURCE_ROOTS = [
  "frontend/src",
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `addons/${e.name}/frontend`)
    : []),
];

/**
 * Screens that still write their own `<h1>`, each with the reason it has not
 * moved. Removing a line here is how a migration is recorded; adding one
 * should need an argument.
 */
const NOT_YET_MIGRATED: Record<string, string> = {
  // Brand surfaces outside the AppShell — these are not page headers naming a
  // subject, they are the product introducing itself.
  "frontend/src/app/setup/steps/WelcomeStep.tsx": "first-run wizard, brand surface",
  "frontend/src/app/setup/steps/LanguageStep.tsx": "first-run wizard, brand surface",
  "frontend/src/app/unlock/page.tsx": "unlock gate, outside the AppShell",

  // Rebuilt whole in Phase 4; migrating the header now means touching them twice.
  "frontend/src/app/page.tsx": "root drive picker — hero band is 案 9 (Phase 4)",
  "frontend/src/app/admin/layout.tsx": "admin shell — 案 15 (Phase 4)",
  "frontend/src/app/admin/page.tsx": "admin dashboard — 案 15 (Phase 4)",
  "frontend/src/app/admin/settings/page.tsx": "admin settings — 案 16 (Phase 4)",
  "frontend/src/app/admin/markdown-images/MarkdownImagesPresenter.tsx":
    "admin tool — 案 15 (Phase 4)",

  // Purpose-built chrome that PageHeader has to absorb rather than replace.
  // The inspector's fixed block. It heads a region rather than the page, so it
  // wants to be an <h2> — but `FileDetailChrome` does not emit a page heading
  // yet, so demoting it now would leave the file detail page with no <h1> at
  // all until PR A2b. Both halves move together there. Its `text-xl` is
  // likewise off §3.2 until then.
  "frontend/src/components/FileDetail/FileMetaBlock.tsx":
    "inspector heading; demoted with the FileDetailChrome migration (PR A2b)",


  // Not a page header at all: the landing panel of the knowledge two-pane
  // view. DESIGN.md's chrome scale does not govern it.
  "addons/knowledge/frontend/EmptyState.tsx": "knowledge landing panel, not a page header",
};


/** The one component allowed to emit a page's `<h1>`. */
const OWNER = "frontend/src/components/PageHeader.tsx";

function sourceFiles(root: string): string[] {
  const abs = resolve(REPO_ROOT, root);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(abs);
  return out;
}


interface Heading {
  file: string;
  line: number;
  tag: string;
}

function headings(): Heading[] {
  const found: Heading[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = stripComments(readFileSync(file, "utf-8"));
      for (const m of text.matchAll(/<h1\b[^>]*>/g)) {
        found.push({
          file: relative(REPO_ROOT, file),
          line: text.slice(0, m.index!).split("\n").length,
          tag: m[0],
        });
      }
    }
  }
  return found;
}

/**
 * Which of `paths` no longer earns its place on the not-yet-migrated list.
 *
 * Reads the tree. It took an injected observation while the migration
 * windows existed, because the state that made the rule's excuses do
 * anything was one no checkout held. Both of those are gone: there is one
 * excuse left, and the tests below reach it from disk — an addon that is not
 * checked out is any path under a directory this repository does not have.
 */
function staleEntries(paths: string[]): string[] {
  return paths.filter((f) => {
    // An addon that is not checked out is absent, not stale. The *addon*,
    // not the file: this read the file's own path, so a listed file deleted
    // or renamed inside a checked-out addon was excused forever rather than
    // reported — the one thing this test exists to catch, in the one place it
    // could not see.
    if (f.startsWith("addons/") && !addonPresent(REPO_ROOT, f)) return false;
    const full = resolve(REPO_ROOT, f);
    if (!existsSync(full)) return true;
    return !/<h1\b/.test(stripComments(readFileSync(full, "utf-8")));
  });
}

describe("page headings", () => {
  it("accounts for every <h1> in the tree", () => {
    const unaccounted = headings()
      .map((h) => h.file)
      .filter((f) => f !== OWNER && !(f in NOT_YET_MIGRATED));
    expect([...new Set(unaccounted)].sort()).toEqual([]);
  });

  // The exact count, so that a *new* hand-written `<h1>` in an
  // already-listed file is caught too — the allowlist is keyed by file, and a
  // second heading inside one of them would otherwise slip through.
  it("finds exactly the headings it expects", () => {
    // Counted per source root, not as one total.
    //
    // A single number over core plus every addon is a number that depends on
    // which submodules happen to be checked out. `git clone` without
    // `--recurse-submodules` would fail this with "expected 18, got 17" and
    // nothing pointing at the cause — and the stale check two tests down
    // already treats an absent addon as absent rather than wrong, so a single
    // total would have the file disagreeing with itself.
    //
    // Core's 11 is the number this repository can always assert. Each addon is
    // asserted only when it is present, which still catches a heading added or
    // removed inside one.
    const perRoot = new Map<string, number>();
    for (const h of headings()) {
      const root = h.file.startsWith("addons/")
        ? h.file.split("/").slice(0, 3).join("/")
        : "frontend/src";
      perRoot.set(root, (perRoot.get(root) ?? 0) + 1);
    }
    // 11, not the 10 a file count would suggest: `app/admin/page.tsx` holds
    // two, one per branch. That is precisely the case a per-file allowlist
    // cannot see, which is why counts are asserted at all.
    expect(perRoot.get("frontend/src")).toBe(11);

    const EXPECTED_ADDON_HEADINGS: Record<string, number> = {
      "addons/intelligence": 0,
      "addons/knowledge": 1,
      "addons/media_import": 0,
    };

    for (const [root, expected] of Object.entries(EXPECTED_ADDON_HEADINGS)) {
      // The scanned path, not the submodule directory: an uninitialised
      // submodule leaves `addons/<name>/` behind as an empty directory, so
      // testing that would report a checkout that has nothing in it as
      // present. `frontend/` is what the walk actually reads.
      if (!existsSync(resolve(REPO_ROOT, root, "frontend"))) continue;
      expect(perRoot.get(`${root}/frontend`) ?? 0).toBe(expected);
    }
  });

  it("emits the page heading from exactly one component", () => {
    const owned = headings().filter((h) => h.file === OWNER);
    expect(owned).toHaveLength(1);
  });

  // DESIGN.md §3.2 gives H1 one Size. The migrated screens do not set one at
  // all — they pass a title to `PageHeader` — so the only place a size can be
  // written is the component, and that is what this pins.
  it("gives the owned heading the §3.2 size and nothing else", () => {
    const [owned] = headings().filter((h) => h.file === OWNER);
    expect(owned.tag).toContain("text-2xl");
    expect(owned.tag).toContain("font-bold");
    const others = owned.tag.match(/\btext-(xs|sm|base|lg|xl|3xl|4xl)\b/g);
    expect(others).toBeNull();
  });

  // Every entry must name a real file. A stale line is worse than no line: it
  // reads as a considered decision while excusing nothing.
  it("keeps the not-yet-migrated list free of stale entries", () => {
    expect(staleEntries(Object.keys(NOT_YET_MIGRATED))).toEqual([]);
  });

  // The rule above, against paths the real ledger does not contain.
  //
  // The assertion the real ledger makes is `staleEntries(...) === []`, and
  // the excuse only ever *removes* paths from that result — widening an
  // empty set leaves it empty. So the real assertion cannot go red when the
  // excuse is too broad; only one that expects something *back* can, and
  // that is what these are.
  describe("what counts as stale", () => {
    it("does not excuse one listed by the other ledger", () => {
      // `MoveDialog.tsx` has no `<h1>` and never had one — it is the button
      // ledger's business, not this one's. A heading entry naming it is
      // stale, and being known to another detector does not excuse it.
      expect(staleEntries(["addons/knowledge/frontend/MoveDialog.tsx"])).toEqual([
        "addons/knowledge/frontend/MoveDialog.tsx",
      ]);
    });

    it("reports a listed file that no longer writes one", () => {
      expect(staleEntries(["addons/knowledge/frontend/api.ts"])).toEqual([
        "addons/knowledge/frontend/api.ts",
      ]);
    });

    it("treats an addon that is not checked out as absent", () => {
      expect(staleEntries(["addons/never-existed/frontend/x.tsx"])).toEqual([]);
    });

    it("still reports a file that has gone from an addon that is here", () => {
      // Absence of the addon is a reason; absence of the file is the defect.
      expect(
        staleEntries(["addons/knowledge/frontend/DeletedLongAgo.tsx"]),
      ).toEqual(["addons/knowledge/frontend/DeletedLongAgo.tsx"]);
    });
  });
});
