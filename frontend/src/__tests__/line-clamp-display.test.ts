import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { compile } from "tailwindcss";

import {
  classAttributeSpans,
  classConstSpans,
  stringLiterals,
  stripComments,
} from "./helpers/sourceScan";
import { addonPresent } from "./helpers/addonPresent";

/**
 * `line-clamp-*` brings its own `display`, so nothing else may set one.
 *
 * Tailwind compiles `line-clamp-<n>` to
 * `overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical;
 * -webkit-line-clamp:<n>`. The clamp is a property of a `-webkit-box`; on any
 * other display value `-webkit-line-clamp` has nothing to act on and is
 * inert. A `display` utility in the same class list therefore does not merely
 * duplicate the clamp's own `display` — it deletes the clamp, silently, with
 * the class still written on the element and every test green.
 *
 * Which of the two wins is not a judgement call: both are plain class
 * selectors of equal specificity, so the one emitted later wins, and the
 * utility layer's order is Tailwind's, not the author's. That order is
 * measured — see the PR that added this file — and it is not a thing to rely
 * on either way round. The rule is that the pair never appears.
 *
 * ## What the scan covers
 *
 * Every `.ts` / `.tsx` file under `frontend/src` and under each
 * `addons/<name>/frontend` that is checked out, minus `__tests__` / `test`
 * directories and minus `frontend/src/addons` (symlinks back into the same
 * addon trees, which would double-count them). Class lists are read through
 * `sourceScan`'s attribute spans *and* its `*_CLASS` constant spans, so a
 * recipe hoisted out of JSX into a constant stays inside the population.
 *
 * ## What it cannot cover
 *
 * - **An addon whose submodule is not checked out is not scanned.** A clone
 *   without `--recurse-submodules` leaves `addons/*` empty; `ANCHORS` runs
 *   each addon path through `addonPresent` so an absent addon drops out of
 *   both sides together rather than being reported as clean. CI checks out
 *   submodules recursively at the commits core pins, so the pinned addon code
 *   *is* covered there — and this addon's own CI assembles a core checkout
 *   with its branch standing in for the pointer, so an addon PR is covered
 *   too, once this file has reached core's `develop`.
 * - **A class list assembled at runtime** — from props, from a lookup keyed by
 *   a variable, from a constant not named `*_CLASS(ES)` — is invisible to any
 *   source scan. This is a static-text rule, not a rendered-DOM one.
 * - **Branches inside one class list are read as one list.** `cn(a ? "block"
 *   : "flex", "line-clamp-2")` is flagged, and so would a hypothetical
 *   `cond ? "block" : "line-clamp-2"` be, where the two can never apply
 *   together. No such value exists in the tree today; if one appears, the fix
 *   is to split the ternary across two attributes rather than to widen this
 *   scan, because "these two branches are exclusive" is exactly the reasoning
 *   a mechanical rule cannot check.
 * - **Geometry.** This asserts nothing about how tall anything renders.
 *   jsdom lays nothing out, and this test does not even mount a component; it
 *   reads source text. That two lines is the right number of lines is a
 *   design decision (`DESIGN.md` §Cards), not something measured here.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

const SOURCE_ROOTS = [
  "frontend/src",
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `addons/${e.name}/frontend`)
    : []),
];

/**
 * Every utility Tailwind 4.2.2 compiles to a bare `display` declaration.
 *
 * **Enumerated, not counted.** The list is written out because a scan that
 * recognises "the display utilities" and means three of them reports zero
 * offenders while the fourth spelling sits in the tree. No assertion anywhere
 * in this file checks how long this array is — a length is a claim about
 * completeness that goes stale silently, and the enumeration is the claim.
 *
 * Read out of the pinned Tailwind's own static-utility table rather than
 * recalled:
 *
 *     grep -o '"[a-z-]\{2,\}",\[\["display","[a-z- ]*"\]\]' \
 *       node_modules/tailwindcss/dist/chunk-F4544Y4M.mjs
 *
 * Two other places in that build emit a `display`, and neither belongs here:
 * `line-clamp-<n>` itself, and `line-clamp-none`, which is the clamp's own
 * release valve (`display:block`, `-webkit-line-clamp:unset`) and is meant to
 * be paired with a clamp — `PropertiesPanel` writes
 * `line-clamp-3 hover:line-clamp-none` on purpose. `sr-only` and
 * `not-sr-only` set position, size, clip and overflow, not display.
 *
 * `hidden` is in the list. It is the one member that cannot produce the
 * visible symptom — an element with `display:none` has no rendered text to
 * clamp or to fail to clamp — but a clamp on an element that never draws is
 * dead code either way, and carving out an exception would put a judgement
 * call inside a rule whose whole value is that it has none. If a real
 * `hidden md:block` case ever wants a clamp, the clamp belongs on the inner
 * element that the `display` is not fighting over.
 */
