import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { stripComments } from "./helpers/sourceScan";

/**
 * The header's count-subject must be a subset of the listing's reset key.
 *
 * `FolderBrowser` decides whether a `total` may be trusted by watching for a
 * fetch to start — it cannot know which query a number came from, only the
 * data layer can. That proxy holds exactly as long as every axis the header
 * counts by also makes `useFolderFiles` reset. Add an axis to the header that
 * the listing does not reset on, and the header waits for a fetch that never
 * begins: the count for the previous value of that axis stays on screen for
 * good.
 *
 * Nothing said so. The relationship lived in two files that do not import each
 * other, and it is the sole support for a guard written against a real bug —
 * the kind of premise that is true until someone adds a field.
 *
 * The subset is deliberately proper. `sort` and `order` reset the listing but
 * are not counted by: they reorder the same set, so the count stays true and
 * hiding it would be a flicker with nothing behind it.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf-8");

/**
 * Every identifier `countedSubject` is built from.
 *
 * Every identifier, not every line matching a shape. The first version of this
 * matched `name,` and `name ?? "",` and nothing else, so an axis written
 * `selectable ? "1" : ""` — a perfectly ordinary way to add one — was invisible
 * to it and the subset check passed. That is the same defect this file exists
 * to prevent, one level down: a scan whose premise is a spelling.
 */
function countedAxes(): string[] {
  const source = stripComments(read("components/FolderBrowser.tsx"));
  const start = source.indexOf("const countedSubject = [");
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start + "const countedSubject = [".length, source.indexOf("].join(", start));
  const seen = new Set<string>();
  for (const [name] of body.matchAll(/[A-Za-z_$][\w$]*/g)) {
    // String contents are values, not axes; so are the few operators that can
    // appear between them.
    if (["true", "false", "null", "undefined"].includes(name)) continue;
    seen.add(name);
  }
  return [...seen];
}

/** The identifiers interpolated into the listing's reset key. */
function resetAxes(): string[] {
  const source = read("components/folder/useFolderFiles.ts");
  const start = source.indexOf("const key = `");
  expect(start).toBeGreaterThan(-1);
  const template = source.slice(start, source.indexOf("`;", start));
  return [...template.matchAll(/\$\{([A-Za-z][\w]*)/g)].map((m) => m[1]);
}

describe("the counted subject and the listing's reset key", () => {
  // Both extractions have to actually find something, or the subset check
  // below is satisfied by an empty set — the scan failing silently would look
  // exactly like the invariant holding.
  it("finds both sets", () => {
    expect(countedAxes()).toHaveLength(6);
    expect(resetAxes().length).toBeGreaterThanOrEqual(6);
  });

  it("counts by nothing the listing does not reset on", () => {
    const reset = new Set(resetAxes());
    expect(countedAxes().filter((axis) => !reset.has(axis))).toEqual([]);
  });

  // Named, so that dropping one from the header is a decision rather than a
  // diff nobody reads.
  it("counts by exactly these axes", () => {
    expect(countedAxes().sort()).toEqual(
      [
        "driveName",
        "folderPath",
        "view",
        "tagFilter",
        "typeFilter",
        "searchQuery",
      ].sort(),
    );
  });

  it("leaves sort and order to the listing alone", () => {
    const counted = new Set(countedAxes());
    expect(counted.has("sort")).toBe(false);
    expect(counted.has("order")).toBe(false);
    expect(resetAxes()).toContain("sort");
    expect(resetAxes()).toContain("order");
  });
});
