import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
 * `AppShell`'s `<main>` is a column flex container, and a flex item with
 * `mx-auto` is not stretched: without `w-full` it sizes to its widest child.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(REPO_ROOT, "frontend/src");
const ADDON_LINK_DIR = resolve(SRC, "addons");

/**
 * Built per call rather than shared: a module-level `/g` regex carries
 * `lastIndex` into the next `matchAll`.
 */
const CENTRED_CAPPED_SOURCE =
  String.raw`className=(?:"([^"]*)"|\{\`([^\`]*)\`\})`;

function centredCappedClassLists(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(new RegExp(CENTRED_CAPPED_SOURCE, "g"))) {
    const classes = m[1] ?? m[2] ?? "";
    // A `max-w-*` that only appears inside `${…}` is invisible to this scan.
    if (!/\bmx-auto\b/.test(classes)) continue;
    if (!/\bmax-w-[\w[\]]+/.test(classes)) continue;
    out.push(classes);
  }
  return out;
}

/**
 * All of core, not only `app/`: a page's outer box is often written in a
 * component. `src/app/addons` is core source; only the `src/addons` link
 * tree is skipped.
 */
function pageFiles(): Array<{ rel: string; body: string }> {
  const out: Array<{ rel: string; body: string }> = [];
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__") continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        out.push({
          rel: relative(REPO_ROOT, full),
          body: stripComments(readFileSync(full, "utf-8")),
        });
      }
    }
  };
  walk(SRC);
  return out;
}

const OUTSIDE_THE_SHELL = [
  "frontend/src/app/setup/components/SetupShell.tsx",
  "frontend/src/components/SelectionBar.tsx",
  "frontend/src/components/RestartBanner.tsx",
];

const KNOWN_IN_ADDON_REPOSITORIES = [
  "addons/intelligence/frontend/pages/search-compare.tsx",
  "addons/knowledge/frontend/Editor.tsx",
];

describe("centred page containers", () => {
  const files = pageFiles();

  it("finds the containers it is meant to be checking", () => {
    const withContainers = files.filter(
      (f) => centredCappedClassLists(f.body).length > 0,
    );
    expect(withContainers.length).toBeGreaterThan(6);
    for (const named of [
      "frontend/src/app/admin/settings/page.tsx",
      "frontend/src/components/CollectionDetail.tsx",
    ]) {
      expect(withContainers.map((f) => f.rel)).toContain(named);
    }
    expect(KNOWN_IN_ADDON_REPOSITORIES).toHaveLength(2);
  });

  it("gives every one of them a width of its own", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (OUTSIDE_THE_SHELL.includes(file.rel)) continue;
      for (const classes of centredCappedClassLists(file.body)) {
        if (!classes.split(/\s+/).includes("w-full")) {
          offenders.push(`${file.rel} — ${classes}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