const DISPLAY_UTILITIES = [
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "contents",
  "flow-root",
  "list-item",
  "hidden",
  "table",
  "inline-table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row-group",
  "table-row",
] as const;

const DISPLAY_SET: ReadonlySet<string> = new Set(DISPLAY_UTILITIES);

/**
 * The utility a token names, with any variant chain stripped.
 *
 * `sm:block`, `dark:hover:flex` and `[&>*]:grid` all set a display, in a
 * state the author chose; a scan that only knows the bare spelling reports
 * them as clean. The split is on the last `:` outside brackets and
 * parentheses, so an arbitrary variant `[&:not(:first-child)]:flex` and an
 * arbitrary *value* `[display:flex]` both survive it intact.
 */
function baseUtility(token: string): string {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) cut = i;
  }
  return token.slice(cut + 1);
}

/** `[display:flex]`, `![display:contents]` and the like. */
const ARBITRARY_DISPLAY = /^!?\[display:/;

function isDisplayUtility(token: string): boolean {
  const base = baseUtility(token).replace(/^!/, "").replace(/!$/, "");
  return DISPLAY_SET.has(base) || ARBITRARY_DISPLAY.test(baseUtility(token));
}

/**
 * `line-clamp-2`, `line-clamp-[7]`, `sm:line-clamp-3` — but never
 * `line-clamp-none`, which sets a display of its own and is the intended way
 * to release a clamp.
 */
function isLineClamp(token: string): boolean {
  const base = baseUtility(token).replace(/^!/, "").replace(/!$/, "");
  return base.startsWith("line-clamp-") && base !== "line-clamp-none";
}

/**
 * The class tokens inside one `className` value.
 *
 * A value is source text, not a string: it may be a `cn(...)` call, a
 * ternary, or a template literal with interpolations. Reading its string
 * literals and splitting those on whitespace takes every token the author
 * wrote literally, and yields only junk (never a false utility name) for the
 * expression fragments between them.
 */
function classTokens(value: string): string[] {
  return stringLiterals(value)
    .flatMap((literal) => literal.split(/\s+/))
    .filter(Boolean);
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || entry.name === "test") continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) {
    const abs = resolve(REPO_ROOT, root);
    if (existsSync(abs)) walk(abs);
  }
  return out;
}

type ClassList = { rel: string; line: number; tokens: string[] };

function classListsIn(rel: string, body: string): ClassList[] {
  const stripped = stripComments(body);
  const spans = [
    ...classAttributeSpans(stripped),
    ...classConstSpans(stripped),
  ];
  return spans.map(([from, to]) => ({
    rel,
    line: stripped.slice(0, from).split("\n").length,
    tokens: classTokens(stripped.slice(from, to)),
  }));
}

const FILES = sourceFiles().map((f) => ({
  rel: relative(REPO_ROOT, f),
  body: readFileSync(f, "utf-8"),
}));

const CLASS_LISTS = FILES.flatMap((f) => classListsIn(f.rel, f.body));

/**
 * Files that must turn up in the scan carrying a clamp.
 *
 * Declared, not derived from the walk: "no class list pairs the two" is also
 * true of a scan that reached no class list at all, and the walk crosses four
 * addon repositories whose checkouts can be missing and a symlink directory it
 * deliberately skips. Each path here is a place a `line-clamp-*` is written
 * today, one per source root, so a walk that loses a root fails by name
 * instead of passing by emptiness.
 *
 * An addon path is dropped when its submodule is not checked out — an absent
 * addon is absent, not compliant.
 */
const ANCHORS = [
  "frontend/src/components/FileCard.tsx",
  "frontend/src/components/MatchOverlay.tsx",
  "frontend/src/components/trash/TrashFileGrid.tsx",
  "addons/media_import/frontend/watch/WatchCard.tsx",
  "addons/intelligence/frontend/VisualIndexSection.tsx",
  "addons/knowledge/frontend/CaptureBasket.tsx",
].filter((p) => addonPresent(REPO_ROOT, p));

