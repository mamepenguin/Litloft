import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
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
 * The `*_CLASS` constant half is not optional: a shared component moves its
 * recipe out of `className=` and into a `const`, as `PageTabs` does.
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

const STYLES: Array<[name: string, pattern: RegExp]> = [
  // `PageTabs` owns it, and `InspectorShell` is the one documented second
  // writer — see `UNDERLINE_EXCEPTIONS`.
  ["underline (border-b-2)", /\bborder-b-2\b/],
  // The segmented control needs **both** halves, because either alone is
  // something else this tree legitimately has; see `drawsSegmentedControl`.
];

/**
 * A predicate rather than one regex because both halves have to be *sets*
 * of tokens, not an ordered substring.
 *
 * The scope is the file, not the element: a file already carrying a track
 * would be flagged by an unrelated `flex-1 rounded-xl` added anywhere in it.
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
 * The inspector's tab strip is not folded into `PageTabs` because of a
 * behaviour `PageTabs` does not have: a roving `tabIndex`, one stop for the
 * whole strip with the arrow keys moving inside it.
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
   * Compares the state class strings rather than searching whole files for
   * tokens: a file-wide `toContain` is true the moment the token appears
   * anywhere, for any reason.
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
