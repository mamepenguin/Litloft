import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("media detail theater sizing", () => {
  it("derives the player width from the measured height with a viewport fallback", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.media-detail-player\s*\{[^}]*max-width:\s*calc\(var\(--player-avail,\s*100dvh\)\s*\*\s*16\s*\/\s*9\);[^}]*margin-inline:\s*auto;/,
    );
  });
});