describe("no display utility shares a class list with a line clamp", () => {
  it("scanned the files it claims to be scanning", () => {
    const clamped = new Set(
      CLASS_LISTS.filter((c) => c.tokens.some(isLineClamp)).map((c) => c.rel),
    );
    expect(ANCHORS.filter((a) => !clamped.has(a))).toEqual([]);
  });

  it("finds none", () => {
    const offenders = CLASS_LISTS.filter(
      (c) => c.tokens.some(isLineClamp) && c.tokens.some(isDisplayUtility),
    ).map(
      (c) =>
        `${c.rel}:${c.line} — ${c.tokens.filter(isLineClamp).join(" ")} beside ${c.tokens
          .filter(isDisplayUtility)
          .join(" ")}`,
    );
    // One collision in one class list is the whole defect, so the expected
    // value is the empty list and not a ceiling on it.
    expect(offenders).toEqual([]);
  });
});

/**
 * The enumeration, checked against the compiler that decides it.
 *
 * `DISPLAY_UTILITIES` is a hand-written list, and a hand-written list is
 * exactly the thing that can be shortened by one entry and stay green: delete
 * `hidden` from it and every assertion above still passes, because
 * `it.each(DISPLAY_UTILITIES)` shrinks along with it and the tree happens to
 * hold no `hidden` beside a clamp today. That is detector rule 5 — the
 * expectation must not be derived from the same observation it checks.
 *
 * So the second side is Tailwind itself. Every distinct utility written
 * anywhere in the scanned tree is handed to the pinned compiler, and the ones
 * it turns into a `display` declaration are compared against the ones this
 * file's recogniser accepts. Two implementations, one question. Deleting a
 * member the tree uses breaks it; adding a member Tailwind does not treat as
 * a display breaks it; and a utility nobody has written yet is out of scope
 * on both sides at once, which is the honest extent of the claim.
 *
 * The compiler is asked about **base utilities only** — variants are stripped
 * first — so what it emits is a flat rule per candidate and the reading needs
 * no CSS parser beyond brace counting.
 */
