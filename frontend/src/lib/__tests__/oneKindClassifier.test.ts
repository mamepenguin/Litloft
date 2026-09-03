import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

/**
 * The listing's kind filter has one implementation, and it is the
 * server's.
 *
 * "What kind of file is this" used to be answered twice for the same
 * question: the backend sifted on `File.file_type` and mime, and
 * `lib/fileTypeFilter.ts` sifted on mime *and the filename extension*.
 * The two agreed on everything the scanner writes today, which is
 * exactly why the disagreement went unnoticed — it showed only on rows
 * whose mime was never recorded, where the tree dropped a `.md` file
 * and the listing beside it kept the same one.
 *
 * What this forbids is narrow on purpose: a **filter** deciding which
 * rows a listing shows. Plenty of client code legitimately asks whether
 * one file in hand is markdown or a PDF — `lib/tags.ts` does it to
 * decide whether tags belong in frontmatter (a documented rule in
 * `.claude/rules/design-decisions.md`), `useCollectionViewMode` to pick
 * a layout, knowledge's editor to choose a mode. Those answer a
 * question about a file the caller already has, not about which files
 * exist, so no second opinion is possible and nothing can drift.
 *
 * Spec: docs/superpowers/specs/2026-09-03-ui-redesign-p1-vocabulary.md item 1.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SELF = fileURLToPath(import.meta.url);
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const SOURCE_ROOTS = [
  "frontend/src",
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `addons/${e.name}/frontend`)
    : []),
];

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
      else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  walk(abs);
  return out;
}

function sitesMatching(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, i) => {
          if (pattern.test(line)) hits.push(`${relative(REPO_ROOT, file)}:${i + 1}`);
        });
    }
  }
  return hits;
}

describe("the listing's kind filter", () => {
  it("has no client-side classifier left", () => {
    expect(sitesMatching(/\bfileMatchesTypeFilter\b/)).toEqual([]);
    expect(existsSync(resolve(REPO_ROOT, "frontend/src/lib/fileTypeFilter.ts"))).toBe(false);
  });

  it("is not compared against `file_type` by hand anywhere", () => {
    // Naming the old classifier was not enough: two inline comparisons
    // survived the first cut of this change, and both went silent
    // rather than wrong. `file_type` is a column of six values; the
    // filter is a vocabulary of eight, so `f.file_type === kind` is
    // false for `markdown` and `pdf` however it is spelled — an empty
    // list, no error, no clue.
    //
    // Two surfaces are exempt, and for the same reason: their listing
    // has no server-side kind filter to disagree with. The trash
    // endpoint takes no kind parameter, and archive entries are read
    // out of a ZIP rather than out of the files table. Both offer only
    // the flat kinds their own toolbar can produce, so the comparison
    // is sound. Listed by path, not by pattern, so each exemption stays
    // visible and has to be re-argued if a server filter ever appears.
    const EXEMPT = [
      "frontend/src/components/trash/TrashView.tsx",
      "frontend/src/components/archive/useArchiveSort.ts",
    ];
    const hits = sitesMatching(
      /\.file_type\s*===\s*(?!["'`])[A-Za-z_$][\w$]*(?![\w$(])/,
    ).filter((where) => !EXEMPT.some((p) => where.startsWith(p)));
    expect(hits).toEqual([]);
  });

  it("is not re-decided against nodes the server already filtered", () => {
    // The tree asked the backend for a filtered subtree and then
    // classified the answer a second time to decide what counted as a
    // match. `computeMatchTables` takes no filter now: a file node that
    // arrived under an active filter satisfies it by having arrived.
    const source = readFileSync(
      resolve(REPO_ROOT, "frontend/src/lib/treeFilterTransform.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/typeFilter/);
  });

  it("names its kinds once, in the vocabulary the backend defines", () => {
    // Two label sets for the same words is how "document" and "文書"
    // drift apart. `filter.type.*` is the only home; the toolbar's own
    // copy under `toolbar.*` is gone.
    const core = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "frontend/src/messages-core/en.json"), "utf-8"),
    ) as { filter: { type: Record<string, string> }; toolbar: Record<string, string> };

    expect(Object.keys(core.filter.type).sort()).toEqual([
      "all", "archive", "audio", "document", "image", "markdown", "other", "pdf", "video",
    ]);
    for (const dropped of ["all", "video", "image", "audio", "document", "archiveType", "other"]) {
      expect(core.toolbar).not.toHaveProperty(dropped);
    }
  });
});
