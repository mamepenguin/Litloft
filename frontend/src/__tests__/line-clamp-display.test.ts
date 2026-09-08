import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { __unstable__loadDesignSystem, compile } from "tailwindcss";

import {
  classAttributeSpans,
  classConstSpans,
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
 * The roots are pinned by `EXPECTED_ROOTS` and the files inside them by
 * `ANCHORS`, because "no class list pairs the two" is also what a scan that
 * walked nothing reports.
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
 *   source scan. This is a static-text rule, not a rendered-DOM one. A literal
 *   the author typed is *not* one of these, wherever in the value it sits:
 *   `classTokens` descends into template interpolations for exactly that
 *   reason.
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
 * The roots this scan must actually walk, declared rather than counted.
 *
 * `ANCHORS` below cannot carry this: an anchor is a file that writes a clamp
 * today, and `cloud-sync` ships a frontend and writes none — so the root with
 * no anchor is exactly the one that could leave the glob unnoticed, and did:
 * narrowing the `readdirSync` filter by `&& e.name !== "cloud-sync"` left the
 * suite green. The day a sync status card grows a `line-clamp-2` it would have
 * been in a root nothing was watching.
 *
 * So the roots are named here, and an addon's root is dropped only when its
 * submodule is not checked out. `addons/<name>` and not `<name>/frontend`,
 * because that is the granularity `addonPresent` tests and the granularity a
 * non-recursive clone works at.
 */
const EXPECTED_ROOTS = [
  "frontend/src",
  "addons/cloud-sync/frontend",
  "addons/intelligence/frontend",
  "addons/knowledge/frontend",
  "addons/media_import/frontend",
].filter((root) => addonPresent(REPO_ROOT, root));

/**
 * Every utility Tailwind 4.2.2 compiles to a bare `display` declaration.
 *
 * **Enumerated, not counted.** The list is written out because a scan that
 * recognises "the display utilities" and means three of them reports zero
 * offenders while the fourth spelling sits in the tree. No assertion anywhere
 * in this file checks how long this array is — a length is a claim about
 * completeness that goes stale silently, and the enumeration is the claim.
 *
 * It is not left to a reader to keep true, either: "the display enumeration
 * matches Tailwind's own" below compiles the pinned Tailwind's entire utility
 * roster and asserts this array is exactly the part of it that sets a
 * `display`. Deleting an entry, misspelling one, or an upgrade that adds one
 * all turn that red.
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
 * Every piece of literal text in a source span, template interpolations
 * included.
 *
 * `sourceScan`'s `stringLiterals` returns a backtick span **whole**, `${…}`
 * and all, which is right for its own callers and wrong here: splitting that
 * on whitespace yields `"block"` with its quote characters still attached, and
 * a set lookup for `block` misses it. So a `display` written inside an
 * interpolation — ``className={`line-clamp-2 ${wide ? "block" : "inline"}`}``
 * — was invisible, and silently: the token stream is `line-clamp-2`, `${wide`,
 * `?`, `"block"`, `:`, `"inline"}`, nothing matches, nothing is reported.
 *
 * That is not an exotic shape. It is the tree's most common `className` form,
 * and a conditional `block` added to an element that already clamps is the
 * cheapest way for this whole defect to come back.
 *
 * This walker descends instead: quoted literals are taken as one piece,
 * template text is cut at each `${`, and the expression inside is scanned by
 * the same three rules, to any depth. What comes out for the case above is
 * `line-clamp-2`, `block`, `inline` — the tokens as the author wrote them.
 */
function literalChunks(src: string): string[] {
  const out: string[] = [];
  let i = 0;

  const readQuoted = (quote: string): void => {
    i += 1;
    const start = i;
    while (i < src.length && src[i] !== quote) {
      if (src[i] === "\\") i += 1;
      i += 1;
    }
    out.push(src.slice(start, i));
    i += 1;
  };

  const readTemplate = (): void => {
    i += 1;
    let start = i;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") {
        i += 2;
        continue;
      }
      if (src[i] === "$" && src[i + 1] === "{") {
        out.push(src.slice(start, i));
        i += 2;
        readExpression();
        start = i;
        continue;
      }
      i += 1;
    }
    out.push(src.slice(start, i));
    i += 1;
  };

  // Runs from just after a `${` to its matching `}`. Quotes and nested
  // templates are consumed by their own readers, so a `}` inside a string
  // cannot close the interpolation early.
  const readExpression = (): void => {
    let depth = 1;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'") {
        readQuoted(c);
        continue;
      }
      if (c === "`") {
        readTemplate();
        continue;
      }
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          return;
        }
      }
      i += 1;
    }
  };

  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") readQuoted(c);
    else if (c === "`") readTemplate();
    else i += 1;
  }
  return out;
}

/**
 * The class tokens inside one `className` value.
 *
 * A value is source text, not a string: it may be a `cn(...)` call, a
 * ternary, or a template literal with interpolations. Taking every literal
 * chunk and splitting those on whitespace gives every token the author wrote
 * literally, and only junk — never a false utility name — for the expression
 * fragments between them.
 */
