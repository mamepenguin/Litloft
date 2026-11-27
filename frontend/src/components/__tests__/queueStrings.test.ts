/**
 * SPEC-CORE-190 / SPEC-CORE-193 §9: the queue pane's new strings, in en and ja.
 * The key names are the spec's; the namespace is not fixed, so any one may hold them.
 */
import { describe, expect, it } from "vitest";

import en from "@/messages-core/en.json";
import ja from "@/messages-core/ja.json";

type Tree = { [key: string]: string | Tree };

function valuesOf(tree: Tree, key: string): string[] {
  const found: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === "string") {
      if (k === key) found.push(v);
    } else {
      found.push(...valuesOf(v, key));
    }
  }
  return found;
}

describe("SPEC-CORE-190 §9 the queue strings", () => {
  it.each([
    ["queueLabel", "Queue", "キュー"],
    ["queueShow", "Show the queue", "キューを表示"],
    ["queueHide", "Hide the queue", "キューを隠す"],
    ["queueEnd", "Close the queue and show the folder tree", "キューを閉じてフォルダツリーに戻す"],
    ["queueOverlayClose", "Close the queue", "キューを閉じる"],
  ])("%s reads %s / %s", (key, enText, jaText) => {
    expect(valuesOf(en as unknown as Tree, key)).toContain(enText);
    expect(valuesOf(ja as unknown as Tree, key)).toContain(jaText);
  });
});
