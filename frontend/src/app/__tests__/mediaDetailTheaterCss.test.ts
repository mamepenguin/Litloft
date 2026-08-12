import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function globalsCss(): string {
  return readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
}

describe("media detail theater sizing", () => {
  it("derives the player width from the measured height with a viewport fallback", () => {
    expect(globalsCss()).toMatch(
      /\.media-detail-player\[data-framed="true"\]\s*\{[^}]*max-width:\s*calc\(var\(--player-avail,\s*100dvh\)\s*\*\s*16\s*\/\s*9\);[^}]*margin-inline:\s*auto;/,
    );
  });

  it("keeps an explicit width alongside the auto margins", () => {
    // An auto inline margin turns off a grid item's default `stretch`,
    // so without this the item sizes from its contents — a <video> with
    // no metadata yet, which reports the CSS default 300x150. The player
    // rendered at 300px wide until the file loaded, then snapped.
    const rule = globalsCss().match(
      /\.media-detail-player\[data-framed="true"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*100%;/);
  });

  it("leaves the unframed player column alone", () => {
    // The cap inverts a 16:9 ratio, so it only means anything for a
    // player whose height follows its width. Applying it to an image,
    // a PDF or a text preview would narrow them on a short window for
    // no reason, which is why the selector carries `data-framed`.
    const rule = globalsCss().match(/\.media-detail-player\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).not.toMatch(/max-width/);
    expect(rule![0]).not.toMatch(/margin-inline/);
  });
});
