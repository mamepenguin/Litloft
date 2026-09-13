import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

/**
 * The listing's kind filter has one implementation, and it is the server's.
 * Asking whether one file already in hand is markdown or a PDF is still fine;
 * what is forbidden is a client-side filter deciding which rows a listing shows.
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
    // `f.file_type === kind` is silently false for `markdown` and `pdf`.
    // The exempt surfaces have no server-side kind filter to disagree with
    // and offer only the flat kinds.
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
    const source = readFileSync(
      resolve(REPO_ROOT, "frontend/src/lib/treeFilterTransform.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/typeFilter/);
  });

  it("names its kinds once, in the vocabulary the backend defines", () => {
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
