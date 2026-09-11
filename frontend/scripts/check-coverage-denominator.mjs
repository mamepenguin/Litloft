#!/usr/bin/env node
/**
 * Ask the collector what it measured, and compare it with a declared population.
 *
 * The thresholds in `vitest.config.ts` are lower bounds, and a lower bound is
 * not a detector on its own: shrink the denominator and the percentage goes up.
 * This step is what makes them legitimate. It reads
 * `coverage/coverage-summary.json` — the population the collector actually
 * produced — and checks it against what this file says it should be.
 *
 * Three things about how it does that are deliberate.
 *
 * **It reads the collector's own report, never a glob.** A glob written here
 * would be a second guess at the same question, and the two libraries disagree:
 * `tinyglobby` descends a symlinked directory and node-`glob` does not. A probe
 * of our own would happily report that every addon file is present while the
 * collector had measured none of them. That is not hypothetical — it is the bug
 * this whole line of work started from.
 *
 * **It is a script, not a vitest test.** A test cannot read a report that does
 * not exist during an ordinary non-coverage run; and core's suite is executed by
 * four addon repositories' CI against core's `develop` tip, so a new test here
 * ships into four other pipelines unannounced.
 *
 * **A missing report is a failure.** With `reportOnFailure: true` set beside the
 * thresholds, a red suite still writes one, so absence now means something went
 * wrong with coverage itself rather than with a test.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(FRONTEND, "..");
const SUMMARY = join(FRONTEND, "coverage", "coverage-summary.json");

/**
 * Files with nothing to instrument, which istanbul therefore does not list.
 *
 * Declared by name rather than derived, because "whatever the report happened
 * to contain" cannot notice a tenth file dropping out for some other reason.
 * Each of these is a barrel re-export or a type-only module: between them they
 * hold seven statements, all of which disappear at compile time.
 *
 * Worth knowing why this list exists at all: the v8 provider *did* list these
 * nine, and gave the never-imported ones `branches 1/1 = 100%` — a branch it
 * invented, counted as covered. The plan's first requirement for the frontend
 * was that never-imported files reach the denominator, and v8 appeared to
 * satisfy it while inflating the result. istanbul counts their real statements,
 * which for these nine is nearly none, and omits them.
 *
 * If a file here grows real code, this check fails and the entry should be
 * removed rather than the failure suppressed.
 */
const NO_INSTRUMENTABLE_CODE = [
  "src/addons/media_import/watch/index.ts",
  "src/components/FileDetailContent.tsx",
  "src/components/loft/types.ts",
  "src/components/player/MediaControls/index.ts",
  "src/components/player/MediaControls/types.ts",
  "src/components/player/NativeSettingsRows/index.ts",
  "src/components/quick-note/index.ts",
  "src/types/index.ts",
  "src/types/smartFolder.ts",
];

/** Addons whose frontends must be in the denominator, from `addons/`. */
function installedAddons() {
  const dir = join(REPO_ROOT, "addons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((name) => existsSync(join(dir, name, "frontend")))
    .sort();
}

/**
 * Production sources under a directory, by the same predicates the config uses.
 *
 * `lstat` is never followed into a symlinked directory here because there are
 * none to follow: `setup-addons.sh` builds `src/addons/<name>` as a real
 * directory of per-file links precisely so that a walk like this one reaches
 * every file.
 */
function productionSources(root, prefix) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (entry.isDirectory()) {
        if (name === "__tests__") continue;
        walk(full, relPath);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(name)) continue;
      if (/\.d\.ts$/.test(name)) continue;
      out.push(`${prefix}${relPath}`);
    }
  };
  walk(root, "");
  return out;
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
    "absence means coverage did not run, or ran with a different config,",
    "not that a test failed. This is never a pass.",
  ]);
}

const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));
const measured = new Set(
  Object.keys(summary)
    .filter((k) => k !== "total")
    .map((k) => resolve(k).replace(`${FRONTEND}/`, "")),
);

// The declared population: core's sources plus every installed addon's,
// enumerated from `addons/` (the real trees), minus the files that compile to
// nothing. Building it from `src/addons/` instead would derive the expectation
// from the same place the collector read, and an addon that was never linked
// would go missing from both sides at once.
const addons = installedAddons();
const declared = new Set([
  ...productionSources(join(FRONTEND, "src"), "src/").filter(
    (p) =>
      !p.startsWith("src/addons/") &&
      !p.startsWith("src/messages/") &&
      !p.startsWith("src/test/"),
  ),
  ...addons.flatMap((name) =>
    productionSources(
      join(REPO_ROOT, "addons", name, "frontend"),
      `src/addons/${name}/`,
    ),
  ),
]);
for (const p of NO_INSTRUMENTABLE_CODE) declared.delete(p);

const missing = [...declared].filter((p) => !measured.has(p)).sort();
const unexpected = [...measured].filter((p) => !declared.has(p)).sort();

if (missing.length || unexpected.length) {
  const lines = [];
  if (missing.length) {
    lines.push(`${missing.length} file(s) declared but not measured:`);
    for (const p of missing) lines.push(`  - ${p}`);
    lines.push(
      "If one of these is an addon file, `./setup-addons.sh` may not have run.",
      "If it compiles to nothing, add it to NO_INSTRUMENTABLE_CODE with a reason.",
    );
  }
  if (unexpected.length) {
    lines.push(`${unexpected.length} file(s) measured but not declared:`);
    for (const p of unexpected) lines.push(`  - ${p}`);
    lines.push(
      "A file in NO_INSTRUMENTABLE_CODE has grown real code, or the config's",
      "include/exclude no longer matches this script's predicates.",
    );
  }
  fail(lines);
}

console.log(
  `coverage denominator: ${measured.size} files ` +
    `(core + ${addons.length} addon${addons.length === 1 ? "" : "s"}: ${addons.join(", ") || "none"}), ` +
    `${NO_INSTRUMENTABLE_CODE.length} declared absent`,
);
