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
const APP = resolve(REPO_ROOT, "frontend/src/app");

/** `className="…"` values that centre a box and cap its width. */
const CENTRED_CAPPED = /className="([^"]*\bmx-auto\b[^"]*\bmax-w-[\w[\]]+[^"]*)"/g;

function pageFiles(): Array<{ rel: string; body: string }> {
  const out: Array<{ rel: string; body: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || entry.name === "addons") continue;
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
  walk(APP);
  return out;
}

/**
 * The first-run wizard is its own shell and does not render inside
 * `AppShell` — `SetupShell` is the whole page, so nothing above it is a
 * flex container and the item rule does not apply.
 */
const OUTSIDE_THE_SHELL = ["frontend/src/app/setup/components/SetupShell.tsx"];

describe("centred page containers", () => {
  const files = pageFiles();

  it("finds the containers it is meant to be checking", () => {
    const withContainers = files.filter((f) => {
      CENTRED_CAPPED.lastIndex = 0;
      return CENTRED_CAPPED.test(f.body);
    });
    // Not a floor for its own sake: an empty match set would make the
    // assertion below pass over nothing, and this pattern is exactly the
    // kind a refactor renames.
    expect(withContainers.length).toBeGreaterThan(3);
    expect(withContainers.map((f) => f.rel)).toContain(
      "frontend/src/app/admin/settings/page.tsx",
    );
  });

  it("gives every one of them a width of its own", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (OUTSIDE_THE_SHELL.includes(file.rel)) continue;
      for (const m of file.body.matchAll(CENTRED_CAPPED)) {
        const classes = m[1]!.split(/\s+/);
        if (!classes.includes("w-full")) {
          offenders.push(`${file.rel} — ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
