import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { classAttributeSpans, stripComments } from "./helpers/sourceScan";

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

/**
 * `stripComments` first: a comment that writes an element's own tag would
 * otherwise satisfy the scan.
 *
 * The walker does not know it is looking at JSX, so a quote that never
 * closes (an apostrophe in JSX text) opens a string span that leaves the
 * comments after it unblanked.
 */
function headingsIn(jsx: string): number {
  return [...stripComments(jsx).matchAll(HEADING)].length;
}

/**
 * The JSX subtree of the element whose opening tag contains `at`.
 *
 * The property is per-element, not per-file: a page may hold both a card
 * and its own `<h1>`, and a file-level heading count cannot tell the two
 * apart.
 *
 * Matching counts element opens against closes; it would not survive a
 * `<` inside an expression.
 */
function elementAt(body: string, at: number): string | null {
  const start = body.lastIndexOf("<", at);
  if (start === -1) return null;
  const tag = /^<([A-Za-z][\w.]*)/.exec(body.slice(start));
  if (!tag) return null;
  const name = tag[1];

  /**
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
 * treatment `DESIGN.md` §Cards calls a card.
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
  // elements out of the population without failing.
  for (const [from, to] of classAttributeSpans(stripped)) {
    if (!/\bshadow-card\b/.test(stripped.slice(from, to))) continue;
    const subtree = elementAt(stripped, from);
    // A tile the matcher could not delimit is a hole, not a pass.
    expect(subtree, `unparsed card tile at offset ${from}`).not.toBeNull();
    out.push(subtree!);
  }
  // Every `shadow-card` in the file is one tile. Without this a class form
  // the scan cannot reach shrinks the population silently.
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
    // By name, so a refactor that renames or splits them cannot quietly
    // drop them from the population.
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
    expect(offenders).toEqual([]);
  });
});

describe("list mode holds the same line", () => {
  /** List rows are not card tiles, so the tile scan cannot see them. */
  it.each([
    "frontend/src/components/FileListRow.tsx",
    "frontend/src/components/FolderListRow.tsx",
  ])("%s emits no heading either", (rel) => {
    expect(headingsIn(readFileSync(resolve(REPO_ROOT, rel), "utf-8"))).toBe(0);
  });
});

describe("section headings are untouched", () => {
  const SECTION_HEADING_SOURCES: [string, number][] = [
    ["frontend/src/components/CarouselSection.tsx", 1],
    ["frontend/src/components/ContinueWatchingSection.tsx", 1],
  ];

  it.each(SECTION_HEADING_SOURCES)("%s still marks its name up as a heading", (rel, expected) => {
    expect(headingsIn(readFileSync(resolve(REPO_ROOT, rel), "utf-8"))).toBe(expected);
  });

  /**
   * `headingsIn` is only as good as `stripComments`, and that walker
   * treats an unclosed quote in JSX text as the start of a string — so a
   * `<span>Here's …</span>` above a heading leaves every comment after
   * it intact and the count is then satisfied by prose.
   */
  it("leaves no comment behind in the files whose headings are counted", () => {
    const scanned = [
      ...SECTION_HEADING_SOURCES.map(([rel]) => rel),
      "frontend/src/components/FileListRow.tsx",
      "frontend/src/components/FolderListRow.tsx",
      "frontend/src/components/DriveHome.tsx",
    ];
    const leftovers = scanned.filter((rel) =>
      stripComments(readFileSync(resolve(REPO_ROOT, rel), "utf-8")).includes("{/*"),
    );
    expect(leftovers).toEqual([]);
  });

  it("keeps the drive home itself free of card tiles", () => {
    const body = readFileSync(
      resolve(REPO_ROOT, "frontend/src/components/DriveHome.tsx"),
      "utf-8",
    );
    expect(cardTiles(body)).toEqual([]);
  });
});
