import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { classAttributeSpans, stripComments } from "./helpers/sourceScan";

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
function elementAt(body: string, at: number): string | null {
  const start = body.lastIndexOf("<", at);
  if (start === -1) return null;
  const tag = /^<([A-Za-z][\w.]*)/.exec(body.slice(start));
  if (!tag) return null;
  const name = tag[1];

  /**
   * The `>` that ends the opening tag at `from`, and whether it closed
   * the element outright.
   *
   * Not `indexOf(">")`: the first `>` after a tag name is very often
   * inside an attribute — `onClick={() => …}` is the common case — and
   * taking it misreads a plain element as self-closing, which drops its
   * `</name>` from the count and truncates the subtree silently. Braces
   * and quotes are tracked so the tag's own `>` is the one found.
   */
  const endOfTag = (from: number): { at: number; selfClosing: boolean } | null => {
    let depth = 0;
    let quote: string | null = null;
    for (let i = from; i < body.length; i += 1) {
      const ch = body[i];
      if (quote) {
        if (ch === "\\") i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) {
        return { at: i, selfClosing: body[i - 1] === "/" };
      }
    }
    return null;
  };

  // A tag-name boundary, so a `<Link>` does not count `<LinkButton` as a
  // nested open — depth would never return to zero and the subtree would
  // run to the end of the file, dragging unrelated headings in.
  const opens = new RegExp(`<${name}(?=[\\s/>])`, "g");
  const closes = new RegExp(`</${name}\\s*>`, "g");

  let i = start;
  let depth = 0;
  while (i < body.length) {
    opens.lastIndex = i;
    closes.lastIndex = i;
    const open = opens.exec(body);
    const close = closes.exec(body);
    if (!close) return null;
    if (open && open.index < close.index) {
      const end = endOfTag(open.index);
      if (!end) return null;
      if (!end.selfClosing) depth += 1;
      i = end.at + 1;
      continue;
    }
    depth -= 1;
    if (depth === 0) return body.slice(start, close.index + close[0].length);
    i = close.index + close[0].length;
  }
  return null;
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
  // `classAttributeSpans`, not a regex for `className="…"`: this tree
  // writes class lists as ternaries, `cn(…)` calls and constants too,
  // and a scan that reads only the two literal forms drops those
  // elements out of the population without failing. `MiniPlayerContainer`
  // is one — its `shadow-card` sits inside a ternary.
  for (const [from, to] of classAttributeSpans(stripped)) {
    if (!/\bshadow-card\b/.test(stripped.slice(from, to))) continue;
    const subtree = elementAt(stripped, from);
    // A tile the matcher could not delimit is a hole, not a pass.
    expect(subtree, `unparsed card tile at offset ${from}`).not.toBeNull();
    out.push(subtree!);
  }
  // And the count itself: every `shadow-card` in the file is one tile.
  // Without this a class form the scan cannot reach shrinks the
  // population silently, which is the failure this whole file is for.
  const mentions = [...stripped.matchAll(/\bshadow-card\b/g)].length;
  expect(out.length).toBe(mentions);
  return out;
}

describe("no card titles itself with a heading", () => {
  const files = sourceFiles().map((f) => ({
    rel: relative(REPO_ROOT, f),
    body: readFileSync(f, "utf-8"),
  }));

  const tiles = files.flatMap((f) =>
    cardTiles(f.body).map((tile) => ({ rel: f.rel, tile })),
  );

  it("finds the card tiles it is meant to be checking", () => {
    // "None of them holds a heading" is also true of an empty set, and
    // this walk crosses four addon repos whose checkouts can be absent.
    expect(tiles.length).toBeGreaterThan(0);
    // The three the finding is about, by name, so a refactor that renames
    // or splits them cannot quietly drop them from the population. The
    // drive picker was deferred here until 案 9 rebuilt its header; it is
    // in the sweep now, which is what removing an exemption has to mean.
    for (const named of [
      "frontend/src/components/FileCard.tsx",
      "frontend/src/components/FolderCard.tsx",
      "frontend/src/app/page.tsx",
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
});

describe("list mode holds the same line", () => {
  /**
   * List rows are not card tiles, so the sweep above cannot see them —
   * and list mode is one click from grid mode in the same folder, with
   * the same thirty names in it. Asserted directly rather than left to
   * the tile scan, which is keyed on a treatment a row does not carry.
   */
  it.each([
    "frontend/src/components/FileListRow.tsx",
    "frontend/src/components/FolderListRow.tsx",
  ])("%s emits no heading either", (rel) => {
    expect(headingsIn(readFileSync(resolve(REPO_ROOT, rel), "utf-8"))).toBe(0);
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
