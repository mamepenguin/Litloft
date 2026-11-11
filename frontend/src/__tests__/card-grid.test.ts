import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import {
  BOOK_CARD_GAP_PX,
  BOOK_GRID,
  CARD_GAP_PX,
  CARD_MIN_PX,
  MIN_CARD_COLUMNS,
  VIDEO_GRID,
  cardGridTemplate,
  columnsFor,
  rowsFor,
} from "@/lib/cardGrid";

/**
 * A card grid never counts its own columns: a breakpoint count fires on
 * window size rather than on the canvas beside the tree pane, and
 * `auto-fill` cannot express a floor at all.
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
 * This reads one file's own tokens: a grid that delegates its cell to a
 * component defined elsewhere is invisible here.
 */
function rendersCards(body: string): boolean {
  return (
    /<FileCard\b/.test(body) ||
    /<FolderCard\b/.test(body) ||
    /getThumbnailUrl\(/.test(body) ||
    // A grid that takes its cards as `children` carries none of those tokens.
    // A children-taking grid that hand-writes its columns without calling the
    // hook stays outside the population entirely.
    /useCardColumns\(/.test(body)
  );
}

/**
 * Read by scanning rather than by one regex: a `>` inside an arrow
 * function attribute is not the end of the tag.
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
    for (const _ of body.matchAll(/=\s*useCardColumns\(/g)) out.push(rel);
  }
  return out;
}

describe("columnsFor", () => {
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

  it("gives the book grid 6 columns at 976px and 2 at 358px", () => {
    expect(columnsFor(976, BOOK_GRID)).toBe(6);
    expect(columnsFor(358, BOOK_GRID)).toBe(2);
  });

  it("leaves Home's grid on its own minimum and gap", () => {
    expect(columnsFor(1213)).toBe(4);
    expect(columnsFor(1480)).toBe(5);
  });
});

describe("SPEC-CORE-080 I2 the video grid's metric", () => {
  it("is a 20rem (320px) card minimum with a 16px gap", () => {
    expect(VIDEO_GRID).toMatchObject({ minWidthPx: 320, minWidth: "20rem", gapPx: 16 });
  });

  it("gives max(2, floor((W + 16) / 336)) columns for a grid W px wide", () => {
    const widths = [1, 343, 655, 671, 672, 791, 792, 991, 992, 1059, 1060, 1120, 1327, 1328, 1663, 1664];
    expect(widths.map((w) => [w, columnsFor(w, VIDEO_GRID)])).toEqual(
      widths.map((w) => [w, Math.max(2, Math.floor((w + 16) / 336))]),
    );
  });

  it("draws the unmeasured first frame on the video metric, not Home's", () => {
    expect(cardGridTemplate(0, VIDEO_GRID)).toBe(
      "repeat(auto-fill, minmax(min(20rem, calc(50% - 8px)), 1fr))",
    );
  });
});

describe("rowsFor", () => {
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
    expect(sites.length).toBe(9);
    expect(new Set(sites.map((s) => s.file))).toEqual(
      new Set([
        "frontend/src/components/appshell/ShelfBlock.tsx",
        "frontend/src/components/appshell/VideoGrid.tsx",
        "frontend/src/components/FileGrid.tsx",
        "frontend/src/components/SectionRow.tsx",
        "frontend/src/components/folder/FolderContent.tsx",
        "frontend/src/components/folder/RightPaneFolder.tsx",
        "frontend/src/components/missing/MissingFileGrid.tsx",
        "frontend/src/components/readingapp/ReadingGrid.tsx",
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
    expect(sites.length).toBe(9);
    expect(useCardColumnsCallSites().length).toBe(9);

    const unattached = sites
      .filter((s) => !/\bref=\{/.test(s.tag))
      .map((s) => `${s.file}:${s.line}`);
    expect(unattached).toEqual([]);
  });

  it("SPEC-CORE-080 uses the column gap its own metric counts with, and the video grid's 32px rows", () => {
    const expected: Record<string, { column: number; row?: number }> = {
      "frontend/src/components/appshell/VideoGrid.tsx": { column: 16, row: 32 },
      "frontend/src/components/appshell/ShelfBlock.tsx": { column: BOOK_CARD_GAP_PX },
      "frontend/src/components/readingapp/ReadingGrid.tsx": { column: BOOK_CARD_GAP_PX },
    };
    const wrongGap = sites
      .filter((s) => {
        const want = expected[s.file] ?? { column: CARD_GAP_PX };
        const tokens = [...s.className.matchAll(/\bgap(?:-([xy]))?-(\d+)\b/g)].map((m) => ({
          axis: m[1],
          px: Number(m[2]) * 4,
        }));
        const column = tokens.filter((t) => t.axis !== "y").map((t) => t.px);
        const row = tokens.filter((t) => t.axis !== "x").map((t) => t.px);
        return (
          column.length === 0 ||
          column.some((g) => g !== want.column) ||
          (want.row !== undefined && (row.length === 0 || row.some((g) => g !== want.row)))
        );
      })
      .map((s) => `${s.file}:${s.line} — ${s.className}`);
    expect(wrongGap).toEqual([]);
  });

  it("writes its grid className where the scan can read it", () => {
    // A bare `"grid"` is not flagged: it is also the name of a view mode in
    // this tree.
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

describe("grids that are not card grids", () => {
  it.each([
    "frontend/src/components/FileDetail/related/RelatedPanel.tsx",
    "frontend/src/components/FileDetail/related/RelatedFileRow.tsx",
    "frontend/src/app/page.tsx",
    "frontend/src/components/archive/ArchiveEntryGrid.tsx",
  ])("%s stays outside the scan's reach", (rel) => {
    const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
    expect(rendersCards(body)).toBe(false);
  });
});