function classTokens(value: string): string[] {
  return literalChunks(value)
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
 * deliberately skips.
 *
 * Each path here is a place a `line-clamp-*` is written today, which is a
 * different claim from covering every root — `cloud-sync` writes no clamp, so
 * it can carry no anchor. `EXPECTED_ROOTS` is what pins the roots; these pin
 * that class lists are being read out of the files inside them, in core and in
 * an addon, from an attribute and from a `*_CLASS` constant.
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
  it("walked every source root it claims to walk, and no other", () => {
    const rootOf = (rel: string) =>
      EXPECTED_ROOTS.find((root) => rel.startsWith(`${root}/`));
    // Both directions. A root that contributed nothing has left the glob;
    // a file under no declared root means a new addon frontend appeared and
    // the declaration above has not caught up with it.
    expect([...new Set(FILES.map((f) => rootOf(f.rel)))].sort()).toEqual(
      [...EXPECTED_ROOTS].sort(),
    );
    expect(FILES.filter((f) => !rootOf(f.rel)).map((f) => f.rel)).toEqual([]);
  });

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
 * exactly the thing that can be shortened by one entry and stay green:
 * `it.each(DISPLAY_UTILITIES)` shrinks along with the array, so the population
 * walks back and the suite reports fewer tests, all passing. That is detector
 * rule 5 — the expectation must not be derived from the same observation it
 * checks. **Measured, on the first round of this file: 13 of the 21 entries
 * could be deleted with everything green**, because the only oracle was the
 * utilities the tree happens to write and the tree writes none of those
 * thirteen.
 *
 * So the second side is Tailwind's own answer to the same question, twice
 * over:
 *
 * 1. **Completeness.** `__unstable__loadDesignSystem().getClassList()` is the
 *    compiler's full roster of utility names — the one Tailwind's editor
 *    tooling completes from. Compiling all of it and keeping the rules that
 *    carry a `display` yields the set this file is claiming to enumerate, from
 *    an implementation that is not this file. Deleting any entry is red;
 *    misspelling one is red; a Tailwind upgrade that adds a display utility is
 *    red the day it lands, not the day someone writes it.
 * 2. **The tree's own spellings.** The roster holds bare utility names, so it
 *    says nothing about `[display:flex]`, `!hidden` or `sm:block`. Every
 *    distinct token the scanned tree writes is therefore put through the
 *    compiler as well, and compared against the recogniser. That is where a
 *    variant or arbitrary-property spelling the recogniser mishandles shows up.
 *
 * The compiler is asked about **base utilities only** — variants are stripped
 * first — so what it emits is a flat rule per candidate and the reading needs
 * no CSS parser beyond brace counting.
 */
describe("the display enumeration matches Tailwind's own", () => {
  const req = createRequire(import.meta.url);
  const entry = req.resolve("tailwindcss/index.css");
  const base = dirname(entry);
  const loadStylesheet = async (id: string) => {
    const path = id === "tailwindcss" ? entry : req.resolve(id);
    return { path, base: dirname(path), content: readFileSync(path, "utf8") };
  };

  /** Every utility name the pinned compiler knows about. */
  async function everyKnownUtility(): Promise<string[]> {
    const design = await __unstable__loadDesignSystem(readFileSync(entry, "utf8"), {
      base,
      loadStylesheet,
    });
    const names = design.getClassList().map(([name]: [string, unknown]) => name);
    // A roster this walk failed to read would make every comparison below
    // trivially agree. It is five figures on 4.2.2; assert it is a roster and
    // not a handful, without pinning a number that a minor release moves.
    expect(names).toContain("line-clamp-2");
    expect(names).toContain("sr-only");
    return names;
  }

  /** The `display`-emitting subset of `candidates`, according to Tailwind. */
  async function displayUtilitiesPerTailwind(
    candidates: string[],
  ): Promise<Set<string>> {
    const compiler = await compile('@import "tailwindcss";', {
      base,
      loadStylesheet,
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

  it("is exactly the set Tailwind gives a bare display to", async () => {
    const perTailwind = await displayUtilitiesPerTailwind(
      await everyKnownUtility(),
    );
    // The clamps set a `display` of their own — that is the mechanism this
    // whole file is about — and `line-clamp-none` is the sanctioned release
    // valve. Neither is a foreign `display` overriding a clamp, so both are
    // out of the comparison rather than out of the recogniser by accident.
    const oracle = [...perTailwind]
      .filter((name) => !name.startsWith("line-clamp-"))
      .sort();
    expect([...DISPLAY_UTILITIES].sort()).toEqual(oracle);
  }, 60_000);

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

/**
 * This file's own class names must not reach the shipped stylesheet.
 *
 * Tailwind auto-detects its sources by walking out from `globals.css` and
 * scanning everything under `frontend/` that `.gitignore` does not exclude —
 * `src/__tests__` included, and it does not strip comments. So the
 * enumeration above, the case table below it and the prose around both are
 * candidates, and every utility named here got a rule in the sheet every
 * viewer loads, `not-sr-only` among them, out of a docstring sentence. The
 * `@source not` line in `globals.css` is what stops it, and it grows more
 * load-bearing with every case added here.
 *
 * **This does not recompile the stylesheet** — it checks the declaration is
 * there and still points at this file, which is the realistic decay (the line
 * deleted, or this file renamed and the line left behind). Recompiling from
 * vitest means shelling out to the Tailwind CLI on every run, and
 * `tailwind-scans-addons.test.ts` declined that for the same reason. The way
 * to re-measure the bytes is in the comment beside the directive.
 */
describe("the detector keeps out of the stylesheet", () => {
  it("is excluded from Tailwind's source scan by name", () => {
    const globals = readFileSync(
      resolve(REPO_ROOT, "frontend/src/app/globals.css"),
      "utf8",
    );
    const declared = /@source\s+not\s+"([^"]+)"/g;
    const excluded = [...globals.matchAll(declared)].map((m) =>
      resolve(REPO_ROOT, "frontend/src/app", m[1]),
    );
    // Resolved to a path rather than matched as a string, so renaming this
    // file breaks it instead of leaving a directive pointing at nothing —
    // Tailwind says nothing about a `@source not` that matches no file.
    expect(excluded).toContain(SELF);
  });
});
