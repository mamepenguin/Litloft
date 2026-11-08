import { describe, expect, it } from "vitest";

import {
  baseShelfKey,
  chipsFromShelves,
  folderInside,
  narrowFolders,
  normalizeFolder,
} from "../folders";
import type { Shelf } from "@/lib/api";

function shelf(key: string, label = key, count = 1): Shelf {
  return { key, label, count, items: [] };
}

describe("a chip narrows the target's folders", () => {
  it("is the only folder when the target has none", () => {
    expect(narrowFolders([], "Books/Novels")).toEqual(["Books/Novels"]);
  });

  it("keeps a target folder that lies inside the chip", () => {
    expect(narrowFolders(["Books/Novels/2024"], "Books")).toEqual(["Books/Novels/2024"]);
  });

  it("is replaced by the chip when the chip lies inside the target folder", () => {
    expect(narrowFolders(["Books"], "Books/Novels")).toEqual(["Books/Novels"]);
  });

  it("drops a target folder that has no path relation to the chip", () => {
    expect(narrowFolders(["Magazines"], "Books/Novels")).toEqual([]);
  });

  it("leaves nothing when the chip lies outside every target folder", () => {
    expect(narrowFolders(["Books"], "Music")).toEqual([]);
  });

  it("compares at a segment boundary, not a string prefix", () => {
    expect(folderInside("Books/Novels", "Books")).toBe(true);
    expect(folderInside("Books/Novelty", "Books/Novels")).toBe(false);
    expect(folderInside("books", "Books")).toBe(false);
  });

  it("normalises NFC and a trailing slash without folding case", () => {
    const decomposed = "Cafe\u0301";
    const composed = "Caf\u00e9";
    expect(normalizeFolder(`Books/${decomposed}/`)).toBe(`Books/${composed}`);
    expect(folderInside(`Books/${decomposed}`, `Books/${composed}`)).toBe(true);
    expect(folderInside("books", "Books")).toBe(false);
  });
});

describe("the folder classification's chips", () => {
  it("never draws the base shelf as a chip", () => {
    const chips = chipsFromShelves([shelf("Books/", "Books"), shelf("Books/Novels", "Novels")], "Books");

    expect(chips.map((chip) => chip.key)).toEqual(["Books/Novels"]);
  });

  it("treats the root base shelf as no chip", () => {
    const chips = chipsFromShelves([shelf("", ""), shelf("Books", "Books")], "");

    expect(chips.map((chip) => chip.key)).toEqual(["Books"]);
  });

  it("stops at 120 chips", () => {
    const shelves = Array.from({ length: 150 }, (_, i) => shelf(`Folder-${i}`));

    expect(chipsFromShelves(shelves, "")).toHaveLength(120);
  });

  it("names the base shelf key", () => {
    expect(baseShelfKey("")).toBe("");
    expect(baseShelfKey("Books/")).toBe("Books/");
  });
});
