import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import {
  CARD_GAP_PX,
  CARD_MIN_PX,
  MIN_CARD_COLUMNS,
  columnsFor,
  rowsFor,
} from "@/lib/cardGrid";

/**
 * A card grid never counts its own columns.
 *
 * `DESIGN.md` §8.5 requires the folder row and the file grid under it to
 * agree, and every card grid to hold a floor of two columns. Neither
 * property survives being restated per screen: a breakpoint count fires
 * on window size, which is 280px wider than the canvas beside the tree
 * pane, and `auto-fill` cannot express a floor at all. So the rule lives
 * in `lib/cardGrid.ts` and this file asserts nothing has re-implemented
 * it locally.
 *
 * **The population is built from what renders cards**, not from a naming
 * pattern. `grid-cols-1 sm:grid-cols-2 …` was the shape the spec listed,
 * and scanning for it alone would have missed `RightPaneFolder`, whose
 * folder row was a bare `grid-cols-2` sitting directly above a `FileGrid`
 * that counted its columns differently. (`RightPaneFolder` currently has
 * no production caller — only `RightPaneFile` is mounted — so it is in
 * the population because it is a card grid in this tree, not because a
 * viewer can reach it.)
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const CORE_SRC = resolve(REPO_ROOT, "frontend/src");
const ADDON_LINK_DIR = resolve(CORE_SRC, "addons");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    // Addons are symlinked in here; their grids are their own repos'.
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || entry.name === "test") continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  walk(CORE_SRC);
  return out;
}

/**
 * A file lays out cards if it renders a `FileCard` / `FolderCard`, or
 * builds a card cell itself around a thumbnail. That covers the six
 * screens with a card grid and nothing else: the components that call
 * `getThumbnailUrl` without a grid (`FileListRow`, the collection panes,
 * the players' media-session artwork) have no grid className to find.
 */
function rendersCards(body: string): boolean {
  return (
    /<FileCard\b/.test(body) ||
    /<FolderCard\b/.test(body) ||
    /getThumbnailUrl\(/.test(body)
  );
}

/**
 * The whole opening tag around the offset `at`.
 *
 * Read by scanning rather than by one regex: a `>` inside an arrow
 * function attribute is not the end of the tag, and `[^>]*` would cut a
 * sibling element short and hide what it carries.
 */
function openingTagAround(body: string, at: number): string {
  const start = body.lastIndexOf("<", at);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return body.slice(start, i + 1);
  }
  return body.slice(start);
}

/** Every `className="…"` in `body` that declares a grid layout. */
function gridClassNames(body: string): { value: string; at: number }[] {
  const found: { value: string; at: number }[] = [];
  for (const m of body.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const value = m[1] ?? m[2] ?? "";
    if (/(?:^|[\s`])grid(?:$|[\s`])/.test(value) || /\bgrid-cols-/.test(value)) {
      found.push({ value, at: m.index! });
    }
  }
  return found;
}

interface Site {
  file: string;
  line: number;
  className: string;
  tag: string;
}

function cardGridSites(): Site[] {
  const out: Site[] = [];
  for (const file of sourceFiles()) {
    const body = readFileSync(file, "utf-8");
    if (!rendersCards(body)) continue;
    const rel = relative(REPO_ROOT, file);
    for (const { value, at } of gridClassNames(body)) {
      out.push({
        file: rel,
        line: body.slice(0, at).split("\n").length,
        className: value,
        tag: openingTagAround(body, at),
      });
    }
  }
  return out;
}

function useCardColumnsCallSites(): string[] {
  const out: string[] = [];
  for (const file of sourceFiles()) {
    const body = readFileSync(file, "utf-8");
    const rel = relative(REPO_ROOT, file);
    // The call, not the declaration in `lib/cardGrid.ts` itself.
    for (const _ of body.matchAll(/=\s*useCardColumns\(\)/g)) out.push(rel);
  }
  return out;
}

describe("columnsFor", () => {
  // Written out rather than derived from the formula: a test that
  // recomputes the implementation asserts only that it is deterministic.
  // Widths are containers, not viewports — 343 is a 375px phone less its
  // `px-4` gutters, 1213 the canvas beside an open 280px tree pane.
  it.each([
    [343, 2],
    [368, 2],
    [600, 2],
    [1213, 4],
    [1480, 5],
  ])("gives %ipx container %i columns", (width, expected) => {
    expect(columnsFor(width)).toBe(expected);
  });

  it("never drops below the floor, however narrow the container", () => {
    for (const width of [1, 100, 255, 256, 267]) {
      expect(columnsFor(width)).toBe(MIN_CARD_COLUMNS);
    }
  });

  it("adds a column exactly when another card plus its gap fits", () => {
    const threeColumns = CARD_MIN_PX * 3 + CARD_GAP_PX * 2;
    expect(columnsFor(threeColumns)).toBe(3);
    expect(columnsFor(threeColumns - 1)).toBe(2);
  });
});

describe("rowsFor", () => {
  // A shelf at the floor shows half-width cards, so it takes a second
  // row to show as many files; past the floor one row already holds four.
  it.each([
    [2, 2],
    [3, 1],
    [4, 1],
    [5, 1],
  ])("gives %i columns %i row(s)", (columns, expected) => {
    expect(rowsFor(columns)).toBe(expected);
  });
});

