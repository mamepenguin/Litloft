import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { REQUIRED } from "../../e2e-layout/build-fixture-css";

/**
 * Where each `pointer-coarse:` needle is allowed to be written.
 *
 * `e2e-layout/build-fixture-css.ts` asserts that particular rules came out
 * of the compiled sheet, so the fixture cannot measure a page with no
 * stylesheet and pass. Tailwind builds that sheet by scanning everything
 * under `frontend/` — comments, docstrings and assertion strings included,
 * not only class lists — so **any file that spells a needled class whole is
 * a source for it**, after which that needle can never be absent and asserts
 * nothing.
 *
 * One file is out of that set: `globals.css` carries an `@source not` for
 * `build-fixture-css.ts` itself, because the list's own entries are the
 * purest case of this — `".p-4 {"` is a string containing `p-4`, so the
 * assertion was its own source. The exclusion covers that whole file;
 * everything below is about the files still scanned.
 *
 * That has now happened three times on this branch, in a different kind of
 * file each time: a comment in `build-fixture-css.ts`, assertion strings in
 * two suites, and a docstring in `rowFurniture.ts` — each round's sweep
 * covered the kind of file the round before had been bitten by. Which is why
 * this is a test rather than a fourth sweep.
 *
 * **What it holds and what it does not.** It reads source text, so it holds
 * a spelling and says nothing about the emitted sheet: whether the compiler
 * extracts a given string is `build-fixture-css.ts`'s concern, and whether
 * the rule then moves a box is measured on real boxes in
 * `e2e-layout/list-row-furniture.spec.ts`. What it holds is the property
 * those two rest on — that taking a class out of the component takes it out
 * of the sheet.
 *
 * It walks the working tree and drops what `.gitignore` drops, which is the
 * set Tailwind scans. Symlinks are not followed, so `src/addons/*` — links
 * into the addon submodules, which CI checks out without — is out of scope
 * here as it is for Tailwind when absent.
 */

/**
 * The needles, declared as parts so this file is not itself a source for any
 * of them: `["-ml", "3"]` is the class the group cancels the row's gap with,
 * and neither half is a utility on its own. Written whole here — as the
 * first draft of this comment did — this file joins the list it asserts on.
 */
const NEEDLE_PARTS = [
  ["h", "11"],
  ["w", "11"],
  ["pr", "0"],
  ["-ml", "3"],
  ["gap", "0"],
] as const;

type Parts = readonly [string, string];

const base = ([property, value]: Parts) => `${property}-${value}`;
const coarse = (parts: Parts) => `pointer-coarse:${base(parts)}`;

/**
 * The needles a component edit is supposed to be able to make absent, and
 * the ones it cannot.
 *
 * The touch floor is written by eight product files besides
 * `rowFurniture.ts`, so no edit to this branch's recipe can take it out of
 * the sheet. That is a property of the utility rather than a defect, and it
 * is recorded here rather than left for the next reader to rediscover. The
 * other three are written by the recipe and the fixture only.
 */
const CANNOT_BE_ABSENT: readonly Parts[] = [
  ["h", "11"],
  ["w", "11"],
];
const CAN_BE_ABSENT: readonly Parts[] = [
  ["pr", "0"],
  ["-ml", "3"],
  ["gap", "0"],
];

/**
 * Every file that may spell one of `CAN_BE_ABSENT` whole, and how often.
 *
 * Two: the recipe that exports it, once per class on its own export line,
 * and the fixture whose rows carry it. Counted rather than listed by file
 * alone, because the instance this test was written for was a *second*
 * mention inside the file that legitimately holds the first.
 */
const ALLOWED_SOURCES: Record<string, number> = {
  "src/components/rowFurniture.ts": 1,
  "e2e-layout/fixtures/list-row-furniture.html": 4,
};

/**
 * Where the same utilities may be written *without* the variant.
 *
 * Empty, and that emptiness is the assertion. A bare spelling is extracted
 * as its own candidate, and the shipped sheet then carries a rule nothing in
 * the app uses. The escaped selector spelling this branch writes in prose
 * does not reach this: measured, it hides the variant from the scanner and
 * leaves the base utility behind, so prose has to split the token too.
 *
 * If a component ever genuinely needs one of these on its own, add it here
 * with a count. The point is not that the class is forbidden — it is that it
 * is written on purpose.
 */
const ALLOWED_BASE_SOURCES: Record<string, number> = {};

