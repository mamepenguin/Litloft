/**
 * Compiles `src/app/globals.css` into the sheet the layout fixture links.
 *
 * The fixture is a static page with no app and no backend behind it, so
 * the one thing that makes it evidence about this repository is that the
 * cells obey *this* stylesheet — Tailwind's preflight included, since
 * `box-sizing`, `body { margin }` and `img { display: block }` all move
 * the numbers the spec measures. Compiling it is therefore part of the
 * test, not a build step that may be skipped: `playwright-layout.config.ts`
 * runs this as its `globalSetup`, so the local command and the CI job
 * cannot diverge: `pnpm test:e2e:layout` on a fresh clone builds the sheet
 * it is about to measure, every time.
 *
 * Tailwind walks out from the input file to `frontend/` and scans
 * everything under it that .gitignore does not exclude, so the fixture's
 * own HTML is a source too and any utility it uses is generated — checked
 * by adding a class nothing else in the tree carries and finding it in the
 * output.
 *
 * It does not need `frontend/src/addons` to exist: the `@source
 * "../addons"` in globals.css resolves to that gitignored symlink
 * directory, and Tailwind skips it silently when it is absent. That is why
 * the CI job checks out without submodules and never runs
 * `setup-addons.sh` — no addon writes a rule the justified grid reads.
 *
 * `@tailwindcss/cli` carries the same `^4` as `tailwindcss` and
 * `@tailwindcss/postcss` deliberately. The three publish in lockstep at
 * identical version numbers, so one range for all three is what makes
 * `pnpm update` move them together; an exact pin on this one would have
 * meant an update moving the other two and leaving the fixture's compiler
 * behind, after which the sheet measured here is emitted by a different
 * Tailwind from the one that builds the app — different preflight,
 * possibly different `@container` or `aspect-ratio` output — and the claim
 * above quietly stops being true.
 *
 * `assertSameCompiler` is the guard, and it is not redundant with the
 * ranges: nothing enforces that Tailwind keeps publishing the three
 * together, and a `resolutions`/`overrides` entry or a partial update can
 * separate them at any time. Nothing else in the repository would notice —
 * the `REQUIRED` needles below are all version-insensitive.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const INPUT_CSS = join(__dirname, "..", "src", "app", "globals.css");
export const FIXTURE_CSS = join(__dirname, "fixtures", "globals.built.css");

/**
 * Rules the fixture cannot be a test of if they are missing. An empty or
 * half-compiled sheet lays every cell out at `auto` and measures like a
 * page with no opinions at all, which is exactly the shape of green this
 * whole job exists to remove — so ask the output what it contains rather
 * than trusting that the compiler exited 0.
 */
const REQUIRED = [
  ".justified-grid-host",
  ".justified-grid-cell",
  ".justified-grid-tail",
  "--jg-row-h",
  "box-sizing",
  // `related-files.spec.ts` measures a column count, and a sheet missing
  // these lays every tile out at `auto` — one column at every width,
  // which is what three of its four cases assert. It would pass having
  // measured a page with no opinions.
  ".related-files-host",
  ".related-files-grid",
];

/**
 * The compiler that emits this sheet is the compiler that builds the app.
 *
 * Read from the installed packages rather than from package.json, because
 * the ranges there are what disagree — the resolved versions are what
 * decide whether the output is the app's.
 */
function assertSameCompiler() {
  const versionOf = (pkg: string): string =>
    JSON.parse(
      readFileSync(
        join(__dirname, "..", "node_modules", pkg, "package.json"),
        "utf8",
      ),
    ).version;

  const cli = versionOf("@tailwindcss/cli");
  const app = versionOf("tailwindcss");
  const postcss = versionOf("@tailwindcss/postcss");
  if (cli !== app || cli !== postcss) {
    throw new Error(
      `Tailwind version skew: @tailwindcss/cli ${cli} compiles this fixture, ` +
        `but the app is built by tailwindcss ${app} / @tailwindcss/postcss ` +
        `${postcss}. Move the pin in package.json so all three match, or the ` +
        `sheet measured here is not the sheet that ships.`,
    );
  }
}

export default function buildFixtureCss() {
  assertSameCompiler();
  execFileSync(
    join(__dirname, "..", "node_modules", ".bin", "tailwindcss"),
    ["--input", INPUT_CSS, "--output", FIXTURE_CSS],
    { stdio: "inherit" },
  );

  const built = readFileSync(FIXTURE_CSS, "utf8");
  const missing = REQUIRED.filter((needle) => !built.includes(needle));
  if (missing.length > 0) {
    throw new Error(
      `${FIXTURE_CSS} compiled without ${missing.join(", ")} — the fixture ` +
        `would measure a page with no stylesheet and pass.`,
    );
  }
}
