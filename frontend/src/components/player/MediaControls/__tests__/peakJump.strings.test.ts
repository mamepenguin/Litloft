// SPEC-CORE-151 I8: the control's three strings in ja and en.
import { describe, it, expect } from "vitest";
import ja from "@/messages-core/ja.json";
import en from "@/messages-core/en.json";

type Tree = { [key: string]: string | Tree };

function lookup(tree: Tree, path: string): unknown {
  let current: unknown = tree;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

describe("SPEC-CORE-151 strings (I8)", () => {
  it.each([
    ["ja", "player.jumpToMostWatched", "よく観た所へ"],
    ["en", "player.jumpToMostWatched", "Jump to most watched"],
    ["ja", "player.mostWatchedPosition", "よく観た所 {index} / {count}"],
    ["en", "player.mostWatchedPosition", "Most watched {index} / {count}"],
    ["ja", "shortcuts.jumpToMostWatched", "よく観た所へ移動"],
    ["en", "shortcuts.jumpToMostWatched", "Jump to most watched"],
  ])("SPEC-CORE-151 %s %s is %s", (locale, key, expected) => {
    const tree = (locale === "ja" ? ja : en) as unknown as Tree;
    expect(lookup(tree, key)).toBe(expected);
  });
});
