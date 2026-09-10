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
 * purest case of this — a needle is a string containing the class it asks
 * the sheet for, so the assertion was its own source. The exclusion covers
 * that whole file; everything below is about the files still scanned.
 *
 * Note what the exclusion does **not** buy, because two rounds of comments
 * claimed it did: it does not make those needles guards. A rule leaves the
 * sheet only when nothing scanned writes its class, and the classes in
 * question are written across the app. See `build-fixture-css.ts`'s own
 * header, which now carries the measurement.
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
 * set Tailwind scans. `src/addons/*` is out of scope on both counts: it is
 * gitignored, and every file in it is a symlink into an addon submodule,
 * which this walk does not follow. (The directories themselves stopped being
 * symlinks when `setup-addons.sh` began building a link per file; the
 * per-file links are what keeps this walk from reading an addon twice, so
 * copying the files instead of linking them would silently double the set.)
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
  ["min-h", "11"],
  ["before:-inset", "1.5"],
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
 *
 * The two added for the `Button` floor sit on the same side for the same
 * reason: the floor is written by twenty-eight core files and the overhang
 * by four, so neither can be made absent by editing `Button.tsx`. Named by
 * role rather than spelled, because a bare base utility written here is a
 * source for a rule nothing in the app uses — which is what the emptiness
 * of `ALLOWED_BASE_SOURCES` below is about, and this sentence was the one
 * place in the file breaking it.
 *
 * **What "cannot be absent" is relative to.** Measured by stripping every
 * whole spelling of each class from every scanned file and rebuilding the
 * fixture's sheet: with the addon symlinks in place, all four survive —
 * `intelligence` and `knowledge` write the floor, the overhang and the two
 * sizing classes in their own components, and this walk skips symlinks. With
 * `src/addons` absent, which is the state CI's layout job checks out in, all
 * four make the build fail naming the sheet. So a needle's teeth depend on
 * whether the submodules are present, and the four here are classified for
 * the tree this file walks rather than for a developer's checkout.
 */
const CANNOT_BE_ABSENT: readonly Parts[] = [
  ["h", "11"],
  ["w", "11"],
  ["min-h", "11"],
  ["before:-inset", "1.5"],
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
      (rule) =>
        rule
          .replace(/^\./, "")
          .replace(/\s*\{$/, "")
          // Both escapes CSS needs, not only the colon: an arbitrary-valued
          // utility carries `\.` in its selector, and leaving that in makes
          // the inverse spelling disagree with the parts below for a reason
          // that is not a missing classification.
          .replace(/\\([:.])/g, "$1"),
    );

    // The three lists tied to each other, and then the population declared.
    //
    // The ties are directional on their own: a needle added to `REQUIRED`
    // and left unclassified is red here. A *deletion* is not — it leaves all
    // three sides at once and every case below loops over the lists, so the
    // suite does not even change in count. Detector rule 5, inside the
    // guard. Measured: deleting one needle from `REQUIRED`, `NEEDLE_PARTS`
    // and `CANNOT_BE_ABSENT` together left 429 files / 5,968 tests, the
    // baseline exactly, with the sheet no longer checked for that rule.
    //
    // Counted rather than enumerated, and that is the one place in this
    // repository where a count is the stronger instrument: writing the seven
    // class names out as literals here would make this file a source for
    // every one of them, which is the failure the whole file exists to
    // catch. The parts table above is split for the same reason. So the size
    // is declared and the membership is held by the two ties.
    // The whole list, not only the variant slice this file reads.
    //
    // The three ties below hold the `pointer-coarse` entries against each
    // other; nothing held the rest, so deleting a plain needle left the
    // suite at its baseline count — the same walk-back one block down,
    // one block wider. Declared here because this is the only file that
    // imports `REQUIRED`.
    //
    // The price of that is one line per needle added anywhere: 42 to 49
    // when unit F merged in, which brought `.fixed`, `.inset-0`, `.z-30`,
    // `.z-10`, `.z-20`, `.z-50` and `.bottom-0` — the tiers the popup
    // fixtures' four stacking arrangements are made of, and 49 to 53 for
    // the `sm:` halves of the shared toolbar surface.
    expect(REQUIRED).toHaveLength(53);

    expect(NEEDLE_PARTS).toHaveLength(7);
    expect(CANNOT_BE_ABSENT).toHaveLength(4);
    expect(CAN_BE_ABSENT).toHaveLength(3);

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
   * The exclusion that stops the needle list adding rules to the sheet.
   *
   * A needle is a string holding the class it asks the sheet for, so every
   * entry whose class the scanner can read whole was a source for its own
   * rule — dead CSS in the sheet every viewer loads, emitted by an
   * assertion. Taking the file out of the scan stops that for all of them
   * at once.
   *
   * **It does not make any needle a guard**, which is what the paragraph
   * that stood here used to say. That claim was wrong twice over: a rule
   * leaves the sheet only when nothing scanned writes its class, and the
   * classes concerned are written across the app; and the escape those
   * needles were said to rest on is itself a token boundary, so an escaped
   * selector in prose emits its unescaped head rather than itself. Both are
   * measured in `build-fixture-css.ts`'s header.
   *
   * **What this case holds is the decision, not the mechanism.** It is a
   * text match on a stylesheet, which cannot tell you what a compiler does.
   * Whether the exclusion works was measured by compiling `source(none)`
   * against one file at a time; the figures are in the PR. What this stops
   * is the line being deleted without anyone re-measuring.
   *
   * Its own prose names no selector, for the reason the parts table above
   * is split: this file would otherwise be the source it exists to forbid.
   */
  it("keeps the needle list itself out of the scanner", () => {
    const globals = readFileSync(join(FRONTEND, "src", "app", "globals.css"), "utf8");
    expect(globals).toContain('@source not "../../e2e-layout/build-fixture-css.ts";');
  });
});
