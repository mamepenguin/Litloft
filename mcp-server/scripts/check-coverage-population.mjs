#!/usr/bin/env node
/**
 * Ask the collector what it measured, and compare it with a declared population.
 *
 * The thresholds in `vitest.config.ts` are lower bounds, and a lower bound is
 * not a detector on its own: shrink the denominator and the percentage goes up.
 * This is what earns them.
 *
 * There are three sides, and the third is the one that is easy to leave out:
 *
 * - what the collector reported, from `coverage/coverage-summary.json`;
 * - an independent walk of `src/`, with its predicates written out below;
 * - what git's index holds.
 *
 * The first two both read the working tree, so a deleted directory leaves both
 * of them in the same step and the comparison stays satisfied over a smaller
 * population. The index does not move when files are deleted.
 *
 * Only one direction of the index check is enforced: tracked-but-absent fails,
 * present-but-untracked does not, because the second is what a new file looks
 * like before its first commit. The walk and the report hold that direction
 * between them.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUMMARY = join(PKG, "coverage", "coverage-summary.json");

/** Directory names the walk never descends. */
const SKIP_DIRS = new Set(["__tests__", "node_modules", "dist"]);

/**
 * Files on disk the report is right not to contain, declared by name with a
 * reason. Empty here, and an entry is a claim that the collector is correct to
 * omit that file — not a way to silence a disagreement.
 */
const NOT_MEASURED = [];

function productionSources(root, prefix) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      if (name.startsWith(".")) continue;
      const relPath = rel ? `${rel}/${name}` : name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(join(dir, name), relPath);
        continue;
      }
      if (!/\.ts$/.test(name) || /\.d\.ts$/.test(name)) continue;
      out.push(`${prefix}${relPath}`);
    }
  };
  walk(root, "");
  return out;
}

function trackedSources(prefix) {
  return execFileSync("git", ["-C", PKG, "ls-files", "-z", "src"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .filter(
      (p) =>
        /\.ts$/.test(p) &&
        !/\.d\.ts$/.test(p) &&
        !p.split("/").some((seg) => SKIP_DIRS.has(seg)),
    )
    .map((p) => `${prefix}${p.slice("src/".length)}`);
}

function fail(lines) {
  console.error("::error::coverage denominator check failed");
  for (const l of lines) console.error(l);
  process.exit(1);
}

if (!existsSync(SUMMARY)) {
  fail([
    `No ${SUMMARY}.`,
    "`reportOnFailure: true` is set, so even a red suite writes one — its",
    "absence means coverage did not run, or ran with a different config.",
    "This is never a pass.",
  ]);
}

const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));
const measured = new Set(
  Object.keys(summary)
    .filter((k) => k !== "total")
    .map((k) => resolve(k).replace(`${PKG}/`, "")),
);

const declared = new Set(productionSources(join(PKG, "src"), "src/"));
const tracked = new Set(trackedSources("src/"));
for (const p of NOT_MEASURED) {
  declared.delete(p);
  tracked.delete(p);
}

const missing = [...declared].filter((p) => !measured.has(p)).sort();
const unexpected = [...measured].filter((p) => !declared.has(p)).sort();
const untracked = [...tracked].filter((p) => !declared.has(p)).sort();

if (missing.length || unexpected.length || untracked.length) {
  const lines = [];
  if (untracked.length) {
    lines.push(
      `${untracked.length} tracked file(s) are missing from the working tree:`,
      ...untracked.map((p) => `  - ${p}`),
    );
  }
  if (missing.length) {
    lines.push(
      `${missing.length} file(s) declared but not measured:`,
      ...missing.map((p) => `  - ${p}`),
    );
  }
  if (unexpected.length) {
    lines.push(
      `${unexpected.length} file(s) measured but not declared:`,
      ...unexpected.map((p) => `  - ${p}`),
      "A test helper that matches neither `*.test.*` nor `*.spec.*` enters the",
      "denominator as production code when `exclude` is written as a filename",
      "pattern instead of the test directory.",
    );
  }
  fail(lines);
}

console.log(
  `coverage denominator: ${measured.size} files (${tracked.size} tracked), ` +
    `${NOT_MEASURED.length} declared absent`,
);
