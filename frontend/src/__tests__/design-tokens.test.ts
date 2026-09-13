import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { compile } from "tailwindcss";
import {
  stripComments,
  classAttributeSpans,
  classConstSpans,
} from "./helpers/sourceScan";

// Tailwind v4 emits no rule at all for a utility whose token it does not know.
// Matching token names against the families declared in `@theme inline` would
// be the obvious shortcut, and it cannot see a token like `text-success`:
// `success` names no family, so it reads as Tailwind's business rather than ours.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FRONTEND = resolve(REPO_ROOT, "frontend");
const GLOBALS_CSS = resolve(FRONTEND, "src/app/globals.css");

// These two files spell out the patterns the scans forbid, so the scans must
// not read them. `sourceScan.ts`'s regexes also contain quote characters inside
// character classes, which `stripComments` cannot tell from the start of a string.
const SELF = fileURLToPath(import.meta.url);
const SCANNER = resolve(dirname(SELF), "helpers/sourceScan.ts");

/**
 * `frontend/src/addons/*` mirrors these same trees, so that directory is
 * skipped during the walk and the submodules are read at the root instead.
 */
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const SOURCE_ROOTS = [
  "frontend/src",
  // Absent wherever only `frontend/` was copied; skip rather than fail collection.
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `addons/${e.name}/frontend`)
    : []),
];

const ADDON_LINK_DIR = resolve(FRONTEND, "src/addons");

function sourceFiles(root: string): string[] {
  const abs = resolve(REPO_ROOT, root);
  // An uninitialised submodule leaves an empty directory behind.
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      // A link to an addon not checked out here dangles; statSync throws on it.
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

function eachClassAttribute(visit: (value: string, where: string) => void) {
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      if (file === SELF || file === SCANNER) continue;
      const text = stripComments(readFileSync(file, "utf-8"));
      const rel = relative(REPO_ROOT, file);
      const spans = [...classAttributeSpans(text), ...classConstSpans(text)];
      for (const [start, end] of spans) {
        const line = text.slice(0, start).split("\n").length;
        visit(text.slice(start, end), `${rel}:${line}`);
      }
    }
  }
}

/**
 * `accent` is Tailwind's `accent-color` prefix and also the head of this
 * project's `accent-teal` / `accent-amber` tokens. That collision is harmless
 * here only because candidates are whole whitespace-separated tokens matched
 * anchored.
 */
const PROPERTIES = [
  "text", "bg", "border", "ring", "outline", "fill", "stroke",
  "from", "to", "via", "divide", "shadow", "decoration", "caret",
  "placeholder", "accent",
];

interface Candidate {
  cls: string;
  where: string;
}

const COLOUR_UTILITY = new RegExp(
  String.raw`^(?:${PROPERTIES.join("|")})-[a-z][a-z0-9-]*(?:\/\d{1,3})?$`,
);



function literalsIn(text: string): { body: string; at: number }[] {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map((m) => ({
    body: m[1] ?? m[2] ?? m[3] ?? "",
    at: m.index!,
  }));
}

function bareUtility(token: string): string {
  const at = token.lastIndexOf(":");
  return at === -1 ? token : token.slice(at + 1);
}

interface Collected {
  probes: string[];
  candidates: (Candidate & { literal: string; inClassAttribute: boolean })[];
}

function collect(): Collected {
  const probes = new Set<string>();
  const candidates: (Candidate & { literal: string; inClassAttribute: boolean })[] = [];

  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      if (file === SELF || file === SCANNER) continue;
      const text = stripComments(readFileSync(file, "utf-8"));
      const rel = relative(REPO_ROOT, file);
      const spans = classAttributeSpans(text);
      const lineAt = (offset: number) => text.slice(0, offset).split("\n").length;

      for (const { body, at } of literalsIn(text)) {
        const inClassAttribute = spans.some(([a, b]) => at >= a && at < b);
        const tokens = body
          .split(/\s+/)
          .filter((t) => /^[a-z0-9][\w:./[\]%-]*$/.test(t));
        if (tokens.length === 0) continue;
        for (const token of tokens) {
          probes.add(token);
          if (COLOUR_UTILITY.test(bareUtility(token))) {
            candidates.push({
              cls: token,
              where: `${rel}:${lineAt(at)}`,
              literal: body,
              inClassAttribute,
            });
          }
        }
      }
    }
  }
  return { probes: [...probes], candidates };
}

/** A class Tailwind is certain not to know, to prove the check can say "dead". */
const IMPOSSIBLE_CLASS = "text-zzz-not-a-token";

