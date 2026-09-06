import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
 * One tab style in the application, and `PageTabs` owns it.
 *
 * Three were in the tree before Phase 3 — Media Import's underline,
 * intelligence's `ModeTabs` pill, and `/admin/settings`'s segmented
 * control — and the pill's selected tab was `bg-accent text-white`, which
 * spent the page's one accent fill on saying which tab you are already
 * looking at. Phase 3 converted two of them and sent the third forward as
 * an open point; 案 16 converted it, and this is what keeps a fourth from
 * arriving.
 *
 * Written as a scan and not as a list of screens, because the failure it
 * is aimed at is a *new* tab row somewhere nobody thought to look.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const SRC = resolve(REPO_ROOT, "frontend/src");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(SRC, "addons");

const OWNER = "frontend/src/components/PageTabs.tsx";

const SOURCE_ROOTS: Array<[string, string]> = [
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

function sourceFiles(): Array<{ rel: string; body: string }> {
  const out: Array<{ rel: string; body: string }> = [];
  for (const [label, root] of SOURCE_ROOTS) {
    if (!existsSync(root)) continue;
    const walk = (dir: string) => {
      if (dir === ADDON_LINK_DIR) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        if (entry.name === "__tests__") continue;
        if (!existsSync(full)) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && full !== SELF) {
          const rel =
            label === "frontend/src"
              ? `frontend/src/${relative(SRC, full)}`
              : `${label}/${relative(root, full)}`;
          out.push({ rel, body: stripComments(readFileSync(full, "utf-8")) });
        }
      }
    };
    walk(root);
  }
  return out;
}

/** The two shapes the other two styles were written in. */
const STYLES: Array<[name: string, pattern: RegExp]> = [
  // The underline. `PageTabs` owns it, and `InspectorShell` is the one
  // documented second writer — see `UNDERLINE_EXCEPTIONS`.
  ["underline (border-b-2)", /\bborder-b-2\b/],
  // The segmented control needs **both** halves, because either alone is
  // something else this tree legitimately has. A filled, padded track on
  // its own is a control group — the drive root's sort/view/`…` cluster
  // sits in one. Equal-width pills on their own are two ordinary buttons
  // in a row — the knowledge graph's Open/Centre pair. It is a segmented
  // *tab* control only when the pills are inside the track, and a first
  // draft of this file flagged both of those innocents by matching one
  // half each.
  [
    "segmented control (equal-width pills inside a filled track)",
    /rounded-2xl bg-bg-elevated p-1\b[\s\S]*?\bflex-1 rounded-xl\b/,
  ],
];

/**
 * The inspector's tab strip writes the underline out by hand, and stays.
 *
 * It is not a fourth style — it is `PageTabs`'s style, asserted below to be
 * the same recipe class for class — but it is a second implementation, and
 * the reason it is not folded into `PageTabs` is a behaviour `PageTabs` does
 * not have: a roving `tabIndex`, one stop for the whole strip with the arrow
 * keys moving inside it. A file's tabs can run to a dozen, and every one of
 * them being a tab stop is what makes a long strip tedious to get past.
 * Giving `PageTabs` a roving tabindex for one caller, or taking it away from
 * the inspector, are both worse than saying so here.
 */
const UNDERLINE_EXCEPTIONS = [
  "frontend/src/components/FileDetail/inspector/InspectorShell.tsx",
];

describe("one tab style", () => {
  const files = sourceFiles();

  it("reads the whole tree", () => {
    // "Nobody draws a second style" is also true of an empty walk, and
    // this one crosses four addon repositories whose checkouts can be
    // absent.
    expect(files.length).toBeGreaterThan(100);
    expect(files.map((f) => f.rel)).toContain(OWNER);
  });

  it.each(STYLES)("is not written by hand anywhere: %s", (name, pattern) => {
    const allowed = name.startsWith("underline") ? UNDERLINE_EXCEPTIONS : [];
    const offenders = files
      .filter((f) => f.rel !== OWNER && !allowed.includes(f.rel))
      .filter((f) => pattern.test(f.body))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  /**
   * The exception earns its place by looking identical, so this reads the
   * two files against each other rather than trusting the paragraph above.
   * A drift in either direction — the inspector picking a different
   * selected colour, `PageTabs` changing its own — fails here.
   */
  it("holds the exception to the owner's own recipe", () => {
    const owner = files.find((f) => f.rel === OWNER)!.body;
    for (const rel of UNDERLINE_EXCEPTIONS) {
      const body = files.find((f) => f.rel === rel);
      expect(body, `${rel} is not in the population`).toBeDefined();
      for (const token of [
        "border-b-2",
        "border-accent",
        "border-transparent",
        "text-text-muted",
        "pointer-coarse:min-h-11",
      ]) {
        expect(owner, `owner lost ${token}`).toContain(token);
        expect(body!.body, `${rel} lost ${token}`).toContain(token);
      }
    }
  });

  it("keeps the owner drawing the underline", () => {
    // The complement of the sweep: if `PageTabs` stopped carrying the
    // style, "nobody else writes it" would go on passing over a tree with
    // no tabs in it at all.
    const owner = files.find((f) => f.rel === OWNER)!;
    expect(owner.body).toMatch(/\bborder-b-2\b/);
  });
});
