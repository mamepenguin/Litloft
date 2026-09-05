import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { stripComments } from "./helpers/sourceScan";
import {
  MIGRATION_WINDOWS,
  addonPresent,
  openWindows,
  windowSide,
} from "./helpers/migrationWindows";

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

  // Addons, migrating in PRs C1-C3. Each conversion happens in the addon's own
  // repository while the pointer here still names the commit before it, so
  // `MIGRATION_WINDOWS` declares both endpoints for the ones already written.
  // D1 bumps the pointers and deletes those lines.
  "addons/intelligence/frontend/Page.tsx": "PR C2a (window open until D1)",
  "addons/intelligence/frontend/pages/find.tsx": "PR C2a (window open until D1)",
  "addons/intelligence/frontend/pages/pickup.tsx": "PR C2b (window open until D1)",
  "addons/intelligence/frontend/pages/search-compare.tsx":
    "PR C2b (window open until D1)",
  "addons/media_import/frontend/Page.tsx": "PR C1 (window open until D1)",

  // Not a page header at all: the landing panel of the knowledge two-pane
  // view. DESIGN.md's chrome scale does not govern it.
  "addons/knowledge/frontend/EmptyState.tsx": "knowledge landing panel, not a page header",
  // A pane heading written as <h1>. Demoted in PR C3.
  "addons/knowledge/frontend/FolderView.tsx": "pane heading, demoted to <h2> in PR C3",
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
 * What the staleness rule needs to know about a path.
 *
 * Taken rather than read, and as a required first argument rather than an
 * option. The rule's two excuses — an absent addon, an open window — are both
 * invisible on the near side of a migration, because a file that still writes
 * its `<h1>` is not stale whether or not anything excuses it. Reading the
 * filesystem directly meant the only tree that could witness them was one
 * nobody has yet, and the fixture below said it was witnessing them while
 * standing on the side where they do nothing.
 *
 * `windowSideIn` took the same shape for the same reason, and an *optional*
 * parameter was rejected there because a caller could then substitute the
 * mechanism it was supposed to be constrained by.
 */
interface HeadingSource {
  /** Whether the addon holding this path is checked out at all. */
  present(path: string): boolean;
  /** Whether the file is in the tree. */
  exists(path: string): boolean;
  /** Whether it still writes an `<h1>` by hand. Asked only if it exists. */
  writesHeading(path: string): boolean;
}

/**
 * Which of `paths` no longer earns its place on the not-yet-migrated list.
 *
 * A named function rather than a closure inside the assertion, so the ledger
 * scoping can be given input the real ledger does not contain.
 */
function staleEntriesFrom(source: HeadingSource, paths: string[]): string[] {
  return paths.filter((f) => {
    // An addon that is not checked out is absent, not stale. The *addon*,
    // not the file: this read the file's own path, so a listed file deleted
    // or renamed inside a checked-out addon was excused forever rather than
    // reported — the one thing this test exists to catch, in the one place it
    // could not see.
    if (f.startsWith("addons/") && !source.present(f)) return false;
    // Nor is one whose window is open: the entry is stale on the far side of
    // the migration and correct on the near one, and this checkout can be on
    // either. Scoped to *this* ledger — unscoped, a button window's path
    // skipped the heading check too.
    if (f in MIGRATION_WINDOWS["page-headings"]) return false;
    return !source.exists(f) || !source.writesHeading(f);
  });
}

const FROM_DISK: HeadingSource = {
  present: (f) => addonPresent(REPO_ROOT, f),
  exists: (f) => existsSync(resolve(REPO_ROOT, f)),
  writesHeading: (f) =>
    /<h1\b/.test(stripComments(readFileSync(resolve(REPO_ROOT, f), "utf-8"))),
};

