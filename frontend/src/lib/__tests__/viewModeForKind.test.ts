import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "@/__tests__/helpers/sourceScan";
import { viewModeForKind } from "@/lib/viewModeForKind";
import type { FolderKind, ViewMode } from "@/types";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * A mapped type rather than an array, so a new `FolderKind` stops this file
 * compiling until it is decided here as well.
 */
const TABLE: { [K in FolderKind]: ViewMode } = {
  video: "grid",
  image: "grid",
  pdf: "grid",
  document: "grid",
  text: "list",
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
    expect(ROWS).toHaveLength(8);
  });

  it("has no answer for a mixed listing", () => {
    expect(viewModeForKind(null)).toBeNull();
  });

  it("puts every kind whose card draws no picture in a list", () => {
    // `text` can draw a `TextThumbnail` and still opens as a list,
    // because a notebook is read by its titles.
    const noPicture: FolderKind[] = ["audio", "archive", "other"];
    for (const kind of noPicture) {
      expect(viewModeForKind(kind)).toBe("list");
    }
    expect(viewModeForKind("text")).toBe("list");
  });
});

/**
 * Matched on the two shapes a mapping can take — a table entry or a switch
 * arm — rather than on a function name, which the next copy will not share.
 */
const KIND_NAMES =
  "text|video|image|pdf|audio|document|archive|other";
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
    expect(mappers).toContain("frontend/src/lib/viewModeForKind.ts");
    expect(mappers).toEqual(["frontend/src/lib/viewModeForKind.ts"]);
  });
});
