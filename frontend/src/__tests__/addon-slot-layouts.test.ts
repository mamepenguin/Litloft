import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/sourceScan";

/**
 * A union member that falls through to the default branch still
 * type-checks, so `tsc` cannot catch it; the union and the branches are
 * compared here instead.
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
