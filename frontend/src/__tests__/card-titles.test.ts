import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
 * A card's title is not a heading.
 *
 * The drive root's outline used to read as six section names with thirty
 * file and folder names spliced between them at the same depth, because
 * every card put its title in an `<h3>` (D-5). A heading level is a claim
 * about document structure, and thirty siblings in a grid are not thirty
 * sections; the name survives as the accessible name of the card's link,
 * which is what a screen reader navigates a listing by.
 *
 * **The population is every card component in the tree**, core and addon
 * alike — an addon that ships a card of its own is drawing into the same
 * outline. It is built from the file's own tokens rather than from its
 * name: `*Card.tsx` would be a naming pattern, and this repo has both
 * cards that are not named `Card` and files named `Card` that are not
 * cards.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

const SOURCE_ROOTS = [
  "frontend/src",
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `addons/${e.name}/frontend`)
    : []),
];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || entry.name === "test") continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) {
    const abs = resolve(REPO_ROOT, root);
    if (existsSync(abs)) walk(abs);
  }
  return out;
}

const HEADING = /<h[1-6][\s/>]/g;

function headingsIn(jsx: string): number {
  return [...jsx.matchAll(HEADING)].length;
}

/**
 * The JSX subtree of the element whose opening tag contains `at`.
 *
 * The property is per-element, not per-file: a page may hold both a card
 * and its own `<h1>`, and a file-level heading count cannot tell the two
 * apart — it would demand a page drop the heading that names the page.
 * So the card tile is cut out and only its inside is read.
 *
 * Matching is on element tags, counting opens against closes and treating
 * a self-closing tag as neither. Good enough because this reads eight
 * files of ordinary JSX; it would not survive a `<` inside an expression,
 * and `cardTiles` asserts the extent it found is plausible so a
 * mis-parse fails loudly instead of silently returning an empty subtree.
 */
function elementAt(body: string, at: number): string {
  const start = body.lastIndexOf("<", at);
  if (start === -1) return "";
  const tag = /^<([A-Za-z][\w.]*)/.exec(body.slice(start));
  if (!tag) return "";
  const name = tag[1];
  let i = start;
  let depth = 0;
  while (i < body.length) {
    const open = body.indexOf(`<${name}`, i);
    const close = body.indexOf(`</${name}`, i);
    if (close === -1) return body.slice(start);
    if (open !== -1 && open < close) {
      // A self-closing open contributes no close to wait for.
      const gt = body.indexOf(">", open);
      if (gt !== -1 && body[gt - 1] === "/") {
        i = gt + 1;
        continue;
      }
      depth += 1;
      i = open + name.length + 1;
      continue;
    }
    depth -= 1;
    if (depth === 0) return body.slice(start, body.indexOf(">", close) + 1);
    i = close + name.length + 2;
  }
  return body.slice(start);
}

/**
 * The card tiles in a file: every element carrying the raised, rounded
 * treatment `DESIGN.md` §7 calls a card.
 *
 * Keyed on the treatment, not on the filename — `*Card.tsx` is a naming
 * pattern, and this tree holds both cards not named `Card` and files
 * named `Card` that are not cards.
 */
function cardTiles(body: string): string[] {
  const stripped = stripComments(body);
  const out: string[] = [];
  for (const m of stripped.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const value = m[1] ?? m[2] ?? "";
    if (!/\bshadow-card\b/.test(value)) continue;
    const subtree = elementAt(stripped, m.index!);
    // A tile that came back shorter than its own class list means the
    // matcher lost the element; better to fail than to report zero.
    expect(subtree.length).toBeGreaterThan(value.length);
    out.push(subtree);
  }
  return out;
}

describe("no card titles itself with a heading", () => {
  const files = sourceFiles().map((f) => ({
    rel: relative(REPO_ROOT, f),
    body: readFileSync(f, "utf-8"),
  }));

  /**
   * Outside the sweep, on scope rather than on kind: the drive picker's
   * cell carries the same `<h3>` inside the same tile, and it is 案 9's
   * screen in the peripherals bundle. Converting it here would be
   * rewriting an element two bundles are working on. It is pinned below
   * so the known instance cannot grow.
   */
  const DEFERRED = "frontend/src/app/page.tsx";

  const tiles = files
    .filter((f) => f.rel !== DEFERRED)
    .flatMap((f) => cardTiles(f.body).map((tile) => ({ rel: f.rel, tile })));

  it("finds the card tiles it is meant to be checking", () => {
    // "None of them holds a heading" is also true of an empty set, and
    // this walk crosses four addon repos whose checkouts can be absent.
    expect(tiles.length).toBeGreaterThan(0);
    // The two the finding is about, by name, so a refactor that renames
    // or splits them cannot quietly drop them from the population.
    for (const named of [
      "frontend/src/components/FileCard.tsx",
      "frontend/src/components/FolderCard.tsx",
    ]) {
      expect(tiles.map((t) => t.rel)).toContain(named);
    }
  });

  it("holds no heading tag inside any of them", () => {
    const offenders = tiles
      .map((t) => ({ rel: t.rel, n: headingsIn(t.tile) }))
      .filter((t) => t.n > 0)
      .map((t) => `${t.rel} — ${t.n}`);
    // Not a floor: one heading in one card is the whole defect.
    expect(offenders).toEqual([]);
  });

  it("keeps the name reachable, as the card's own text", () => {
    // Dropping the tag must not drop the name. Both cards still render
    // the title inside the element that carries the link.
    for (const rel of [
      "frontend/src/components/FileCard.tsx",
      "frontend/src/components/FolderCard.tsx",
    ]) {
      const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
      expect(body).toMatch(/\{(?:file\.title|folder\.name)\}/);
    }
  });

  it("holds the deferred one where it is", () => {
    // Not an exemption that can quietly widen: the drive picker's tile
    // carries exactly one heading today, and this says so.
    const body = readFileSync(resolve(REPO_ROOT, DEFERRED), "utf-8");
    const inTiles = cardTiles(body).reduce((n, t) => n + headingsIn(t), 0);
    expect(inTiles).toBe(1);
  });
});

describe("section headings are untouched", () => {
  it("still marks up the drive home's section names", () => {
    // The other half of D-5: an outline of six section names is the
    // point, so this sweep must not have been satisfied by removing
    // those too. `section-headings.test.ts` owns their styling; this
    // asserts only that they are still headings, and that none of them
    // sits inside a card.
    const body = readFileSync(
      resolve(REPO_ROOT, "frontend/src/components/DriveHome.tsx"),
      "utf-8",
    );
    expect(headingsIn(body)).toBeGreaterThan(0);
    expect(cardTiles(body)).toEqual([]);
  });
});
