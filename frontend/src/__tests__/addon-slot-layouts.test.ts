import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/sourceScan";

/**
 * Every layout `AddonSlot` offers must reach code of its own.
 *
 * This is a source scan, and it can only see that a branch *exists* —
 * one whose body duplicates the default satisfies it. What each layout
 * actually draws is asserted by rendering, in
 * `components/__tests__/AddonSlot.test.tsx` ("what a layout draws"). The
 * two together are the claim; either alone is half of it.
 *
 * `layout` carried a third value, `"menu"`, for the whole of its life
 * before Phase 3: it type-checked, it was documented by its own presence
 * in the union, and it fell through to the `stack` branch. A caller who
 * asked for a menu got a stack and nothing said so. `tsc` cannot catch
 * that — the value is a member of the union either way — so the union
 * and the branches are compared here instead.
 *
 * Comments are stripped first, with the shared scanner rather than a
 * regex. The union's own doc comment names `"menu"` on purpose (it
 * records why the value is gone), and a parser that read comments would
 * take that mention for a declaration — while a regex from `/*` to the
 * next `*` + `/` blanks real code whenever a string literal holds the
 * opener, which `helpers/sourceScan` was written after being bitten by.
 */
const SOURCE = join(__dirname, "..", "components", "AddonSlot.tsx");

function literals(fragment: string): string[] {
  return [...fragment.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("AddonSlot layouts", () => {
  const code = stripComments(readFileSync(SOURCE, "utf8"));

  const unionMatch = code.match(/layout\?:\s*([^;]+);/);
  const declared = new Set(literals(unionMatch?.[1] ?? ""));

  const defaultMatch = code.match(/layout\s*=\s*"([^"]+)"/);
  const fallback = defaultMatch?.[1];

  const branched = new Set(
    [...code.matchAll(/layout\s*===\s*"([^"]+)"/g)].map((m) => m[1]),
  );

  it("declares the layouts it is known to have", () => {
    // Not `>=`, and not "the ones I looked at": the whole union, so a
    // fourth value cannot arrive without this line being edited.
    expect([...declared].sort()).toEqual(["stack", "tabs"]);
  });

  it("falls back to a layout it declares", () => {
    expect(fallback).toBe("stack");
    expect(declared.has(fallback!)).toBe(true);
  });

  it("gives every declared layout but the fallback its own branch", () => {
    const needsBranch = [...declared].filter((l) => l !== fallback).sort();
    expect([...branched].sort()).toEqual(needsBranch);
  });

  it("branches on nothing it does not declare", () => {
    for (const l of branched) expect(declared.has(l)).toBe(true);
  });
});
