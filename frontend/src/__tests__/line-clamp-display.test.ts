import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join, relative } from "node:path";
import { __unstable__loadDesignSystem, compile } from "tailwindcss";

import {
  classAttributeSpans,
  classConstSpans,
  stringLiterals,
  stripComments,
} from "./helpers/sourceScan";
import { addonPresent } from "./helpers/addonPresent";
import { assertSameCompiler } from "../../e2e-layout/build-fixture-css";

/**
 * `line-clamp-*` brings its own `display`, so nothing else may set one: on any
 * display but `-webkit-box` the clamp is inert, and which of the two utilities
 * wins is Tailwind's emit order, not the author's.
 *
 * Branches inside one class list are read as one list. If an exclusive
 * `cond ? "block" : "line-clamp-2"` appears, split it across two attributes
 * rather than widening this scan.
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
 * `addonPresent` is handed `addons/<name>`, not the `/frontend` root: passing
 * the full root would silently drop a checked-out addon that stopped shipping a
 * frontend.
 */
const EXPECTED_ROOTS = [
  "frontend/src",
  ...["cloud-sync", "intelligence", "knowledge", "media_import"]
    .filter((name) => addonPresent(REPO_ROOT, `addons/${name}`))
    .map((name) => `addons/${name}/frontend`),
];

/**
 * `hidden` is deliberately included: a `hidden md:block` element that wants a
 * clamp should put it on an inner element instead.
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

const ARBITRARY_DISPLAY = /^!?\[display:/;

function isDisplayUtility(token: string): boolean {
  const base = baseUtility(token).replace(/^!/, "").replace(/!$/, "");
  return DISPLAY_SET.has(base) || ARBITRARY_DISPLAY.test(baseUtility(token));
}

function isLineClamp(token: string): boolean {
  const base = baseUtility(token).replace(/^!/, "").replace(/!$/, "");
  return base.startsWith("line-clamp-") && base !== "line-clamp-none";
}

/**
 * Not `sourceScan`'s `stringLiterals`: it returns a backtick span whole, so a
 * `"block"` inside `${…}` keeps its quotes and a set lookup misses it.
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
    expect(offenders).toEqual([]);
  });
});

/**
 * The compiler is asked about base utilities only, so each candidate emits a
 * flat rule and brace counting is enough to read the output.
 */
describe("the display enumeration matches Tailwind's own", () => {
  const req = createRequire(import.meta.url);
  const entry = req.resolve("tailwindcss/index.css");
  const base = dirname(entry);
  const loadStylesheet = async (id: string) => {
    const path = id === "tailwindcss" ? entry : req.resolve(id);
    return { path, base: dirname(path), content: readFileSync(path, "utf8") };
  };

  async function everyKnownUtility(): Promise<string[]> {
    const design = await __unstable__loadDesignSystem(readFileSync(entry, "utf8"), {
      base,
      loadStylesheet,
    });
    const names = design.getClassList().map(([name]: [string, unknown]) => name);
    expect(names).toContain("line-clamp-2");
    expect(names).toContain("sr-only");
    return names;
  }

  async function displayUtilitiesPerTailwind(
    candidates: string[],
  ): Promise<Set<string>> {
    const compiler = await compile('@import "tailwindcss";', {
      base,
      loadStylesheet,
    });
    const css = compiler.build(candidates);

    const layer = css.indexOf("@layer utilities {");
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
          // Includes the layer's own `{`, which the first rule butts up against.
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
    const oracle = [...perTailwind]
      .filter((t) => !t.startsWith("line-clamp-"))
      .sort();
    const mine = written.filter(isDisplayUtility).sort();

    expect(mine).toEqual(oracle);
  }, 30_000);

  it("reads the clamp utilities as display-setting, which is why they collide", async () => {
    const perTailwind = await displayUtilitiesPerTailwind([
      "line-clamp-2",
      "line-clamp-none",
      "flex-1",
      "table-fixed",
    ]);
    expect([...perTailwind].sort()).toEqual(["line-clamp-2", "line-clamp-none"]);
  }, 30_000);
});

const SPELLINGS: ReadonlyArray<readonly [string, (value: string) => string]> = [
  ["a quoted attribute", (v) => `"${v}"`],
  ["a template literal", (v) => `{\`${v}\`}`],
  ["a quoted literal inside an interpolation", (v) => `{\`\${wide ? "${v}" : ""}\`}`],
  ["a nested template inside an interpolation", (v) => `{\`\${wide ? \`${v}\` : ""}\`}`],
];

/**
 * A real Tailwind arbitrary property that nothing in the app writes, so its
 * presence in the built sheet can only come from this file's own text.
 */
const STYLESHEET_SENTINEL = "[display:revert-layer]";

/**
 * Tailwind escapes the selector and spaces the declaration, so the class
 * string never appears in the output; only the value survives both.
 */
const SENTINEL_NEEDLE = "revert-layer";