const FRONTEND = join(__dirname, "..", "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "coverage",
  "playwright-report",
  "test-results",
]);

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path, found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (statSync(path).size > 2_000_000) continue;
    found.push(path);
  }
  return found;
}

/**
 * The working tree minus what git ignores — `e2e-layout/fixtures/globals.built.css`
 * above all, which is this sheet compiled and would match every needle in it.
 */
function scannedFiles(): string[] {
  const candidates = walk(FRONTEND);
  const checked = spawnSync("git", ["check-ignore", "--stdin", "-z"], {
    cwd: FRONTEND,
    input: candidates.join("\0"),
    encoding: "utf8",
  });
  const ignored = new Set((checked.stdout ?? "").split("\0").filter(Boolean));
  return candidates.filter((path) => !ignored.has(path));
}

/**
 * Occurrences of a class spelled whole.
 *
 * Bounded on both sides. The lookahead stops a needle matching inside a
 * longer utility — each zero-spacing one is a prefix of its own `.5` sibling
 * — and the lookbehind is what separates a base utility from the same
 * letters inside its own variant form, or inside the escaped selector
 * spelling this branch writes in prose, where a backslash sits between
 * `coarse` and the colon.
 */
function countBare(text: string, className: string): number {
  const pattern = new RegExp(
    `(?<![\\w:\\\\-])${className.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?![\\w.-])`,
    "g",
  );
  return text.match(pattern)?.length ?? 0;
}

function sourcesOf(files: readonly string[], className: string): Record<string, number> {
  const counted: Record<string, number> = {};
  for (const path of files) {
    const hits = countBare(readFileSync(path, "utf8"), className);
    if (hits > 0) counted[relative(FRONTEND, path).split(sep).join("/")] = hits;
  }
  return counted;
}

describe("pointer-coarse needle sources", () => {
  it("classifies every pointer-coarse needle the fixture's sheet is checked for", () => {
    // Read back out of `REQUIRED` rather than respelled here, so a needle
    // added there has to be classified below before this file is green
    // again. `REQUIRED` holds the selector each one emits; this is the
    // inverse of that spelling.
    const fromRequired = REQUIRED.filter((rule) => rule.startsWith(".pointer-coarse")).map(
      (rule) => rule.replace(/^\./, "").replace(/\s*\{$/, "").replace(/\\:/g, ":"),
    );

    expect(fromRequired.slice().sort()).toEqual(NEEDLE_PARTS.map(coarse).sort());
    expect([...CANNOT_BE_ABSENT, ...CAN_BE_ABSENT].map(coarse).sort()).toEqual(
      NEEDLE_PARTS.map(coarse).sort(),
    );
  });

  it("spells each needle that must be able to fail in its declared places only", () => {
    const files = scannedFiles();
    for (const parts of CAN_BE_ABSENT) {
      expect(sourcesOf(files, coarse(parts)), coarse(parts)).toEqual(ALLOWED_SOURCES);
    }
  });

  it("writes none of those utilities without the variant", () => {
    const files = scannedFiles();
    for (const parts of CAN_BE_ABSENT) {
      expect(sourcesOf(files, base(parts)), base(parts)).toEqual(ALLOWED_BASE_SOURCES);
    }
  });

  /**
   * The exclusion the needles with no backslash in them rest on.
   *
   * Escaping is what made `.pointer-coarse\:pr-0 {` and `.h-\[90vh\] {`
   * falsifiable, and it is a property of those selectors rather than a
   * decision: a needle whose class needs no escape — `.p-4 {`, `.h-12 {`,
   * `.flex-1 {` — is spelled in the list exactly as the scanner reads it,
   * and is its own source. Taking the file out of the scan is what makes
   * the property hold for all of them.
   *
   * **What this holds is the decision, not the mechanism.** It is a text
   * match on a stylesheet, which cannot tell you what a compiler does;
   * whether the exclusion works was measured by taking each needle's
   * class out of every component, fixture, spec and comment in the tree
   * and watching `globalSetup` name it, and those figures are in the PR
   * that added the line. What this stops is the line being deleted
   * without anyone re-measuring.
   */
  it("keeps the needle list itself out of the scanner", () => {
    const globals = readFileSync(join(FRONTEND, "src", "app", "globals.css"), "utf8");
    expect(globals).toContain('@source not "../../e2e-layout/build-fixture-css.ts";');
  });
});
