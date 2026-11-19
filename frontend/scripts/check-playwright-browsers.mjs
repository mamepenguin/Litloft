#!/usr/bin/env node
// `playwright-core` is resolved through `@playwright/test` rather than read from
// a fixed `node_modules/` path, because pnpm keeps it out of the top level.
//
// Only the `ubuntu24.04-x64` override is applied: the CI image is Ubuntu 24.04
// on x64, and another platform's revision would point at a build it lacks.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = "ubuntu24.04-x64";

function installedBrowsersJson() {
  const fromFrontend = createRequire(join(FRONTEND, "package.json"));
  const test = fromFrontend.resolve("@playwright/test/package.json");
  const playwright = createRequire(test).resolve("playwright/package.json");
  const core = createRequire(playwright).resolve("playwright-core/package.json");
  return join(dirname(core), "browsers.json");
}

function parseArgs(argv) {
  let browsersJson = null;
  const names = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--browsers-json") {
      i += 1;
      browsersJson = argv[i] ?? "";
    } else {
      names.push(argv[i]);
    }
  }
  return { browsersJson, names };
}

const { browsersJson, names } = parseArgs(process.argv.slice(2));
const problems = [];
const verified = [];

let jsonPath = browsersJson;
if (jsonPath === null) {
  try {
    jsonPath = installedBrowsersJson();
  } catch (error) {
    problems.push(`cannot locate playwright-core's browsers.json: ${error.message}`);
  }
}

let entries = null;
if (jsonPath !== null) {
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (!Array.isArray(parsed.browsers)) throw new Error("no browsers array");
    entries = parsed.browsers;
  } catch (error) {
    problems.push(`cannot read browsers.json at ${jsonPath}: ${error.message}`);
  }
}

const store = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!store) problems.push("PLAYWRIGHT_BROWSERS_PATH is unset");
if (names.length === 0) problems.push("no browser name was given");

for (const name of entries ? names : []) {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) {
    problems.push(`${name} is not in browsers.json`);
    continue;
  }
  if (!store) continue;

  const revision = entry.revisionOverrides?.[PLATFORM] ?? entry.revision;
  const dir = `${name.replaceAll("-", "_")}-${revision}`;
  const full = join(store, dir);
  if (existsSync(full)) {
    verified.push(full);
  } else {
    problems.push(`missing ${full} (the store does not hold this build)`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
}

for (const dir of verified) console.log(`found ${dir}`);
