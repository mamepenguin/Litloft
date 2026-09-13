/**
 * Compiles `src/app/globals.css` into the sheet the layout fixture links.
 *
 * Tailwind walks out from the input file to `frontend/` and scans
 * everything under it that .gitignore does not exclude, so the fixture's
 * own HTML is a source too. The `@source "../addons"` in globals.css is
 * skipped silently when that link tree is absent.
 *
 * `@tailwindcss/cli` carries the same range as `tailwindcss` and
 * `@tailwindcss/postcss` deliberately: an exact pin on this one would let
 * `pnpm update` move the other two and leave the fixture's compiler behind.
 * Nothing makes Tailwind keep publishing the three together, hence
 * `assertSameCompiler`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const INPUT_CSS = join(__dirname, "..", "src", "app", "globals.css");
export const FIXTURE_CSS = join(__dirname, "fixtures", "globals.built.css");

/**
 * Asks the output what it contains rather than trusting that the compiler
 * exited 0: an empty or half-compiled sheet lays every cell out at `auto`.
 *
 * A needle for a utility the tree writes in many places cannot report its
 * absence; it catches a sheet that did not compile, or compiled without a
 * whole layer.
 *
 * Two spelling traps, both of which add rules to the shipped sheet:
 *
 * - A selector written in prose is a source for its own utility — the
 *   leading `.` is a token boundary for the extractor.
 * - A CSS escape is a boundary too, so an escaped selector is a source for
 *   its unescaped head. Splitting the token across two literals emits
 *   nothing.
 *
 * `globals.css` takes this file itself out of the scan with `@source not`.
 */
export const REQUIRED = [
  ".justified-grid-host",
  ".justified-grid-cell",
  ".justified-grid-tail",
  "--jg-row-h",
  "box-sizing",
  ".related-files-host",
  ".related-files-grid",
  "@container related-files",
  "max-h-\\[70vh\\]",
  ".sticky",
  // Written with the brace, because the test is `includes` on the whole
  // sheet: `.mt-1` is satisfied by `.mt-14`, and `.left-0` by `.left-0\.5`.
  ".top-full {",
  ".bottom-full {",
  ".mt-1 {",
  ".mb-1 {",
  ".left-0 {",
  ".right-0 {",
  ".whitespace-nowrap {",
  ".sm\\:absolute {",
  ".sm\\:top-full {",
  ".sm\\:bottom-full {",
  ".sm\\:bottom-auto {",
  ".overflow-auto {",
  ".min-h-0 {",
  ".flex-1 {",
  ".top-0 {",
  ".bg-bg-card {",
  ".overflow-x-auto {",
  ".fixed {",
  ".inset-0 {",
  ".z-30 {",
  ".z-10 {",
  ".z-20 {",
  ".z-50 {",
  ".bottom-0 {",
  "[data-sheet-snap] .media-detail-player {",
  ".h-12 {",
  '[data-sheet-snap] .media-detail-player[data-framed="true"] {',
  "[data-sheet-snap] .media-detail-host {",
  ".p-4 {",
  "[data-sheet-snap] .media-detail-player > :first-child {",
  ".-mt-4 {",
  ".pointer-coarse\\:h-11 {",
  ".pointer-coarse\\:w-11 {",
  ".pointer-coarse\\:pr-0 {",
  ".pointer-coarse\\:-ml-3 {",
  ".pointer-coarse\\:gap-0 {",
  ".gap-3 {",
  ".p-2\\.5 {",
  ".pointer-coarse\\:min-h-11 {",
  ".pointer-coarse\\:before\\:-inset-1\\.5 {",
  ".py-1\\.5 {",
  ".py-2 {",
  ".py-2\\.5 {",
  ".h-8 {",
  ".w-8 {",
];
/**
 * The compiler that emits this sheet is the compiler that builds the app.
 *
 * Read from the installed packages rather than from package.json, because
 * the ranges there are what disagree — the resolved versions are what
 * decide whether the output is the app's.
 */
export function assertSameCompiler() {
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
