import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { stripComments } from "./helpers/sourceScan";

/**
 * `FolderBrowser` trusts a `total` by watching for a fetch to start, which
 * holds only while every axis the header counts by also makes `useFolderFiles`
 * reset; otherwise the count waits for a fetch that never begins.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf-8");


/**
 * A walk rather than a regex: a quote inside a template literal is not the
 * start of a string.
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

function countedAxes(): string[] {
  const source = stripComments(read("components/FolderBrowser.tsx"));
  const start = source.indexOf("const countedSubject = [");
  expect(start).toBeGreaterThan(-1);
  // To the end of the statement, not to `].join(`: an axis can be added as a
  // suffix after the join.
  const end = source.indexOf(";", source.indexOf("].join(", start));
  expect(end).toBeGreaterThan(start);
  const body = source.slice(start + "const countedSubject = [".length, end);
  const values = withoutStrings(body).replace(/\.\s*[A-Za-z_$][\w$]*/g, "");
  const seen = new Set<string>();
  for (const [name] of values.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (["true", "false", "null", "undefined"].includes(name)) continue;
    seen.add(name);
  }
  return [...seen];
}

function resetAxes(): string[] {
  const source = read("components/folder/useFolderFiles.ts");
  const start = source.indexOf("const key = `");
  expect(start).toBeGreaterThan(-1);
  const template = source.slice(start, source.indexOf("`;", start));
  return [...template.matchAll(/\$\{([A-Za-z][\w]*)/g)].map((m) => m[1]);
}

describe("the counted subject and the listing's reset key", () => {
  it("finds both sets", () => {
    expect(countedAxes()).toHaveLength(6);
    expect(resetAxes().length).toBeGreaterThanOrEqual(6);
  });

  it("counts by nothing the listing does not reset on", () => {
    const reset = new Set(resetAxes());
    expect(countedAxes().filter((axis) => !reset.has(axis))).toEqual([]);
  });

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

  it("leaves sort and order to the listing alone", () => {    const counted = new Set(countedAxes());
    expect(counted.has("sort")).toBe(false);
    expect(counted.has("order")).toBe(false);
    expect(resetAxes()).toContain("sort");
    expect(resetAxes()).toContain("order");
  });
});
