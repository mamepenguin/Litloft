import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
 * A centred page container needs a definite width, or it sizes to its
 * widest child.
 *
 * `AppShell`'s `<main>` is a column flex container, so a page's outer box
 * is a flex item. `mx-auto` gives that item automatic cross-axis margins,
 * and an item with those is **not** stretched — its width resolves to
 * fit-content, which is at least its own min-content. One descendant that
 * cannot shrink then drags the whole page sideways, and `max-w-*` does
 * nothing about it because the box never got that wide by stretching in
 * the first place.
 *
 * Measured on `/admin/settings` at 375px, with the addon-policy table's
 * `whitespace-nowrap` headings inside it: `main` 360px, the container
 * **608px**, the document scrolling sideways, and the table's own
 * `overflow-x-auto` region not scrolling at all — it had been handed every
 * pixel it asked for. `w-full` restores a definite width; `max-w-*` still
 * caps it and `mx-auto` still centres it.
 *
 * Two files already carried the pair before this was understood
 * (`MarkdownImagesPresenter`, `/settings`), which is why neither of them
 * ever showed the defect and why nobody looked.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(REPO_ROOT, "frontend/src");
const ADDON_LINK_DIR = resolve(SRC, "addons");

/**
 * `className` values that centre a box and cap its width, quoted or
 * written as a template literal.
 *
 * Built per call rather than shared: a module-level `/g` regex carries
 * `lastIndex` between a successful `.test()` and the next `matchAll`, and
 * `matchAll` copies it — so one test's last match silently makes the next
 * one start scanning each file part-way through. It resets to 0 only on a
 * *failing* `test()`, which is luck, not design.
 */
const CENTRED_CAPPED_SOURCE =
  String.raw`className=(?:"([^"]*)"|\{\`([^\`]*)\`\})`;

function centredCappedClassLists(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(new RegExp(CENTRED_CAPPED_SOURCE, "g"))) {
    const classes = m[1] ?? m[2] ?? "";
    // A template literal's interpolated half is invisible to a source
    // scan, so a `max-w-*` that only ever appears inside `${…}` cannot be
    // seen. `FileDetailFullScreen` writes one that way; it carries
    // `w-full` in the literal half, so it passes for the right reason.
    if (!/\bmx-auto\b/.test(classes)) continue;
    if (!/\bmax-w-[\w[\]]+/.test(classes)) continue;
    out.push(classes);
  }
  return out;
}

/**
 * All of core, not only `app/`.
 *
 * A page's outer box is often written in a component — the collection
 * view's not-found branch is one — and an earlier version of this walk
 * rooted at `src/app` missed those. It also skipped any directory named
 * `addons`, which under `src/app` is the real route folder for addon
 * pages and is ordinary core source; the exclusion was aimed at the
 * `src/addons` symlink dir, which is where it belongs.
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

/**
 * The first-run wizard is its own shell and does not render inside
 * `AppShell` — `SetupShell` is the whole page, so nothing above it is a
 * flex container and the item rule does not apply.
 */
const OUTSIDE_THE_SHELL = [
  "frontend/src/app/setup/components/SetupShell.tsx",
  // The selection bar and the restart banner are fixed / sticky bars that
  // centre their own contents inside a full-width strip. They are not the
  // page's box and never a flex item of `<main>`.
  "frontend/src/components/SelectionBar.tsx",
  "frontend/src/components/RestartBanner.tsx",
];

/**
 * The same shape lives in two addon repositories and has to be fixed
 * there — `addons/intelligence/frontend/pages/search-compare.tsx` and
 * `addons/knowledge/frontend/Editor.tsx`, both reached as a direct child
 * of `<main>` through `app/addons/[name]/…`. Named here so that scanning
 * core only is a stated boundary rather than a silent one; neither shows
 * the defect today, because neither holds an unshrinkable child.
 */
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
    // Not a floor for its own sake: an empty match set would make the
    // assertion below pass over nothing, and this pattern is exactly the
    // kind a refactor renames.
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
