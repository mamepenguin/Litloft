import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

const REMOVED = ["media-layout-preference", "data-media-layout"];

function productFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return productFiles(path);
    if (/\.(test|spec)\./.test(entry.name)) return [];
    return [path];
  });
}

describe("the removed media layout preference", () => {
  it("appears in no product file", () => {
    const offenders = productFiles(SRC).flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return REMOVED.filter((needle) => text.includes(needle)).map(
        (needle) => `${relative(SRC, path)}: ${needle}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});
