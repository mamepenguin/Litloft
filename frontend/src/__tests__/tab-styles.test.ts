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

/**
 * Every class list in a file — written at the point of use, or held in a
 * `*_CLASS` constant.
 *
 * The constant half is not optional: a shared component exists precisely so
 * a recipe lives in one place, which moves it out of `className=` and into
 * a `const`. `PageTabs` keeps both of its states that way, so a scan that
 * read only attributes found nothing in the very file that owns the style.
 * `button-adoption.test.ts` makes the same point about `Button.tsx`.
 */
function classStrings(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  for (const m of body.matchAll(/\bconst\s+[A-Za-z_$][\w$]*(?:CLASS|CLASSES|Class|Classes)\b[^=]*=\s*([^;]+);/g)) {
    // A recipe may be split across concatenated literals; join them back
    // into the one class list they are.
    const parts = [...m[1]!.matchAll(/["'`]([^"'`]*)["'`]/g)].map((q) => q[1]!);
    if (parts.length) out.push(parts.join(" "));
  }
  return out;
}

/** The shape the retired underline style was written in. */
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
];

/**
 * Two `className` values in one file: the track, and a pill inside it.
 *
 * Written as a predicate rather than one regex because both halves have to
 * be *sets* of tokens, not an ordered substring — `bg-bg-elevated
 * rounded-2xl p-1` is the same control written in a different order, and a
 * sequence pattern would let it through untouched.
 *
 * The scope is the file, not the element, and that is a real limit: a file
 * already carrying a track (the drive root's sort/view/`…` cluster) would
 * be flagged by an unrelated `flex-1 rounded-xl` added anywhere in it. The
 * narrower form — both halves inside one element — needs a JSX parse, and
 * the false positive it would prevent is one this tree has not produced.
 */
const TRACK_TOKENS = ["rounded-2xl", "bg-bg-elevated", "p-1"];
const PILL_TOKENS = ["flex-1", "rounded-xl"];

function drawsSegmentedControl(body: string): boolean {
  const lists = classStrings(body).map((c) => new Set(c.split(/\s+/)));
  const has = (tokens: string[]) =>
    lists.some((set) => tokens.every((t) => set.has(t)));
  return has(TRACK_TOKENS) && has(PILL_TOKENS);
}

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

  it.each(STYLES)("is not written by hand anywhere: %s", (_name, pattern) => {
    const offenders = files
      .filter((f) => f.rel !== OWNER && !UNDERLINE_EXCEPTIONS.includes(f.rel))
      .filter((f) => pattern.test(f.body))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("is not written by hand anywhere: the segmented control", () => {
    const offenders = files
      .filter((f) => drawsSegmentedControl(f.body))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  /**
   * The exception earns its place by looking identical, so this compares
   * the two selected-state class strings rather than searching whole
   * files for tokens. A file-wide `toContain` is true the moment the token
   * appears anywhere, for any reason — which is how the first version of
   * this test passed while the inspector's selected tab was missing
   * `font-semibold` entirely.
   *
   * `font-semibold` is the token that matters most here, and DESIGN.md
   * §Tabs says why: it is the second, non-colour signal for which tab is
   * current, and without it a 2px underline is the only one. That section
   * also records that an earlier draft got this wrong and that the
   * mutation proving it went unnoticed by every test.
   */
  const SELECTED_TOKENS = ["border-accent", "font-semibold", "text-text-primary"];
  const UNSELECTED_TOKENS = ["border-transparent", "text-text-muted"];
  const SHARED_TOKENS = ["border-b-2", "pointer-coarse:min-h-11"];

  it("holds the exception to the owner's own recipe", () => {
    const bodyOf = (rel: string) => {
      const f = files.find((x) => x.rel === rel);
      expect(f, `${rel} is not in the population`).toBeDefined();
      return f!.body;
    };
    /** The class string that paints a tab in one of the two states. */
    const stateClasses = (body: string, marker: string) =>
      classStrings(body).filter((c) => c.includes(marker));

    for (const rel of [OWNER, ...UNDERLINE_EXCEPTIONS]) {
      const body = bodyOf(rel);
      const selected = stateClasses(body, "border-accent");
      const unselected = stateClasses(body, "border-transparent");
      expect(selected.length, `${rel} selected state`).toBe(1);
      expect(unselected.length, `${rel} unselected state`).toBe(1);
      for (const token of SELECTED_TOKENS) {
        expect(selected[0], `${rel} selected lost ${token}`).toContain(token);
      }
      for (const token of UNSELECTED_TOKENS) {
        expect(unselected[0], `${rel} unselected lost ${token}`).toContain(token);
      }
      for (const token of SHARED_TOKENS) {
        expect(body, `${rel} lost ${token}`).toContain(token);
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
