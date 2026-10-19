import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { REQUIRED } from "../../e2e-layout/build-fixture-css";

/**
 * Tailwind builds the fixture's sheet by scanning everything under
 * `frontend/` — comments and assertion strings included — so any file that
 * spells a needled class whole is a source for it, after which that needle
 * can never be absent and asserts nothing.
 *
 * Every file in `src/addons/*` is a symlink into an addon submodule, which
 * this walk does not follow; copying the files instead of linking them would
 * silently double the set.
 */

/**
 * Declared as parts so this file is not itself a source for any of them.
 * Neither half is a utility on its own.
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
 * `CANNOT_BE_ABSENT` are written by many product files, so no single
 * component edit can take them out of the sheet. The classification is for
 * the tree this file walks (no addon symlinks), not for a developer's
 * checkout.
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
 * Counted rather than listed by file alone, because a second mention inside
 * the file that legitimately holds the first is still a source.
 */
const ALLOWED_SOURCES: Record<string, number> = {
  "src/components/rowFurniture.ts": 1,
  "e2e-layout/fixtures/list-row-furniture.html": 4,
};

/**
 * Empty on purpose: a bare spelling is extracted as its own candidate, and
 * the shipped sheet then carries a rule nothing in the app uses.
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
    // again.
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

    // Counted rather than enumerated: writing the class names out as
    // literals here would make this file a source for every one of them.
    expect(REQUIRED).toHaveLength(61);

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

  it("keeps the needle list itself out of the scanner", () => {
    const globals = readFileSync(join(FRONTEND, "src", "app", "globals.css"), "utf8");
    expect(globals).toContain('@source not "../../e2e-layout/build-fixture-css.ts";');
  });
});
