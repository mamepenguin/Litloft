import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/sourceScan";

const SRC = join(process.cwd(), "src");

/** Every `.ts`/`.tsx` under `src`, tests and generated messages aside. */
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

/** Code only: a rule named in a comment must not satisfy the scan for it. */
function read(path: string): string {
  return stripComments(readFileSync(path, "utf8"));
}

describe("full-screen viewer chrome", () => {
  const VIEWERS = [
    join(SRC, "components/ImageGallery.tsx"),
    join(SRC, "components/archive/ArchiveImageViewer.tsx"),
    join(SRC, "components/pdf/PdfFullscreenViewer.tsx"),
    join(SRC, "components/epub/EpubPreview.tsx"),
  ];

  it("has no native select in any viewer", () => {
    for (const viewer of VIEWERS) {
      const source = read(viewer);
      expect(source.length).toBeGreaterThan(0);
      expect(source.match(/<select\b/g) ?? []).toHaveLength(0);
    }
  });

  it("defines the slideshow intervals exactly once", () => {
    const defining = sourceFiles().filter((f) =>
      /(?:export )?const INTERVAL_OPTIONS\s*=/.test(read(f)),
    );
    expect(defining.map((f) => f.slice(SRC.length + 1))).toEqual([
      "lib/slideshow.ts",
    ]);
  });

  it("has exactly four callers of the auto-hiding chrome hook", () => {
    const callers = sourceFiles().filter(
      (f) =>
        !f.endsWith(join("hooks", "useAutoHidingChrome.ts")) &&
        /useAutoHidingChrome\s*\(/.test(read(f)),
    );
    expect(callers.map((f) => f.slice(SRC.length + 1)).sort()).toEqual([
      "components/ImageGallery.tsx",
      "components/archive/useImageViewer.ts",
      "components/epub/EpubPreview.tsx",
      "components/pdf/PdfFullscreenViewer.tsx",
    ]);
  });
});
