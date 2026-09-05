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
 * begins — and because a total is adopted only from a trusted subject, the
 * count then never appears again, for any value of that axis, until some other
 * axis moves.
 *
 * (That consequence read "stays on screen for good" until now, which was the
 * failure mode before the guard moved to the write side. The guard changed and
 * the prose did not.)
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
 * Blank every quoted string, keeping length so nothing else shifts.
 *
 * A walk rather than a regex: a quote inside a template literal is not the
 * start of a string, and this file's whole subject is scans whose premise is
 * a spelling.
 */
function withoutStrings(text: string): string {
  const out = text.split("");
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      out[i] = " ";
      i++;
      while (i < text.length) {
        if (text[i] === "\\") { out[i] = " "; out[i + 1] = " "; i += 2; continue; }
        const end = text[i] === c;
        out[i] = " ";
        i++;
        if (end) break;
      }
    } else {
      i++;
    }
  }
  return out.join("");
}

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
  // To the end of the *statement*, not to `].join(`.
  //
  // Stopping at the join left everything after it unscanned, so an axis added
  // as `].join(sep) + (selectable ? sep + "sel" : "")` was invisible while
  // every assertion here still passed. That is an ordinary way to add one — a
  // suffix on the existing key rather than a row in the array — and it is the
  // fourth time in this phase that a scan's premise turned out to be its own
  // spelling.
  const end = source.indexOf(";", source.indexOf("].join(", start));
  expect(end).toBeGreaterThan(start);
  const body = source.slice(start + "const countedSubject = [".length, end);
  // Neither string contents nor property names are axes. Extending the slice
  // to the end of the statement brought both into range — `.join` and the
  // `\u0000` inside the separator — and each would have been reported as an
  // axis the listing does not reset on.
  const values = withoutStrings(body).replace(/\.\s*[A-Za-z_$][\w$]*/g, "");
  const seen = new Set<string>();
  for (const [name] of values.matchAll(/[A-Za-z_$][\w$]*/g)) {
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
