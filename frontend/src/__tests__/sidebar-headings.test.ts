import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

/**
 * The sidebar's section headings had drifted apart on four axes at once
 * — element (`div` vs `button`), chevron, who owned the vertical margin
 * (the heading or its parent `div`), and width (`w-full` vs `flex-1`) —
 * on top of the two that Phase 0 fixed by hand. Editing five class
 * strings to match would leave the drift free to start again, so they
 * are drawn by one component and this fixes that there is still only
 * one.
 *
 * Two claims, both about counting:
 *
 *   1. Exactly one place in the sidebar writes the heading's classes,
 *      and it is `SidebarSectionHeading`. A sixth heading written by
 *      hand fails here even if it copies the classes perfectly.
 *   2. Exactly five headings exist. Exact, not a lower bound: the
 *      failure worth catching is a *new* heading the scan cannot see,
 *      and under `>=` that stays green. Every count in this redesign
 *      that was written from a reading of the code came out low — six
 *      times running — so the number is here to force a recount.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const SIDEBAR_DIR = resolve(REPO_ROOT, "frontend/src/components/sidebar");

/** The classes that make a sidebar section heading look like one. */
const HEADING_CLASSES = "text-[11px] font-semibold text-text-muted";
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
  const files = sourceFiles(SIDEBAR_DIR);

  it("has one component that knows what a section heading looks like", () => {
    const writers = files.filter((f) => readFileSync(f, "utf-8").includes(HEADING_CLASSES));
    expect(writers.map(rel)).toEqual([HEADING_COMPONENT]);
  });

  it("draws every one of them from it", () => {
    // Addons, Collections, Pins, Smart folders, Tags. Library and
    // Drives left with item 10. Adding a section means updating this
    // number — which is the point, because it makes someone look at
    // the list.
    const uses = files.flatMap((f) =>
      [...readFileSync(f, "utf-8").matchAll(/<SidebarSectionHeading\b/g)].map(() => rel(f)),
    );
    expect(uses.length).toBe(5);
    expect([...new Set(uses)].sort()).toEqual([
      "frontend/src/components/sidebar/SidebarCollectionsSection.tsx",
      "frontend/src/components/sidebar/SidebarLibrarySection.tsx",
      "frontend/src/components/sidebar/SidebarPinsSection.tsx",
      "frontend/src/components/sidebar/SidebarSmartFoldersSection.tsx",
      "frontend/src/components/sidebar/SidebarTagsSection.tsx",
    ]);
  });

  it("labels them all through the catalogue, never in English source", () => {
    // "Pins", "Tags", "Addons" were hardcoded English in a column that
    // otherwise renders Japanese, which is what let `uppercase` look
    // like it was doing something.
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
   * nothing in the app qualifies — so the allowance describes an empty
   * set, and this is the assertion that keeps that true. If a real use
   * appears, `DESIGN.md` §3.5 gets a real example and this number
   * changes with it. Tests are not scanned: a class name quoted in an
   * assertion is not a use.
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
   * Core only. The addons' own panels still write `uppercase` on their
   * field-group labels; that is the same shape and wants the same
   * sweep, but it reaches a third submodule and is recorded as carried
   * over rather than smuggled into this change.
   */
  it("does not shout, anywhere in core", () => {
    const hits: string[] = [];
    for (const file of sourceFiles(resolve(REPO_ROOT, "frontend/src"))) {
      if (file.startsWith(resolve(REPO_ROOT, "frontend/src/addons"))) continue;
      const text = readFileSync(file, "utf-8");
      for (const m of text.matchAll(/className="([^"]*)"/g)) {
        const cls = m[1];
        if (
          cls.includes("uppercase") &&
          cls.includes("font-semibold") &&
          cls.includes("text-text-muted")
        ) {
          hits.push(`${rel(file)}:${text.slice(0, m.index!).split("\n").length}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
