import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { viewModeForKind } from "@/lib/viewModeForKind";
import type { FolderKind } from "@/types";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * The table, written out rather than derived.
 *
 * Every `FolderKind`, so adding one and leaving it out of the table
 * fails here as well as in the compiler.
 */
const TABLE: ReadonlyArray<[FolderKind, "grid" | "list"]> = [
  ["video", "grid"],
  ["image", "grid"],
  ["pdf", "grid"],
  ["document", "grid"],
  ["markdown", "list"],
  ["audio", "list"],
  ["archive", "list"],
  ["other", "list"],
];

describe("viewModeForKind", () => {
  it.each(TABLE)("opens a %s listing as a %s", (kind, expected) => {
    expect(viewModeForKind(kind)).toBe(expected);
  });

  it("covers every kind there is", () => {
    // `FolderKind` is a type, so the count is the only thing a test can
    // compare against. Eight, matching `types/index.ts` and the backend
    // classifier it mirrors: `FileKind` less `subtitle`, which no
    // surface offers a word for.
    expect(TABLE).toHaveLength(8);
    expect(new Set(TABLE.map(([k]) => k)).size).toBe(8);
  });

  it("has no answer for a mixed listing", () => {
    // Outside the table on purpose: "no dominant kind" is not a kind,
    // and the caller falls through to the viewer's global default.
    expect(viewModeForKind(null)).toBeNull();
  });

  it("puts every kind whose card draws no picture in a list", () => {
    // The property the table is derived from, asserted separately from
    // the table itself: a grid of cards that cannot show a picture is a
    // wall of one repeated glyph (COL-1).
    //
    // `markdown` is the deliberate exception — it *can* draw a
    // `TextThumbnail` and still opens as a list, because a notebook is
    // read by its titles. Named here so the exception is a decision
    // rather than a gap.
    const noPicture: FolderKind[] = ["audio", "archive", "other"];
    for (const kind of noPicture) {
      expect(viewModeForKind(kind)).toBe("list");
    }
    expect(viewModeForKind("markdown")).toBe("list");
  });
});

describe("the rule is written once", () => {
  const hooks = [
    "frontend/src/hooks/useFolderViewMode.ts",
    "frontend/src/hooks/useCollectionViewMode.ts",
  ];

  it("leaves no copy of the old switch in either hook", () => {
    // The two hooks held the same `autoDetectMode` verbatim, and the
    // copies had already drifted from what either screen needed —
    // fixing one and not the other is the likeliest way this regresses.
    for (const rel of hooks) {
      const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
      expect(body).not.toMatch(/function autoDetectMode\b/);
      expect(body).toMatch(/viewModeForKind/);
    }
  });

  it("is imported by both, from the one module", () => {
    for (const rel of hooks) {
      const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
      expect(body).toMatch(
        /import \{ viewModeForKind \} from "@\/lib\/viewModeForKind";/,
      );
    }
  });

  it("is the only place a kind is mapped to a view mode", () => {
    // Not just "the two hooks agree": a third copy elsewhere would leave
    // both of them green. Scanned as a pair of tokens rather than by
    // name, since the next copy will not be called `autoDetectMode`.
    for (const rel of hooks) {
      const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
      expect(body).not.toMatch(/case "markdown":/);
      expect(body).not.toMatch(/case "audio":/);
    }
  });
});
