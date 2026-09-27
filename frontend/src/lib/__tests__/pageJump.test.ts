import { describe, expect, it } from "vitest";

import {
  FIXED_JUMPS,
  FOLDER_LIMIT,
  JUMP_LIMIT,
  indexFolders,
  matchFolders,
  matchJumps,
  visibleFixedJumps,
} from "../pageJump";

const dest = (key: string, ...names: string[]) => ({ key, names });

describe("matchJumps", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("offers nothing for an %s query", (_, query) => {
    expect(matchJumps([dest("a", "All Files")], query)).toEqual([]);
  });

  it.each([
    ["substring", "files", ["a"]],
    ["case", "ALL", ["a"]],
    ["full-width letters", "ＡＬＬ", ["a"]],
    ["surrounding spaces", "  trash ", ["t"]],
    ["an alias", "ゴミ", ["t"]],
    ["nothing", "zzz", []],
  ])("matches by %s", (_, query, keys) => {
    const candidates = [dest("a", "All Files"), dest("t", "Trash", "ゴミ箱")];
    expect(matchJumps(candidates, query).map((d) => d.key)).toEqual(keys);
  });

  it("puts prefix matches before substring matches, keeping input order within each", () => {
    const candidates = [
      dest("allFiles", "All Files"),
      dest("filesPin", "files"),
      dest("recent", "Recently Added"),
      dest("fileTwo", "file two"),
    ];
    expect(matchJumps(candidates, "fil").map((d) => d.key)).toEqual([
      "filesPin",
      "fileTwo",
      "allFiles",
    ]);
  });

  it(`offers at most ${JUMP_LIMIT}`, () => {
    const candidates = ["a1", "a2", "a3", "a4", "a5"].map((k) => dest(k, `a ${k}`));
    expect(matchJumps(candidates, "a").map((d) => d.key)).toEqual(["a1", "a2", "a3"]);
  });
});

describe("visibleFixedJumps", () => {
  const keys = (opts: { missingCount: number; isAdmin: boolean }) =>
    visibleFixedJumps(opts).map((j) => j.key);

  it("lists every fixed destination when there are missing files and the viewer is admin", () => {
    expect(keys({ missingCount: 2, isAdmin: true })).toEqual([
      "home",
      "library",
      "favorites",
      "liked",
      "recent",
      "recentAdded",
      "allFiles",
      "trash",
      "missing",
      "admin",
    ]);
  });

  it("drops Missing files when nothing is missing", () => {
    expect(keys({ missingCount: 0, isAdmin: true })).not.toContain("missing");
  });

  it("drops Admin for a viewer who is not admin", () => {
    expect(keys({ missingCount: 2, isAdmin: false })).not.toContain("admin");
  });
});

describe("FIXED_JUMPS hrefs", () => {
  it.each([
    ["home", "/drive/my%20drive?view=home"],
    ["library", "/drive/my%20drive"],
    ["favorites", "/drive/my%20drive?view=favorites"],
    ["liked", "/drive/my%20drive?view=liked"],
    ["recent", "/drive/my%20drive?view=recent"],
    ["recentAdded", "/drive/my%20drive?view=recent-added"],
    ["allFiles", "/drive/my%20drive?view=all"],
    ["trash", "/drive/my%20drive?view=trash"],
    ["missing", "/drive/my%20drive?view=missing"],
    ["admin", "/admin"],
  ])("%s", (key, href) => {
    const jump = FIXED_JUMPS.find((j) => j.key === key);
    expect(jump?.href("my drive")).toBe(href);
  });
});

describe("matchFolders", () => {
  const index = indexFolders(
    [
      "photos-b",
      "photos",
      "photos/2024",
      "trips",
      "trips/2024",
      "trips/2024-spring",
      "trips/kyoto/2024",
      "archive/old-photos",
      "archive/photos-a",
      "x-photos",
      "a/b/c/d/e/2024x",
      "2024",
    ].map((path) => ({ kind: "folder" as const, name: path.split("/").pop()!, path })),
  );
  const paths = (query: string, exclude: ReadonlySet<string> = new Set()) =>
    matchFolders(index, query, exclude).map((f) => f.path);

  it("offers nothing for an empty query", () => {
    expect(paths("  ")).toEqual([]);
  });

  it("matches the folder's own name, not a parent segment", () => {
    expect(paths("trips")).toEqual(["trips"]);
  });

  it("orders prefix before substring, then shallower, then by path", () => {
    expect(paths("photos")).toEqual([
      "photos",
      "photos-b",
      "archive/photos-a",
      "x-photos",
      "archive/old-photos",
    ]);
  });

  it(`offers at most ${FOLDER_LIMIT}, shallowest first`, () => {
    expect(paths("2024")).toEqual([
      "2024",
      "photos/2024",
      "trips/2024",
      "trips/2024-spring",
      "trips/kyoto/2024",
    ]);
  });

  it("drops excluded folders before the cap", () => {
    expect(paths("2024", new Set(["folder:2024", "folder:photos/2024"]))).toEqual([
      "trips/2024",
      "trips/2024-spring",
      "trips/kyoto/2024",
      "a/b/c/d/e/2024x",
    ]);
  });

  it("ignores case and width", () => {
    expect(paths("ＰＨＯＴＯＳ")[0]).toBe("photos");
  });

  it("keeps only folder nodes", () => {
    const withFile = indexFolders([
      { kind: "file", name: "2024.md", path: "2024.md" },
      { kind: "folder", name: "2024", path: "2024" },
    ]);
    expect(matchFolders(withFile, "2024", new Set()).map((f) => f.path)).toEqual(["2024"]);
  });
});
