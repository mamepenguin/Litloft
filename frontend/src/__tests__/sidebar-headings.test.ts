import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { SIDEBAR_HEADING_CLASSES } from "@/test/sidebarHeadingClasses";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const SIDEBAR_DIR = resolve(REPO_ROOT, "frontend/src/components/sidebar");
const SIDEBAR_ROOT_FILE = resolve(REPO_ROOT, "frontend/src/components/Sidebar.tsx");

const HEADING_CLASSES = [...SIDEBAR_HEADING_CLASSES];

function classLists(text: string): string[] {
  return [
    ...[...text.matchAll(/className="([^"]*)"/g)].map((m) => m[1]),
    ...[...text.matchAll(/className=\{`([^`]*)`\}/g)].map((m) => m[1]),
    // `const foo = "…"` / `` `…` `` class strings handed to className
    // elsewhere in the file — the sidebar's own heading is written
    // this way.
    ...[...text.matchAll(/=\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
  ];
}

function wearsHeadingClasses(text: string): boolean {
  return classLists(text).some((cls) => {
    const classes = new Set(cls.split(/\s+/));
    return HEADING_CLASSES.every((c) => classes.has(c));
  });
}
const HEADING_COMPONENT = "frontend/src/components/sidebar/SidebarSectionHeading.tsx";

function sourceFiles(dir: string, skipTests = true): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (skipTests && (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name))) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const rel = (f: string) => relative(REPO_ROOT, f);

describe("sidebar section headings", () => {
  const files = [...sourceFiles(SIDEBAR_DIR), SIDEBAR_ROOT_FILE];

  it("has one component that knows what a section heading looks like", () => {
    const writers = files.filter((f) => wearsHeadingClasses(readFileSync(f, "utf-8")));
    expect(writers.map(rel)).toEqual([HEADING_COMPONENT]);
  });

  it("draws every one of them from it", () => {
    // The count is of *uses*, not of distinct labels: one file draws two
    // of them, so the set below is shorter than the number above and the
    // two are not redundant.
    const uses = files.flatMap((f) =>
      [...readFileSync(f, "utf-8").matchAll(/<SidebarSectionHeading\b/g)].map(() => rel(f)),
    );
    expect(uses.length).toBe(7);
    expect([...new Set(uses)].sort()).toEqual([
      "frontend/src/components/sidebar/SidebarCollectionsSection.tsx",
      "frontend/src/components/sidebar/SidebarLibrarySection.tsx",
      "frontend/src/components/sidebar/SidebarPinsSection.tsx",
      "frontend/src/components/sidebar/SidebarSmartFoldersSection.tsx",
      "frontend/src/components/sidebar/SidebarSystemSection.tsx",
      "frontend/src/components/sidebar/SidebarTagsSection.tsx",
    ]);
  });

  it("labels them all through the catalogue, never in English source", () => {
    const stray: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      for (const m of text.matchAll(/<SidebarSectionHeading\b([\s\S]*?)\/>/g)) {
        const label = /\blabel=\{([^}]*)\}/.exec(m[1]);
        if (!label || !/\bt\w*\(/.test(label[1])) {
          stray.push(`${rel(file)}: ${label ? label[1].trim() : "no label"}`);
        }
      }
    }
    expect(stray).toEqual([]);
  });
});

describe("tracking-wider", () => {
  /**
   * `DESIGN.md` §3.5 allows `uppercase tracking-wider` on hardcoded
   * English-only labels. Once the sidebar's headings are translated,
   * nothing in the app qualifies. Tests are not scanned: a class name
   * quoted in an assertion is not a use.
   */
  const ADDONS_DIR = resolve(REPO_ROOT, "addons");
  const ROOTS = [
    resolve(REPO_ROOT, "frontend/src"),
    ...(existsSync(ADDONS_DIR)
      ? readdirSync(ADDONS_DIR, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => resolve(ADDONS_DIR, e.name, "frontend"))
          .filter((d) => existsSync(d))
      : []),
  ];
  const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

  it("is used nowhere, in core or in any addon", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        if (file.startsWith(ADDON_LINK_DIR)) continue;
        const text = readFileSync(file, "utf-8");
        const at = text.indexOf("tracking-wider");
        if (at !== -1) hits.push(`${rel(file)}:${text.slice(0, at).split("\n").length}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("section header labels", () => {
  /**
   * `DESIGN.md` §Section Header Labels is the upper rule the sidebar
   * now defers to, and it drops `uppercase`: the labels render
   * Japanese, where the property does nothing, so in a column that
   * mixes scripts it stops being what makes the headings look alike.
   *
   * Core only: addon headings are a backlog recorded in `DESIGN.md`.
   */
  it("does not shout, anywhere in core", () => {
    // Matched on the *element*, not on a combination of classes: a heading
    // tag is what makes something a heading; the weight it happens to
    // carry is not.
    //
    // `<dt>` labels in a properties table and extension badges on a
    // row are deliberately outside this: they are field labels and
    // machine strings, governed by §Properties Panel, not by
    // §Section Header Labels.
    const hits: string[] = [];
    for (const file of sourceFiles(resolve(REPO_ROOT, "frontend/src"))) {
      if (file.startsWith(resolve(REPO_ROOT, "frontend/src/addons"))) continue;
      const text = readFileSync(file, "utf-8");
      for (const m of text.matchAll(/<h[1-6]\s[^>]*>/g)) {
        if (/\buppercase\b/.test(m[0])) {
          hits.push(`${rel(file)}:${text.slice(0, m.index!).split("\n").length}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
