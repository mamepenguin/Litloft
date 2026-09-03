import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { compile } from "tailwindcss";

// Tailwind v4 emits no rule at all for a utility whose token it does not know.
// The class stays in the DOM, nothing warns, and the element simply renders
// without the colour — which is how nine dead tokens survived across
// twenty-five call sites (UI redesign Bug-1).
//
// The question is put to the compiler rather than to a heuristic: build every
// candidate class the source writes and see which produce no CSS. That is what
// "dead" means, and it leaves no list of exceptions to keep current — `text-sm`
// and `bg-gradient-to-b` compile, `text-success` and `bg-danger-bg` do not, and
// nothing here has to know why. An earlier version matched token names against
// the families declared in `@theme inline`, which could not see `text-success`
// at all: `success` names no family, so it looked like Tailwind's business.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FRONTEND = resolve(REPO_ROOT, "frontend");
const GLOBALS_CSS = resolve(FRONTEND, "src/app/globals.css");

// This file spells out the patterns it forbids in order to explain them, so it
// is the one file the scans below must not read.
const SELF = fileURLToPath(import.meta.url);

/**
 * Core plus every addon checked out beside it.
 *
 * `frontend/src/addons/*` are symlinks into these same trees — an addon is
 * enabled by linking it — so that directory is skipped during the walk and the
 * submodules are read at the root instead. Reading the root rather than the
 * links means the sweep covers an addon that is present but not enabled, which
 * is the state a submodule sits in right after a pointer bump.
 */
const SOURCE_ROOTS = [
  "frontend/src",
  ...readdirSync(resolve(REPO_ROOT, "addons"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `addons/${e.name}/frontend`),
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

function eachLine(visit: (line: string, where: string) => void) {
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      if (file === SELF) continue;
      readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, i) => visit(line, `${relative(REPO_ROOT, file)}:${i + 1}`));
    }
  }
}

/**
 * Colour utilities are `<property>-<token>`; these are the properties in use.
 *
 * `accent` is deliberately absent. Tailwind spells `accent-color` that way, but
 * this project also names tokens `accent-teal` / `accent-amber`, so including
 * it would match the tail of every `text-accent-amber`.
 */
const PROPERTIES = [
  "text", "bg", "border", "ring", "outline", "fill", "stroke",
  "from", "to", "via", "divide", "shadow", "decoration", "caret",
  "placeholder",
];

const COLOUR_UTILITY = new RegExp(
  String.raw`^(?:${PROPERTIES.join("|")})-[a-z][a-z0-9-]*(?:\/\d{1,3})?$`,
);

interface Candidate {
  cls: string;
  where: string;
}

/** Every string and template literal on a line, minus comment lines. */
function literalsIn(line: string): string[] {
  const code = line.trim();
  if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return [];
  return [...line.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );
}

/** Strip `hover:` / `md:` / `disabled:` so the bare utility can be recognised. */
function bareUtility(token: string): string {
  const at = token.lastIndexOf(":");
  return at === -1 ? token : token.slice(at + 1);
}

interface Collected {
  /** Everything worth asking Tailwind about, so a literal can be judged whole. */
  probes: string[];
  /** Colour utilities, each tagged with the literal it came from. */
  candidates: (Candidate & { literal: string })[];
}

function collect(): Collected {
  const probes = new Set<string>();
  const candidates: (Candidate & { literal: string })[] = [];
  eachLine((line, where) => {
    for (const literal of literalsIn(line)) {
      const tokens = literal.split(/\s+/).filter((t) => /^[a-z][\w:./[\]%-]*$/.test(t));
      if (tokens.length === 0) continue;
      for (const token of tokens) {
        probes.add(token);
        if (COLOUR_UTILITY.test(bareUtility(token))) {
          candidates.push({ cls: token, where, literal });
        }
      }
    }
  });
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
  // (Testing each result for `{` instead would call everything live, since the
  // base layer alone contains braces.) Callers must pass distinct classes; a
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

  it("every colour utility the source writes produces CSS", () => {
    // A dead utility is only reported when it shares its string with a live
    // one. That is what separates a class list from the many identifier-shaped
    // strings that look just like one token — `data-testid="text-preview"`,
    // a model id `text-embedding-model`, the cache marker `from-cache`. The
    // cost is that a className holding exactly one class, itself dead, goes
    // unseen; every real instance so far has sat among a dozen live classes.
    const offenders = candidates
      .filter(
        (c) =>
          dead.has(c.cls) &&
          c.literal
            .split(/\s+/)
            .some((t) => t !== c.cls && t.length > 0 && !dead.has(t)),
      )
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
    eachLine((line, where) => {
      const accentFill = /\bbg-accent(-cta|-hover)?(\/\d+)?(?![\w-])/.test(line);
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
    eachLine((line, where) => {
      if (/\bbg-black\/\d+/.test(line) && /\btext-(text|accent|warm|sand)-/.test(line)) {
        offenders.push(where);
      }
    });
    expect(offenders).toEqual([]);
  });
});
