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

/**
 * Addons whose frontends must be in the denominator.
 *
 * Declared, never discovered. Reading `addons/` at run time made the
 * expectation an observation of the same tree the collector was measuring, so
 * an addon that was not there left both sides at once — detector rule 5, in the
 * file written to hold a denominator. Measured, with `readdirSync`:
 *
 *     addons/cloud-sync removed  ->  511 files / 3 addons   exit 0
 *     all of addons/ removed     ->  403 files / 0 addons   exit 0
 *
 * 112 files leaving the population was a pass. The names are therefore written
 * out: adding or removing an addon is then an edit to this line, which a
 * reviewer sees, rather than a number that moves on its own.
 *
 * `.gitmodules` is not read instead, for the same reason: a parse that returns
 * nothing is silent, and a file one edit away from the tree is not independent
 * of it.
 *
 * A checkout without submodules is a real state — `git clone` without
 * `--recursive` leaves these directories empty — and it is named below rather
 * than accepted. CI checks out `submodules: recursive`, so four is the
 * invariant there.
 */
const ADDONS = ["cloud-sync", "intelligence", "knowledge", "media_import"];

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

const unlinkedAddons = ADDONS.filter(
  (name) => !existsSync(join(REPO_ROOT, "addons", name, "frontend")),
);
if (unlinkedAddons.length) {
  fail([
    `${unlinkedAddons.length} declared addon(s) have no frontend/ tree:`,
    ...unlinkedAddons.map((n) => `  - addons/${n}`),
    "These are git submodules. A checkout without them cannot measure this",
    "population at all, so it is reported rather than measured around:",
    "  git submodule update --init --recursive",
    "If an addon was removed on purpose, remove its name from ADDONS in the",
    "same commit — that edit is what makes the denominator change visible.",
  ]);
}

// The declared population: core's sources plus the four declared addons',
// enumerated from `addons/` (the real trees), minus the files that compile to
// nothing. Building it from `src/addons/` instead would derive the expectation
// from the same place the collector read, and an addon that was never linked
// would go missing from both sides at once. The names above are what stops
// `addons/` itself being that same observation one level up.
const declared = new Set([
  ...productionSources(join(FRONTEND, "src"), "src/").filter(
    (p) =>
      !p.startsWith("src/addons/") &&
      !p.startsWith("src/messages/") &&
      !p.startsWith("src/test/"),
  ),
  ...ADDONS.flatMap((name) =>
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
    `(core + ${ADDONS.length} declared addon${ADDONS.length === 1 ? "" : "s"}: ${ADDONS.join(", ")}), ` +
    `${NO_INSTRUMENTABLE_CODE.length} declared absent`,
);
