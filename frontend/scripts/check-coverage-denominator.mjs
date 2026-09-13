#!/usr/bin/env node
/**
 * The coverage thresholds are lower bounds: shrink the denominator and the
 * percentage goes up, so the population is checked against a declared one.
 *
 * It reads the collector's own report, never a glob: `tinyglobby` descends a
 * symlinked directory and node-`glob` does not.
 *
 * It is a script, not a vitest test: core's suite is executed by the addon
 * repositories' CI, so a new test here ships into their pipelines unannounced.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(FRONTEND, "..");
const SUMMARY = join(FRONTEND, "coverage", "coverage-summary.json");

/**
 * Files with nothing to instrument, which istanbul therefore does not list.
 * Declared by name rather than derived, because "whatever the report happened
 * to contain" cannot notice a file dropping out for some other reason.
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
 * Declared, never discovered: reading `addons/` or `.gitmodules` at run time
 * makes the expectation an observation of the same tree the collector
 * measures, so an addon that was not there would leave both sides at once.
 */
const ADDONS = ["cloud-sync", "intelligence", "knowledge", "media_import"];

/**
 * The walk below and the collector both read the working tree, so emptying a
 * directory takes it out of `declared` and `measured` in the same step. The
 * index does not move when files are deleted.
 *
 * Only one direction is enforced: a file in the walk that git does not know
 * about is what a new component looks like before it is committed.
 */
function trackedSources(repoDir, pathspec, prefix) {
  const out = execFileSync("git", ["-C", repoDir, "ls-files", "-z", pathspec], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\0")
    .filter(Boolean)
    .map((p) => p.slice(pathspec.length + 1))
    .filter(
      (p) =>
        /\.tsx?$/.test(p) &&
        !/\.d\.ts$/.test(p) &&
        !/\.(test|spec)\.tsx?$/.test(p) &&
        !/(^|\/)__tests__\//.test(p),
    )
    .map((p) => `${prefix}${p}`);
}

function productionSources(root, prefix) {
  const out = [];
  // A missing root is not an error here: the comparison against the index
  // below is what reports it, by name.
  if (!existsSync(root)) return out;
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
  (name) => !existsSync(join(REPO_ROOT, "addons", name, ".git")),
);
if (unlinkedAddons.length) {
  fail([
    `${unlinkedAddons.length} declared addon(s) are not checked out:`,
    ...unlinkedAddons.map((n) => `  - addons/${n}`),
    "These are git submodules, and this check reads their index to learn what",
    "they should contain. A checkout without them cannot measure this",
    "population at all, so it is reported rather than measured around:",
    "  git submodule update --init --recursive",
    "If an addon was removed on purpose, remove its name from ADDONS in the",
    "same commit — that edit is what makes the denominator change visible.",
  ]);
}

// Enumerated from `addons/`, not `src/addons/`: the latter is the same place
// the collector read, and an addon that was never linked would go missing from
// both sides at once.
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
// `Set.delete` reports whether the entry was there, and that answer is the
// check.
const staleAbsences = NO_INSTRUMENTABLE_CODE.filter((p) => !declared.delete(p));

const tracked = new Set([
  ...trackedSources(REPO_ROOT, "frontend/src", "src/").filter(
    (p) =>
      !p.startsWith("src/addons/") &&
      !p.startsWith("src/messages/") &&
      !p.startsWith("src/test/"),
  ),
  ...ADDONS.flatMap((name) =>
    trackedSources(join(REPO_ROOT, "addons", name), "frontend", `src/addons/${name}/`),
  ),
]);
// Git still knowing about the file means it was deleted from the working tree
// and should come back; git not knowing about it means the entry outlived its
// file and should go.
const stillTracked = new Set(
  NO_INSTRUMENTABLE_CODE.filter((p) => tracked.delete(p)),
);

const untracked = [...tracked].filter((p) => !declared.has(p)).sort();

// A deleted directory takes any declared-absent file inside it down with it, so
// both fire together — and "delete the entry" is the wrong instruction for that
// case, where the entry is right and the files should come back.
if (untracked.length || staleAbsences.length) {
  const lines = [];
  if (untracked.length) {
    lines.push(
      `${untracked.length} tracked file(s) are missing from the working tree:`,
      ...untracked.map((p) => `  - ${p}`),
      "git has them at the pinned commit and the walk did not find them, so this",
      "tree is not the one the denominator is a claim about. A deleted or",
      "emptied directory reads as a smaller population on both sides at once,",
      "which is why this compares against the index and not against the report.",
    );
  }
  // Split by whether git still has the file, not by whether some *other* file
  // is also missing.
  const recoverable = staleAbsences.filter((p) => stillTracked.has(p));
  const orphaned = staleAbsences.filter((p) => !stillTracked.has(p));
  if (recoverable.length) {
    lines.push(
      `${recoverable.length} declared-absent file(s) are gone from the working tree but still tracked:`,
      ...recoverable.map((p) => `  - ${p}`),
      "The entries are right and the files are not there. Restore them; do not",
      "remove the declarations.",
    );
  }
  if (orphaned.length) {
    lines.push(
      `${orphaned.length} entr(y/ies) in NO_INSTRUMENTABLE_CODE name no such file:`,
      ...orphaned.map((p) => `  - ${p}`),
      "git does not have these either, so the entry has outlived the file it",
      "excluded. A name with no file behind it excludes nothing and hides the",
      "next entry that stops being true. Delete it.",
    );
  }
  fail(lines);
}

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
    `(${tracked.size} tracked) ` +
    `(core + ${ADDONS.length} declared addon${ADDONS.length === 1 ? "" : "s"}: ${ADDONS.join(", ")}), ` +
    `${NO_INSTRUMENTABLE_CODE.length} declared absent`,
);
