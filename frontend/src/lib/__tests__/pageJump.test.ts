import { describe, expect, it } from "vitest";

import { FIXED_JUMPS, JUMP_LIMIT, matchJumps, visibleFixedJumps } from "../pageJump";

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
