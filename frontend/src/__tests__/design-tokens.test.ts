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
// The class stays in the DOM, nothing warns, and the element simply renders
// without the colour — which is how nine dead tokens survived across
// twenty-five call sites (UI redesign Bug-1).
//
// The question is put to the compiler rather than to a heuristic: build every
// candidate class the source writes and see which produce no CSS. That is what
// "dead" means, and it leaves no list of exceptions to keep current — `text-sm`
// and `bg-gradient-to-b` compile, `text-success` and `bg-danger-bg` do not, and
// nothing here has to know why. Matching token names against the families
// declared in `@theme inline` would be the obvious shortcut, and it cannot see
// a token like `text-success`: `success` names no family, so it reads as
// Tailwind's business rather than ours.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FRONTEND = resolve(REPO_ROOT, "frontend");
const GLOBALS_CSS = resolve(FRONTEND, "src/app/globals.css");

// These two files spell out the patterns the scans forbid, in order to explain
// them, so they are the files the scans must not read. That also keeps
// IMPOSSIBLE_CLASS out of `probes`: `build` is cumulative, so a sentinel seen
// twice would measure a repeat rather than an unknown, and would report itself
// dead for the wrong reason.
//
// `sourceScan.ts` joined the list when the scanners moved into it. Two reasons,
// both discovered by it failing: its prose explains what a check looks for
// ("is this button both accent-filled…"), and `accent` is a real Tailwind
// property prefix, so `accent-filled` reads as a dead colour utility. And its
// regexes contain quote characters inside character classes — `["'\`]` — which
// `stripComments` cannot tell from the start of a string, so the comments after
// them are not reliably blanked. The scanner does not understand regex
// literals; the file that holds the regexes is the one place that matters.
const SELF = fileURLToPath(import.meta.url);
const SCANNER = resolve(dirname(SELF), "helpers/sourceScan.ts");

/**
 * Core plus every addon checked out beside it.
 *
 * `frontend/src/addons/*` are symlinks into these same trees — an addon is
 * enabled by linking it — so that directory is skipped during the walk and the
 * submodules are read at the root instead. Reading the root rather than the
 * links means the sweep covers an addon that is present but not enabled, which
 * is the state a submodule sits in right after a pointer bump.
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

/**
 * Every `className` value in the tree, as one string each, however many lines
 * it spans.
 *
 * The checks below match utilities against each other — "is this button both
 * accent-filled and faded when disabled" — and a class list broken across
 * lines answers no to every such question when read a line at a time. Breaking
 * one line in two is not a code change, so a line-based check is one a
 * formatter can silently switch off.
 */
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
 * Colour utilities are `<property>-<token>`; these are the properties in use.
 *
 * `accent` is Tailwind's `accent-color` prefix and also the head of this
 * project's `accent-teal` / `accent-amber` tokens. That collision is harmless
 * here only because candidates are whole whitespace-separated tokens matched
 * anchored: `text-accent-amber` is tested entire, never mined for a bare
 * `accent-amber` the way a scan across the raw line would.
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



/** String and template literal contents, with the offset each starts at. */
function literalsIn(text: string): { body: string; at: number }[] {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map((m) => ({
    body: m[1] ?? m[2] ?? m[3] ?? "",
    at: m.index!,
  }));
}

/** Strip `hover:` / `md:` / `disabled:` so the bare utility can be recognised. */
function bareUtility(token: string): string {
  const at = token.lastIndexOf(":");
  return at === -1 ? token : token.slice(at + 1);
}

interface Collected {
  /** Everything worth asking Tailwind about, so a literal can be judged whole. */
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

/** Which of `classes` Tailwind produces no rule for, given this project's CSS. */
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

  // `build` is cumulative: it returns everything compiled so far, not just the
  // classes in this call. So deadness is measured as growth — a class Tailwind
  // understands adds its rule and lengthens the sheet, a dead one adds nothing.
  // Testing each result for `{` would call everything live, since the base
  // layer alone contains braces. Callers must pass distinct classes; a
  // repeat adds nothing the second time and would look dead.
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

  // A guard on the guard, in both directions, because this check has failed
  // silently each way. Reading the compiler wrong once made every class look
  // live, so the real assertion below passed while detecting nothing; a
  // misconfigured compiler would make every class look dead instead, and that
  // assertion would go green again the moment someone deleted the offenders.
  it("can tell a live class from a dead one", () => {
    expect(candidates.length).toBeGreaterThan(100);
    expect(dead.has(IMPOSSIBLE_CLASS)).toBe(true);
    expect(dead.has("bg-bg-card")).toBe(false);
    expect(dead.has("text-text-muted")).toBe(false);
    expect(dead.has("text-sm")).toBe(false);
  });

  /**
   * The same failure mode as a dead colour, on the one non-colour token
   * this repo names: Tailwind emits nothing for `max-w-list-row` if
   * `--container-list-row` is not declared, the class stays in the DOM,
   * and the row silently loses its cap. `candidates` above is filtered to
   * colour utilities, so nothing else would notice.
   *
   * The value is asserted in three places at once — the token, the class,
   * and DESIGN.md §3.6 — because a measure that the document and the code
   * disagree about is worse than one that is written down nowhere.
   */
  it("gives the list-row measure a token, a user, and a documented value", () => {
    expect(dead.has("max-w-list-row")).toBe(false);

    const css = readFileSync(GLOBALS_CSS, "utf-8");
    expect(css).toMatch(/--container-list-row:\s*60rem;/);

    const design = readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");
    expect(design).toMatch(/### 3\.6 List row measure/);
    expect(design).toMatch(/`60rem` \(960px\)[^]*`max-w-list-row`/);

    // ...and the rows that are supposed to carry it do, named rather than
    // counted. `probes` would say yes on the strength of this file and the
    // row's own test both writing the string, which is not a user.
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

  // DESIGN.md §6 "Disabled (every variant)": a disabled control drops its
  // enabled background rather than fading it. `disabled:opacity-50` on an
  // accent button leaves it reading as the page's one call to action, only
  // dimmer, so it still invites the press it will not accept (SET-1).
  //
  // Scoped to the accent fills — `accent` and `accent-cta`, which DESIGN.md
  // §2.1 gives the same value. Other variants keep `disabled:opacity-*` until
  // the shared Button component lands (§6 "Known gap", Phase 3); converting
  // those piecemeal splits the treatment across buttons that sit in one row and
  // disable on the same condition.
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

  // DESIGN.md §Over-video chrome: chrome painted onto a dark scrim does not
  // follow the theme, because the theme's foregrounds are chosen against the
  // page background, not against black. `text-text-muted` over `bg-black/70`
  // measured 1.4:1 (UI redesign Bug-7).
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