async function findDeadClasses(classes: string[]): Promise<Set<string>> {
  const compiler = await compile(readFileSync(GLOBALS_CSS, "utf-8"), {
    base: FRONTEND,
    async loadStylesheet(id: string, base: string) {
      const path =
        id === "tailwindcss"
          ? resolve(FRONTEND, "node_modules/tailwindcss/index.css")
          : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf-8") };
    },
  });

  // `build` is cumulative: it returns everything compiled so far, so deadness
  // is measured as growth. Callers must pass distinct classes; a repeat adds
  // nothing the second time and would look dead.
  const dead = new Set<string>();
  let length = compiler.build([]).length;
  for (const cls of classes) {
    const grown = compiler.build([cls]).length;
    if (grown === length) dead.add(cls);
    length = grown;
  }
  return dead;
}

describe("design tokens", () => {
  const { probes, candidates } = collect();
  let dead: Set<string>;

  beforeAll(async () => {
    dead = await findDeadClasses([...probes, IMPOSSIBLE_CLASS]);
  }, 180_000);

  it("can tell a live class from a dead one", () => {
    expect(candidates.length).toBeGreaterThan(100);
    expect(dead.has(IMPOSSIBLE_CLASS)).toBe(true);
    expect(dead.has("bg-bg-card")).toBe(false);
    expect(dead.has("text-text-muted")).toBe(false);
    expect(dead.has("text-sm")).toBe(false);
  });

  it("gives the list-row measure a token, a user, and a documented value", () => {
    expect(dead.has("max-w-list-row")).toBe(false);

    const css = readFileSync(GLOBALS_CSS, "utf-8");
    expect(css).toMatch(/--container-list-row:\s*60rem;/);

    const design = readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");
    expect(design).toMatch(/### 3\.6 List row measure/);
    expect(design).toMatch(/`60rem` \(960px\)[^]*`max-w-list-row`/);

    const ROWS = [
      "frontend/src/components/FileListRow.tsx",
      "frontend/src/components/FolderListRow.tsx",
    ];
    expect(ROWS.length).toBe(2);
    for (const row of ROWS) {
      expect(
        readFileSync(resolve(REPO_ROOT, row), "utf-8"),
        `${row} does not carry max-w-list-row`,
      ).toContain("max-w-list-row");
    }
  });

  it("every colour utility the source writes produces CSS", () => {
    const offenders = candidates
      .filter((c) => {
        if (!dead.has(c.cls)) return false;
        // Anything inside a className is a class list by construction.
        if (c.inClassAttribute) return true;
        // Outside one — a `const …_CLASS = "…"`, an argument to a helper — a
        // live neighbour is what separates a class list from the many
        // identifier-shaped strings that look the same alone: a
        // `data-testid="text-preview"`, the model id `text-embedding-model`,
        // a `from-cache` marker. A lone dead class there stays invisible.
        return c.literal
          .split(/\s+/)
          .some((t) => t !== c.cls && t.length > 0 && !dead.has(t));
      })
      .map((c) => `${c.cls}  ${c.where}`);
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  // `disabled:opacity-50` on an accent button leaves it reading as the page's
  // one call to action, only dimmer, so it still invites the press it will not
  // accept.
  it("never fades an accent button to say it is disabled", () => {
    const offenders: string[] = [];
    eachClassAttribute((line, where) => {
      // A *solid* accent fill, which is what reads as the page's one call to
      // action. Not `hover:bg-accent/10`, a 10%-alpha tint behind a variant on
      // an otherwise ghost control — hence no variant prefix and no alpha.
      const accentFill = /(?<![\w:-])bg-accent(?:-cta|-hover)?(?![\w/-])/.test(line);
      // `disabled:hover:bg-accent` carries two variants to `disabled:bg-sand`'s
      // one, so it wins and paints the accent back the moment the pointer rests
      // on a button that will not respond.
      const fades = /\bdisabled:opacity-\d+/.test(line) && accentFill;
      const hoverOverride = /\bdisabled:hover:bg-accent(-cta|-hover)?(?![\w-])/.test(line);
      if (fades || hoverOverride) offenders.push(where);
    });
    expect(offenders).toEqual([]);
  });

  // Chrome painted onto a dark scrim does not follow the theme, because the
  // theme's foregrounds are chosen against the page background, not against
  // black.
  it("never puts a theme foreground on a black scrim", () => {
    const offenders: string[] = [];
    eachClassAttribute((line, where) => {
      if (/\bbg-black\/\d+/.test(line) && /\btext-(text|accent|warm|sand)-/.test(line)) {
        offenders.push(where);
      }
    });
    expect(offenders).toEqual([]);
  });
});
