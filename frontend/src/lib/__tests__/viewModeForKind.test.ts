import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "@/__tests__/helpers/sourceScan";
import { viewModeForKind } from "@/lib/viewModeForKind";
import type { FolderKind, ViewMode } from "@/types";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * The table, written out rather than derived — and typed so the type
 * system carries the totality in here too.
 *
 * A hand-written array with a length assertion would have been a claim
 * about a constant this file owns: adding a ninth `FolderKind` and a
 * ninth row to `VIEW_MODE_FOR_KIND` (which tsc does force) would leave
 * every assertion below green. Written as a mapped type, the test file
 * stops compiling until the new kind is decided here as well.
 */
const TABLE: { [K in FolderKind]: ViewMode } = {
  video: "grid",
  image: "grid",
  pdf: "grid",
  document: "grid",
  markdown: "list",
  audio: "list",
  archive: "list",
  other: "list",
};

const ROWS = Object.entries(TABLE) as [FolderKind, ViewMode][];

describe("viewModeForKind", () => {
  it.each(ROWS)("opens a %s listing as a %s", (kind, expected) => {
    expect(viewModeForKind(kind)).toBe(expected);
  });

  it("covers every kind there is", () => {
    // The mapped type above is what forces this; the count is here so
    // the number is stated somewhere a reader can check against
    // `types/index.ts` and the backend classifier it mirrors —
    // `FileKind` less `subtitle`, which no surface offers a word for.
    expect(ROWS).toHaveLength(8);
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

/**
 * Every file that maps a kind to a view mode.
 *
 * Walked, not listed: the case this block exists for is a *third* copy,
 * and a scan of the two files that used to hold copies cannot see one.
 *
 * Matched on the two shapes a mapping can take rather than on the name
 * `autoDetectMode`, because the next copy will not be called that — a
 * table entry (`audio: "grid"`, `"audio": "grid"`) or a switch arm
 * (`case "audio": … return "grid"`). Both are what a re-introduced local
 * rule looks like; neither matches a type declaration, a snapshot
 * serialiser, or a toolbar that happens to mention both words.
 */
const KIND_NAMES =
  "markdown|video|image|pdf|audio|document|archive|other";
const ENTRY = new RegExp(
  `(?:^|[\\s{,])"?(?:${KIND_NAMES})"?\\s*:\\s*"(?:grid|list)"`,
  "m",
);
const SWITCH_ARM = new RegExp(
  `case\\s+"(?:${KIND_NAMES})"\\s*:[\\s\\S]{0,120}?return\\s+"(?:grid|list)"`,
);

function kindToModeMappers(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || entry.name === "addons") continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const body = stripComments(readFileSync(full, "utf-8"));
      if (ENTRY.test(body) || SWITCH_ARM.test(body)) {
        out.push(relative(REPO_ROOT, full));
      }
    }
  };
  walk(resolve(REPO_ROOT, "frontend/src"));
  return out;
}

describe("the rule is written once", () => {
  const hooks = [
    "frontend/src/hooks/useFolderViewMode.ts",
    "frontend/src/hooks/useCollectionViewMode.ts",
  ];

  it("is imported by both hooks, from the one module", () => {
    for (const rel of hooks) {
      const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
      expect(body).toMatch(
        /import \{ viewModeForKind \} from "@\/lib\/viewModeForKind";/,
      );
    }
  });

  it("is the only file in the tree that maps a kind to a mode", () => {
    const mappers = kindToModeMappers();
    // The population is non-empty and contains the module itself, so
    // "nothing else maps kinds" cannot pass by finding nothing at all.
    expect(mappers).toContain("frontend/src/lib/viewModeForKind.ts");
    expect(mappers).toEqual(["frontend/src/lib/viewModeForKind.ts"]);
  });
});