describe("the display enumeration matches Tailwind's own", () => {
  /** The `display`-emitting subset of `candidates`, according to Tailwind. */
  async function displayUtilitiesPerTailwind(
    candidates: string[],
  ): Promise<Set<string>> {
    const req = createRequire(import.meta.url);
    const entry = req.resolve("tailwindcss/index.css");
    const compiler = await compile('@import "tailwindcss";', {
      base: dirname(entry),
      loadStylesheet: async (id: string) => {
        const path = id === "tailwindcss" ? entry : req.resolve(id);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    const css = compiler.build(candidates);

    const layer = css.indexOf("@layer utilities {");
    // No utilities layer at all means the compile produced nothing and every
    // comparison below would trivially agree. Fail instead of agreeing.
    expect(layer, "tailwind emitted no utilities layer").toBeGreaterThan(-1);

    const out = new Set<string>();
    let depth = 0;
    let ruleStart = -1;
    for (let i = css.indexOf("{", layer); i < css.length; i += 1) {
      if (css[i] === "{") {
        depth += 1;
        if (depth === 2) ruleStart = i;
      } else if (css[i] === "}") {
        depth -= 1;
        if (depth === 1 && ruleStart !== -1) {
          // The selector runs back to whichever punctuation ends the
          // previous thing — including the layer's own `{`, which is what
          // the first rule in the layer butts up against.
          const cut = Math.max(
            css.lastIndexOf("}", ruleStart - 1),
            css.lastIndexOf("{", ruleStart - 1),
            css.lastIndexOf(";", ruleStart - 1),
          );
          const selector = css.slice(cut + 1, ruleStart);
          const body = css.slice(ruleStart, i);
          const name = selector.trim().replace(/^\./, "").replace(/\\/g, "");
          if (/(^|[\s;{])display\s*:/.test(body)) out.add(name);
          ruleStart = -1;
        }
        if (depth === 0) break;
      }
    }
    return out;
  }

  it("agrees on every utility this tree actually writes", async () => {
    const written = [
      ...new Set(
        CLASS_LISTS.flatMap((c) => c.tokens).map((t) =>
          baseUtility(t).replace(/^!/, "").replace(/!$/, ""),
        ),
      ),
    ].filter((t) => /^[a-z[]/.test(t));

    const perTailwind = await displayUtilitiesPerTailwind(written);
    // The clamp utilities emit a `display` of their own — that is the whole
    // mechanism — and `line-clamp-none` is the sanctioned way to release a
    // clamp. Neither is a foreign `display` overriding the clamp, so both are
    // out of the comparison rather than out of the recogniser by accident.
    const oracle = [...perTailwind]
      .filter((t) => !t.startsWith("line-clamp-"))
      .sort();
    const mine = written.filter(isDisplayUtility).sort();

    expect(mine).toEqual(oracle);
  }, 30_000);

  it("reads the clamp utilities as display-setting, which is why they collide", async () => {
    // The premise of the whole file, taken from the compiler rather than
    // from the docstring above it. If a future Tailwind stops giving
    // `line-clamp-2` a `display`, this rule has no reason to exist and this
    // is the assertion that says so.
    const perTailwind = await displayUtilitiesPerTailwind([
      "line-clamp-2",
      "line-clamp-none",
      "flex-1",
      "table-fixed",
    ]);
    expect([...perTailwind].sort()).toEqual(["line-clamp-2", "line-clamp-none"]);
  }, 30_000);
});

/**
 * The recogniser, case by case, with the answer declared beside each input.
 *
 * Without this the suite above proves only that the tree and the scan agree,
 * which a scan that recognises nothing also achieves. The expectation for each
 * case is written here rather than read off the tree.
 */
describe("the recogniser", () => {
  const flags = (value: string) => {
    const tokens = classTokens(`"${value}"`);
    return tokens.some(isLineClamp) && tokens.some(isDisplayUtility);
  };

  it.each(DISPLAY_UTILITIES)("catches `%s` beside a clamp", (utility) => {
    expect(flags(`${utility} line-clamp-2`)).toBe(true);
    expect(flags(`sm:${utility} line-clamp-2`)).toBe(true);
  });

  it.each([
    // The defect this unit exists for, in both of its spellings.
    ["block line-clamp-2 text-sm font-semibold", true],
    ["line-clamp-2 block", true],
    ["line-clamp-2 text-sm font-semibold", false],
    // `flex-1` is not a display utility. `MatchOverlay` writes
    // `line-clamp-2 min-w-0 flex-1` and is not an instance of this defect;
    // a scan matching on a prefix would report it and send the next reader
    // to break a working component.
    ["line-clamp-2 min-w-0 flex-1 text-[11px]", false],
    ["line-clamp-2 flex-col", false],
    ["line-clamp-2 grid-cols-3", false],
    ["line-clamp-2 table-fixed", false],
    ["line-clamp-2 inline-size-full", false],
    // The clamp's own release valve, which is meant to be paired with a clamp.
    ["line-clamp-3 hover:line-clamp-none", false],
    ["line-clamp-none", false],
    // A display set through an arbitrary property is still a display.
    ["line-clamp-2 [display:flex]", true],
    ["line-clamp-2 md:[display:block]", true],
    // Variants on either side.
    ["md:line-clamp-2 flex", true],
    ["[&>p]:line-clamp-2 [&>p]:block", true],
    // Arbitrary clamp values.
    ["line-clamp-[7] block", true],
    ["line-clamp-[7] gap-2", false],
    // Neither half present.
    ["flex items-center gap-2", false],
    ["", false],
  ] as [string, boolean][])("reads `%s` as %s", (value, expected) => {
    expect(flags(value)).toBe(expected);
  });

  it("reads a clamp out of a cn() call and a hoisted constant alike", () => {
    const attribute = classListsIn(
      "probe.tsx",
      'const x = <p className={cn("line-clamp-2", flag && "block")} />;',
    );
    expect(attribute).toHaveLength(1);
    expect(
      attribute[0].tokens.some(isLineClamp) &&
        attribute[0].tokens.some(isDisplayUtility),
    ).toBe(true);

    const hoisted = classListsIn(
      "probe.ts",
      'const TITLE_CLASS = "block line-clamp-2 text-sm";',
    );
    expect(hoisted).toHaveLength(1);
    expect(
      hoisted[0].tokens.some(isLineClamp) &&
        hoisted[0].tokens.some(isDisplayUtility),
    ).toBe(true);
  });
});
