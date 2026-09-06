import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/sourceScan";

const SRC = join(process.cwd(), "src");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "messages") continue;
        walk(path);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(path);
      }
    }
  };
  walk(SRC);
  expect(out.length).toBeGreaterThan(100);
  return out;
}

const rel = (f: string) => f.slice(SRC.length + 1);
const code = (f: string) => stripComments(readFileSync(f, "utf8"));

/**
 * One implementation of how a page turns.
 *
 * The two full-screen viewers each had their own copy of the same seven
 * derivations. They agreed, which is the dangerous state rather than a
 * safe one: spread mode rewrites all seven, and a change made in one
 * place with the other left alone passes every test either viewer has.
 */
describe("spread paging", () => {
  it("decides what is on screen at once in exactly one place", () => {
    // `faceAtIndex` answers "what does this position draw?" — one page,
    // two, or half of one. A second implementation would be the
    // duplication this module exists to end, in the place it matters
    // most.
    const owners = sourceFiles().filter((f) =>
      /export function faceAtIndex/.test(code(f)),
    );
    expect(owners.map(rel)).toEqual(["lib/spreadPaging.ts"]);
  });

  it("keeps the width rule out of the viewers", () => {
    // Whether two pages fit is one question with one answer. A viewer
    // holding its own copy would disagree with the paging on a resize.
    const owners = sourceFiles().filter(
      (f) =>
        rel(f) !== "hooks/useSpreadFits.ts" &&
        /innerWidth\s*>=\s*window\.innerHeight/.test(code(f)),
    );
    expect(owners).toEqual([]);
  });

  it("decides which half is first in exactly one place", () => {
    // `readingDirection === "ltr" ? !showRightHalf : showRightHalf` — the
    // expression both viewers repeated, twice each.
    const owners = sourceFiles().filter((f) =>
      /readingDirection === "ltr"\s*\?\s*!\s*[\w.]*showRightHalf/.test(code(f)),
    );
    expect(owners.map(rel)).toEqual(["lib/spreadPaging.ts"]);
  });

  it("lets exactly one file decide where a turn lands", () => {
    // `pageForward` / `pageBack` are the only functions that return a
    // position. A viewer that imported them would be free to apply the
    // result its own way, which is the duplication coming back in a
    // politer form.
    const importers = sourceFiles().filter(
      (f) =>
        rel(f) !== "lib/spreadPaging.ts" &&
        /\bpage(Forward|Back)\b/.test(code(f)),
    );
    expect(importers.map(rel)).toEqual(["hooks/useSpreadPaging.ts"]);
  });

  it("keeps the ungated half inside the module that gates it", () => {
    // `isOnFirstHalf` is the primitive every other export wraps in an
    // `isSpreadActive` check. `pageBack`'s docstring argues for
    // consulting `splitMode` *because* no consumer reads the half
    // ungated — so a caller holding the raw value would not just be
    // untidy, it would make that argument false, and would say "second
    // half" of a page that is not split at all.
    const owners = sourceFiles().filter(
      (f) =>
        rel(f) !== "lib/spreadPaging.ts" && /\bisOnFirstHalf\b/.test(code(f)),
    );
    expect(owners.map(rel)).toEqual([]);
  });

  it("is reached by both viewers", () => {
    // The other half of the claim: one implementation is only an
    // improvement if it is the one that runs.
    const callers = sourceFiles()
      .filter(
        (f) =>
          rel(f) !== "hooks/useSpreadPaging.ts" &&
          /useSpreadPaging\s*\(/.test(code(f)),
      )
      .map(rel)
      .sort();
    expect(callers).toEqual([
      "components/ImageGallery.tsx",
      "components/archive/useImageViewer.ts",
    ]);
  });
});
