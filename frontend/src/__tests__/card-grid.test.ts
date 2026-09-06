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
 * pattern. A scan keyed on `grid-cols-1 sm:grid-cols-2 …` reads only the
 * grids that spell their columns that way, and a bare `grid-cols-2` —
 * `RightPaneFolder`'s folder row, directly above a `FileGrid` — sits
 * outside it while breaking the same rule. (`RightPaneFolder` has no
 * production caller: only `RightPaneFile` is mounted. It is in the
 * population because it is a card grid in this tree, not because a
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
 * builds a card cell itself around a thumbnail.
 *
 * **This reads one file's own tokens.** A grid that delegates its cell to
 * a component defined elsewhere is invisible here — `ArchiveEntryGrid`
 * lays out `ArchiveEntryCard`, which takes its `<img src>` as a prop, and
 * no token in the grid's file says "thumbnail". Following the component
 * graph instead was tried and is worse: keying on "renders an `<img>`
 * from a thumbnail" pulls in `PropertiesPanel`, `FilePreview` and the
 * collection panes, and still misses `ArchiveEntryCard`. So the reach is
 * stated rather than overclaimed, and the one grid it misses is named
 * below with why it is out of scope anyway.
 */
function rendersCards(body: string): boolean {
  return (
    /<FileCard\b/.test(body) ||
    /<FolderCard\b/.test(body) ||
    /getThumbnailUrl\(/.test(body) ||
    // A grid that takes its cards as `children` carries none of those
    // tokens — `SectionRow` is the drive home's shelf and its cells are
    // built by its two callers. Calling the measuring hook is what it
    // does have, and a file that calls it *is* laying out a card grid.
    //
    // This does not make the sweep circular. The clause only adds files;
    // a card grid that counts its own columns still has no
    // `useCardColumns` call and is caught by the three token tests
    // above, which is the case this whole file exists to fail on.
    /useCardColumns\(\)/.test(body)
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
        "frontend/src/components/SectionRow.tsx",
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
    // Eight grid elements over seven components: `DriveHome` renders its
    // skeleton and its loaded folder row from one hook.
    expect(sites.length).toBe(8);
    expect(useCardColumnsCallSites().length).toBe(7);

    // Counting the hook calls is not enough: a component can call it and
    // never attach the ref, in which case the element is laid out by the
    // unmeasured fallback and the floor silently does not apply.
    const unattached = sites
      .filter((s) => !/\bref=\{/.test(s.tag))
      .map((s) => `${s.file}:${s.line}`);
    expect(unattached).toEqual([]);
  });

  it("uses the column gap the helper counts with", () => {
    // `columnsFor` divides by `CARD_MIN_PX + CARD_GAP_PX`. A grid whose
    // real column gap is wider under-fills — a 1060px container returns 4
    // at gap-3 but only fits 4 at 16px if it is 1072px wide, so the cards
    // land under the 16rem the design declares. A narrower gap loses a
    // column it had room for. And a folder row and the file grid below it
    // only line up if their tracks start at the same x, which needs the
    // same gap, not just the same count.
    const wrongGap = sites
      .filter((s) => {
        const gaps = [...s.className.matchAll(/\bgap(?:-x)?-(\d+)\b/g)].map(
          (m) => Number(m[1]) * 4,
        );
        return gaps.length === 0 || gaps.some((g) => g !== CARD_GAP_PX);
      })
      .map((s) => `${s.file}:${s.line} — ${s.className}`);
    expect(wrongGap).toEqual([]);
  });

  it("writes its grid className where the scan can read it", () => {
    // `gridClassNames` reads `className="…"` and a plain template
    // literal. A card grid whose classes are assembled in an expression
    // would contribute zero sites, drop out of the population, and leave
    // the exact-set assertion above still passing — a silent hole rather
    // than a failure. So the shape itself is pinned.
    //
    // Matched on a literal that carries grid classes: `grid-cols-…`, or
    // `grid` followed by more classes. A bare `"grid"` is not enough to
    // flag — it is also the name of a view mode in this tree
    // (`RightPaneFolder`'s `innerMode === "grid"`), and a guard that
    // fires on that would be removed rather than obeyed. The residual
    // gap is `cn("grid", "gap-3")` exactly; nothing in core writes that.
    const dynamic: string[] = [];
    for (const file of sourceFiles()) {
      const body = readFileSync(file, "utf-8");
      if (!rendersCards(body)) continue;
      for (const m of body.matchAll(/className=\{(?!`)([^}]*)\}/g)) {
        if (/\bgrid-cols-/.test(m[1]) || /["'`]\s*grid\s+\S/.test(m[1])) {
          dynamic.push(
            `${relative(REPO_ROOT, file)}:${body.slice(0, m.index!).split("\n").length}`,
          );
        }
      }
    }
    expect(dynamic).toEqual([]);
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
    const row = design()
      .replace(/\s+/g, " ")
      .match(
        /\*\*Card grid minimum width: `16rem`\. Minimum column count: (\d+)\.\*\*/,
      );
    expect(row).not.toBeNull();
    expect(Number(row![1])).toBe(MIN_CARD_COLUMNS);
  });

  it("quotes the card widths the rule produces at phone sizes", () => {
    // 375px phone less its `px-4` gutters, and 400px likewise: the two
    // widths `00-basis.md` names. A reader acts on these numbers, so
    // they are checked against the formula rather than trusted.
    const body = design().replace(/\s+/g, " ");
    expect(body).toMatch(/≈165px at 375px/);
    expect(body).toMatch(/≈178px at 400px/);
    expect(Math.floor((343 - CARD_GAP_PX) / columnsFor(343))).toBe(165);
    expect(Math.floor((368 - CARD_GAP_PX) / columnsFor(368))).toBe(178);
  });

  it("forbids writing the auto-fill template into a card grid", () => {
    // Whitespace-insensitive: the prose is wrapped by hand, so a reflow
    // moves the line break and a regex that pinned it would go red for a
    // paragraph that still says the same thing.
    expect(design().replace(/\s+/g, " ")).toMatch(
      /Do not write `repeat\(auto-fill, [^`]*\)`/,
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
   * - `archive/ArchiveEntryGrid.tsx` — **is** a grid of thumbnail cards,
   *   and is excluded on scope, not on kind: P4V-7 rebuilds it to lay
   *   pages out by their real aspect ratio, and converting it here would
   *   be rewriting the same element twice. It clears the floor already
   *   (`grid-cols-2`, pinned below), but its `xl:grid-cols-6` still
   *   fires on window size — so inside a 1213px canvas beside the tree
   *   pane it draws six ~192px columns, which is the mis-count §8.5
   *   names. That is a known miss, not a fixed one.
   *
   * The check is that they stay out by staying non-card grids, not that
   * a list of exemptions is maintained.
   */
  it.each([
    "frontend/src/components/RelatedFilesSection.tsx",
    "frontend/src/app/page.tsx",
    "frontend/src/components/archive/ArchiveEntryGrid.tsx",
  ])("%s stays outside the scan's reach", (rel) => {
    // True of the tokens, and that is all this asserts. For the first
    // two it is also true of the screen; for the archive grid it is not,
    // which is why the reason above is about scope.
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
