import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

function readPackage(name: string): {
  version: string;
  dependencies?: Record<string, string>;
} {
  return JSON.parse(
    readFileSync(require.resolve(`${name}/package.json`), "utf8"),
  );
}

describe("PDF.js dependencies", () => {
  it("uses the same PDF.js version for the react-pdf API and worker", () => {
    const appPackage = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const reactPdf = readPackage("react-pdf");
    const workerPackage = readPackage("pdfjs-dist");

    expect(workerPackage.version).toBe(reactPdf.dependencies?.["pdfjs-dist"]);
    expect(appPackage.dependencies["pdfjs-dist"]).toBe(workerPackage.version);
  });
});
