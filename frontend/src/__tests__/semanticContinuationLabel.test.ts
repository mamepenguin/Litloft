import { describe, expect, it } from "vitest";

import en from "@/messages-core/en.json";
import ja from "@/messages-core/ja.json";

function values(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (Array.isArray(tree)) return tree.flatMap(values);
  if (tree && typeof tree === "object") {
    return Object.values(tree as Record<string, unknown>).flatMap(values);
  }
  return [];
}

describe("SPEC-CORE-035 section 9 the continuation button's label", () => {
  it.each([
    ["en", en, "Show more by similarity"],
    ["ja", ja, "似ている順にさらに表示"],
  ] as const)("is drawn from core's own %s catalogue", (_locale, catalogue, label) => {
    expect(values(catalogue)).toContain(label);
  });
});
