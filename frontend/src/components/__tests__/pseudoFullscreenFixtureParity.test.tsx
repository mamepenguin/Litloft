import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "../../..");

const read = (path: string) => readFileSync(resolve(FRONTEND, path), "utf8");

const specOf = (fixture: string): Record<string, string | number> =>
  JSON.parse(
    read(`e2e-layout/fixtures/${fixture}`).match(
      /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
    )![1],
  );

const SPEC = specOf("pseudo-fullscreen.html");
// Both are held to the rendered components by their own parity tests.
const SHEET_SPEC = specOf("mobile-inspector-sheet.html");
const MENU_SPEC = specOf("file-actions-menu.html");

const sorted = (classes: string | number) =>
  String(classes).split(/\s+/).filter(Boolean).sort();

describe("the pseudo-fullscreen layout fixture's class lists", () => {
  it("names exactly the keys it uses", () => {
    expect(Object.keys(SPEC).sort()).toEqual([
      "canvas",
      "chromeButtons",
      "drawer",
      "frameBase",
      "frameInline",
      "framePinned",
      "header",
      "mediaHost",
      "pageRoot",
      "player",
      "strip",
      "surface",
    ]);
  });

  it("draws the page and the sheet as the sheet's fixture does", () => {
    for (const key of ["pageRoot", "canvas", "mediaHost", "player", "drawer", "surface"]) {
      expect(sorted(SPEC[key]), key).toEqual(sorted(SHEET_SPEC[key]));
    }
  });

  it("draws the resting strip as the file-menu fixture does", () => {
    expect(sorted(SPEC.strip)).toEqual(sorted(MENU_SPEC.strip));
  });

  it("pins the frame with the classes the video player uses", () => {
    const player = read("src/components/VideoPlayer.tsx");
    for (const key of ["frameBase", "framePinned", "frameInline"]) {
      expect(player, key).toContain(`"${SPEC[key]}"`);
    }
  });

  it("draws the header and the menu button with their components' classes", () => {
    expect(read("src/components/Header.tsx")).toContain(
      `className="${SPEC.header}"`,
    );
    expect(read("src/components/ChromeButtons.tsx")).toContain(
      `className="${SPEC.chromeButtons}"`,
    );
  });
});