describe("every card grid goes through lib/cardGrid", () => {
  const sites = cardGridSites();

  it("finds the card grids it is meant to be checking", () => {
    // "None of them counts columns" is also true of an empty set, so the
    // population has to be asserted before the property is.
    expect(sites.length).toBeGreaterThan(0);
    expect(new Set(sites.map((s) => s.file))).toEqual(
      new Set([
        "frontend/src/components/FileGrid.tsx",
        "frontend/src/components/DriveHome.tsx",
        "frontend/src/components/folder/FolderContent.tsx",
        "frontend/src/components/folder/RightPaneFolder.tsx",
        "frontend/src/components/missing/MissingFileGrid.tsx",
        "frontend/src/components/trash/TrashFileGrid.tsx",
      ]),
    );
  });

  it("declares no column count of its own", () => {
    const offenders = sites
      .filter((s) => /\bgrid-cols-/.test(s.className))
      .map((s) => `${s.file}:${s.line} — ${s.className}`);
    expect(offenders).toEqual([]);
  });

  it("hands every grid element the measuring ref", () => {
    // Seven grid elements over six components: `DriveHome` renders its
    // skeleton and its loaded folder row from one hook.
    expect(sites.length).toBe(7);
    expect(useCardColumnsCallSites().length).toBe(6);

    // Counting the hook calls is not enough: a component can call it and
    // never attach the ref, in which case the element is laid out by the
    // unmeasured fallback and the floor silently does not apply.
    const unattached = sites
      .filter((s) => !/\bref=\{/.test(s.tag))
      .map((s) => `${s.file}:${s.line}`);
    expect(unattached).toEqual([]);
  });

  it("takes its template from the helper, not from a literal", () => {
    const handwritten = sites
      .filter((s) => !/cardGridTemplate\(/.test(s.tag))
      .map((s) => `${s.file}:${s.line}`);
    expect(handwritten).toEqual([]);
  });
});

describe("DESIGN.md §8.5 states the rule the code implements", () => {
  const design = () => readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");

  it("names the minimum column count, and it is the one in the code", () => {
    const row = design().match(
      /\*\*Card grid minimum width: `16rem`\. Minimum column count: (\d+)\.\*\*/,
    );
    expect(row).not.toBeNull();
    expect(Number(row![1])).toBe(MIN_CARD_COLUMNS);
  });

  it("quotes the card widths the rule produces at phone sizes", () => {
    // 375px phone less its `px-4` gutters, and 400px likewise: the two
    // widths `00-basis.md` names. A reader acts on these numbers, so
    // they are checked against the formula rather than trusted.
    const body = design();
    expect(body).toMatch(/≈165px at 375px/);
    expect(body).toMatch(/≈178px at\s+400px/);
    expect(Math.floor((343 - CARD_GAP_PX) / columnsFor(343))).toBe(165);
    expect(Math.floor((368 - CARD_GAP_PX) / columnsFor(368))).toBe(178);
  });

  it("forbids writing the auto-fill template into a card grid", () => {
    expect(design()).toMatch(
      /Do not write\n`repeat\(auto-fill, minmax\(min\(16rem, 100%\), 1fr\)\)`/,
    );
  });
});

describe("grids that are not card grids", () => {
  /**
   * Deliberately outside the population above, each for a reason that is
   * about the grid rather than about the effort of converting it:
   *
   * - `RelatedFilesSection.tsx` — a two-column list of link rows, not
   *   cards. It renders no thumbnail and its cells are not interchangeable
   *   with a file card.
   * - `app/page.tsx` — the drive picker. Its cells are icon-and-text rows,
   *   and the page is a Server Component that fetches the backend directly
   *   (`.claude/rules/frontend-conventions.md`), so it can run no
   *   observer. Two columns of text rows at 375px is not the layout the
   *   floor exists to produce.
   * - `archive/ArchiveEntryGrid.tsx` — archive page cells, which already
   *   start at two columns and are due to be laid out by real aspect
   *   ratio.
   *
   * The check is that they stay out by staying non-card grids, not that
   * a list of exemptions is maintained.
   */
  it.each([
    "frontend/src/components/RelatedFilesSection.tsx",
    "frontend/src/app/page.tsx",
    "frontend/src/components/archive/ArchiveEntryGrid.tsx",
  ])("%s renders no file or folder card", (rel) => {
    const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
    expect(rendersCards(body)).toBe(false);
  });

  it("keeps at least two columns where it does use a breakpoint count", () => {
    // The archive grid is excluded from the sweep, but the floor is a
    // property of the app, not of the helper — it must not regress into
    // a single column while it waits its turn.
    const body = readFileSync(
      resolve(REPO_ROOT, "frontend/src/components/archive/ArchiveEntryGrid.tsx"),
      "utf-8",
    );
    expect(/\bgrid-cols-1\b/.test(body)).toBe(false);
    expect(/\bgrid-cols-2\b/.test(body)).toBe(true);
  });
});