function staleEntries(paths: string[]): string[] {
  return staleEntriesFrom(FROM_DISK, paths);
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
      "addons/intelligence": 4,
      "addons/knowledge": 2,
      "addons/media_import": 1,
    };

    // Headings per file, so a window can be asked about the file it names
    // rather than the root it happens to sit in. The first version hard-coded
    // `addons/media_import` in an `if` and never read the declarations at all
    // — a window for another addon could be declared and go unread, which a
    // mutation proved.
    const perFile = new Map<string, number>();
    for (const h of headings()) perFile.set(h.file, (perFile.get(h.file) ?? 0) + 1);

    // What the open windows have already taken off each root, on this side.
    const crossed = new Map<string, number>();
    for (const path of openWindows("page-headings", (p) =>
      addonPresent(REPO_ROOT, p),
    )) {
      const w = MIGRATION_WINDOWS["page-headings"][path];
      const which = windowSide(perFile.get(path) ?? 0, "page-headings", path, {
        exists: existsSync(resolve(REPO_ROOT, path)),
      });
      if (which === "after") {
        const root = path.split("/").slice(0, 2).join("/");
        crossed.set(root, (crossed.get(root) ?? 0) + w.before);
      }
    }

    for (const [root, listed] of Object.entries(EXPECTED_ADDON_HEADINGS)) {
      const expected = listed - (crossed.get(root) ?? 0);
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

  // The rule above, against input written for it.
  //
  // Everything in this block needs a fixture, and the reason is structural
  // rather than a gap in the declarations. The assertion the real ledger makes
  // is `staleEntries(...) === []`, and both excuses only ever *remove* paths
  // from that result — widening an empty set leaves it empty. So no tree, and
  // no number of declared windows, can make the real assertion go red when an
  // excuse is too broad. Only an assertion that expects something *back* can.
  //
  // A real tree cannot supply that assertion's input either, and not because
  // the path is impossible: a file holding a window and writing no `<h1>` is
  // the far side of every heading migration here. It is that the path which
  // would witness an *over-broad* excuse holds its window on the **other**
  // ledger — and a tree listing such a file under a heading it does not write
  // is already red for the listing itself.
  //
  // Introducing the over-broad excuse then turns that red **green**; it does
  // not hide under it. The one tree where it does hide is a list that also
  // holds an unrelated stale entry: there the assertion stays red and the
  // count silently drops by one.
  //
  // Neither excuse changes the result unless the path would otherwise be
  // stale. That is what the converted state buys — an excuse with an
  // observable effect. On the near side the file still writes its heading, so
  // nothing is excused whether or not the excuse is there.
  describe("what counts as stale", () => {
    /** A source that answers the same way for every path. */
    const saying = (answers: {
      present: boolean;
      exists: boolean;
      writesHeading: boolean;
    }): HeadingSource => ({
      present: () => answers.present,
      exists: () => answers.exists,
      writesHeading: () => answers.writesHeading,
    });

    // The far side of the migration: the addon's pull request has landed, the
    // file is there, and it no longer writes its own heading. Here the window
    // is the only thing between it and the stale list — which is what the
    // real-filesystem version below cannot show, because on this pointer the
    // file still writes one and would be excused by nothing at all.
    const CONVERTED = saying({
      present: true,
      exists: true,
      writesHeading: false,
    });

    it("excuses a converted file while its window is open", () => {
      expect(
        staleEntriesFrom(CONVERTED, ["addons/media_import/frontend/Page.tsx"]),
      ).toEqual([]);
    });

    it("reports a converted file that has no window", () => {
      // The same source and the same answers, so the window is the only
      // difference between this and the case above. Without it the first
      // assertion would pass for a file nothing excuses.
      expect(
        staleEntriesFrom(CONVERTED, ["addons/media_import/frontend/api.ts"]),
      ).toEqual(["addons/media_import/frontend/api.ts"]);
    });

    it("excuses a path whose heading window is open", () => {
      expect(staleEntries(["addons/media_import/frontend/Page.tsx"])).toEqual([]);
    });

    it("does not excuse one whose window is on the other ledger", () => {
      // `Composer.tsx` has no `<h1>` and never had one; its window is the
      // button ledger's. Excusing it here would let a genuinely stale heading
      // entry sit behind an unrelated migration.
      expect(staleEntries(["addons/media_import/frontend/Composer.tsx"])).toEqual([
        "addons/media_import/frontend/Composer.tsx",
      ]);
    });

    it("reports a listed file that no longer writes one", () => {
      expect(staleEntries(["addons/media_import/frontend/api.ts"])).toEqual([
        "addons/media_import/frontend/api.ts",
      ]);
    });

    it("treats an addon that is not checked out as absent", () => {
      expect(staleEntries(["addons/never-existed/frontend/x.tsx"])).toEqual([]);
    });

    it("still reports a file that has gone from an addon that is here", () => {
      // Absence of the addon is a reason; absence of the file is the defect.
      expect(
        staleEntries(["addons/media_import/frontend/DeletedLongAgo.tsx"]),
      ).toEqual(["addons/media_import/frontend/DeletedLongAgo.tsx"]);
    });
  });
});