const RECOGNISER_CASES = [
  ["block line-clamp-2 text-sm font-semibold", true],
  ["line-clamp-2 block", true],
  ["line-clamp-2 text-sm font-semibold", false],
  ["line-clamp-2 min-w-0 flex-1 text-[11px]", false],
  ["line-clamp-2 flex-col", false],
  ["line-clamp-2 grid-cols-3", false],
  ["line-clamp-2 table-fixed", false],
  ["line-clamp-2 inline-size-full", false],
  ["line-clamp-3 hover:line-clamp-none", false],
  ["line-clamp-none", false],
  ["line-clamp-2 [display:flex]", true],
  ["line-clamp-2 md:[display:block]", true],
  ["line-clamp-2 [display:revert-layer]", true],
  ["md:line-clamp-2 flex", true],
  ["[&>p]:line-clamp-2 [&>p]:block", true],
  ["line-clamp-[7] block", true],
  ["line-clamp-[7] gap-2", false],
  ["flex items-center gap-2", false],
  ["", false],
] as [string, boolean][];

describe("the recogniser", () => {
  const flags = (value: string, spell: (v: string) => string) => {
    const tokens = classTokens(spell(value));
    return tokens.some(isLineClamp) && tokens.some(isDisplayUtility);
  };

  const matrix = <T extends readonly unknown[]>(rows: readonly T[]) =>
    rows.flatMap((row) =>
      SPELLINGS.map(([name, spell]) => [name, ...row, spell] as const),
    );

  it("writes the source shapes it says it writes", () => {
    expect(Object.fromEntries(SPELLINGS.map(([n, f]) => [n, f("X Y")]))).toEqual(
      {
        "a quoted attribute": '"X Y"',
        "a template literal": "{`X Y`}",
        "a quoted literal inside an interpolation": '{`${wide ? "X Y" : ""}`}',
        "a nested template inside an interpolation": "{`${wide ? `X Y` : \"\"}`}",
      },
    );
  });

  it("writes shapes that a quote-only reader gets wrong", () => {
    const naive = (src: string) =>
      stringLiterals(src)
        .flatMap((literal) => literal.split(/\s+/))
        .filter(Boolean)
        .sort();
    const byName = Object.fromEntries(SPELLINGS);
    const tokens = ["block", "line-clamp-2"];

    expect(naive(byName["a quoted attribute"]("block line-clamp-2"))).toEqual(
      tokens,
    );
    expect(naive(byName["a template literal"]("block line-clamp-2"))).toEqual(
      tokens,
    );
    expect(
      naive(
        byName["a quoted literal inside an interpolation"]("block line-clamp-2"),
      ),
    ).not.toEqual(tokens);
    expect(
      naive(
        byName["a nested template inside an interpolation"](
          "block line-clamp-2",
        ),
      ),
    ).not.toEqual(tokens);

    for (const [name, spell] of SPELLINGS) {
      expect(classTokens(spell("block line-clamp-2")).sort(), name).toEqual(
        tokens,
      );
    }
  });

  it.each(matrix(DISPLAY_UTILITIES.map((u) => [u] as const)))(
    "as %s, catches `%s` beside a clamp",
    (_spelling, utility, spell) => {
      expect(flags(`${utility} line-clamp-2`, spell)).toBe(true);
      expect(flags(`sm:${utility} line-clamp-2`, spell)).toBe(true);
    },
  );

  it.each(matrix(RECOGNISER_CASES))(
    "as %s, reads `%s` as %s",
    (_spelling, value, expected, spell) => {
      expect(flags(value, spell)).toBe(expected);
    },
  );

  it("still carries the sentinel the stylesheet guard looks for", () => {
    expect(RECOGNISER_CASES.map(([value]) => value)).toContain(
      `line-clamp-2 ${STYLESHEET_SENTINEL}`,
    );
  });


  it("reads a template-literal className end to end, span reader included", () => {
    const [list] = classListsIn(
      "probe.tsx",
      "const x = <p className={`line-clamp-2 text-sm ${wide ? \"block\" : \"\"}`} />;",
    );
    expect(list.tokens.sort()).toEqual(["block", "line-clamp-2", "text-sm"]);
    expect(
      list.tokens.some(isLineClamp) && list.tokens.some(isDisplayUtility),
    ).toBe(true);
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
 * Tailwind scans `src/__tests__` without stripping comments, so every utility
 * named in this file would ship in the app's stylesheet without the
 * `@source not` line in `globals.css`.
 */
describe("the detector keeps out of the stylesheet", () => {
  const compileCss = (input: string): string => {
    const out = join(mkdtempSync(join(tmpdir(), "litloft-clamp-")), "built.css");
    execFileSync(
      resolve(REPO_ROOT, "frontend/node_modules/.bin/tailwindcss"),
      ["--input", input, "--output", out],
      { stdio: "pipe" },
    );
    return readFileSync(out, "utf8");
  };

  it("writes no rule of its own into the compiled sheet", () => {
    // The CLI binary, the `tailwindcss` import and the app's build are three
    // packages on independent `^4` ranges.
    assertSameCompiler();

    const req = createRequire(import.meta.url);
    const controlDir = mkdtempSync(join(tmpdir(), "litloft-clamp-control-"));
    const controlInput = join(controlDir, "control.css");
    writeFileSync(
      controlInput,
      `@import "${req.resolve("tailwindcss/index.css")}" source(none);\n` +
        `@source inline("${STYLESHEET_SENTINEL}");\n`,
    );
    expect(compileCss(controlInput)).toContain(SENTINEL_NEEDLE);

    const css = compileCss(resolve(REPO_ROOT, "frontend/src/app/globals.css"));

    expect(css).toContain(".line-clamp-2 {");
    expect(css).toContain(".justified-grid-host");

    expect(css).not.toContain(SENTINEL_NEEDLE);
  }, 60_000);
});
