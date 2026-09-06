import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const SELF = fileURLToPath(import.meta.url);

const ROOTS = [
  resolve(REPO_ROOT, "frontend/src"),
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => resolve(ADDONS_DIR, e.name, "frontend"))
        .filter(existsSync)
    : []),
];

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "addons" && dir === ROOTS[0]) continue;
      if (entry.name === "__tests__") continue;
      if (statSync(full).isDirectory()) walk(full);
      // Tests are excluded, and only tests: a mime spelled inside a test
      // is a fixture, not a second source of truth the app can drift from.
      // The exclusion is stated here so it is visible rather than implied by
      // an empty result.
      else if (
        /\.tsx?$/.test(entry.name) &&
        !/\.test\.tsx?$/.test(entry.name) &&
        full !== SELF
      ) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Files that spell out an OOXML mime type.
 *
 * The literal, not an identifier named after it: a second copy of the set
 * would not fail anywhere — both would keep working, and the only symptom
 * would be a format that has a listing thumbnail and no detail excerpt, or
 * the reverse. Matching the mime itself is what finds a copy whatever its
 * variable is called.
 */
function filesNamingOoxmlMimes(): string[] {
  const out = new Set<string>();
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      if (
        /application\/vnd\.openxmlformats-officedocument\./.test(
          readFileSync(file, "utf-8"),
        )
      ) {
        out.add(relative(REPO_ROOT, file));
      }
    }
  }
  return [...out].sort();
}

describe("the OOXML mime list", () => {
  it("is written down once", () => {
    expect(filesNamingOoxmlMimes()).toEqual(["frontend/src/lib/officeFiles.ts"]);
  });

  it("is written down at all", () => {
    // "Nowhere but `officeFiles.ts`" is also true of a walk that read nothing
    // — a renamed directory, a changed extension filter, a `REPO_ROOT` that
    // no longer resolves.
    expect(filesNamingOoxmlMimes().length).toBe(1);
    expect(ROOTS.length).toBeGreaterThan(1);
  });
});
