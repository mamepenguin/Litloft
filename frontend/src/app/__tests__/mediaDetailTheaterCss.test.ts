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

/**
 * The companion below the player, on the shell.
 *
 * jsdom does no layout, so nothing else in the suite can see any of
 * this: a `min-width` that is not there, a `flex-basis` that resolves
 * against the wrong axis, a box with no bound on it. The rules are read
 * as text instead, which catches the one failure mode that matters here
 * — someone deleting a declaration whose reason is not visible from the
 * declaration.
 */
describe("media detail, companion below the player", () => {
  it("gives both surfaces one height budget, measured", () => {
    // The box under the player and the rail beside it are the same
    // question asked on two surfaces. A number per layout is how the
    // two come to disagree, so the value is derived once on the host
    // and read twice.
    const host = globalsCss().match(/\.media-detail-host\s*\{[^}]*\}/);
    expect(host).not.toBeNull();
    expect(host![0]).toMatch(
      /--companion-box-h:\s*calc\(var\(--rail-avail,\s*100dvh\)\s*\*\s*0\.6\);/,
    );
    for (const selector of [
      /\.media-detail-companion-inner\s*\{[^}]*\}/,
      /\.media-detail-below\s*\{[^}]*\}/,
    ]) {
      const rule = globalsCss().match(selector);
      expect(rule).not.toBeNull();
      expect(rule![0]).toMatch(/max-height:\s*var\(--companion-box-h\);/);
    }
  });

  it("bounds the below box rather than trusting its occupant", () => {
    // `max-height` on a row container clamps the line's cross size, not
    // the main axis, so the mechanism that bounds the column form does
    // not apply here. An occupant that ignores `fillHeight` would run
    // past the box with nothing to stop it.
    const rule = globalsCss().match(/\.media-detail-below\s*\{[^}]*\}/);
    expect(rule![0]).toMatch(/overflow:\s*hidden;/);
  });

  it("lets the index take the width the body's measure leaves", () => {
    // Fixed at its floor it never widened, and the body stops at the
    // reading measure — so a wide canvas spent the surplus on nothing.
    const rule = globalsCss().match(/\.media-detail-below-index\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex:\s*1 1 12\.5rem;/);
    expect(rule![0]).toMatch(/min-width:\s*12\.5rem;/);
    expect(rule![0]).toMatch(/max-width:\s*22rem;/);
  });

  it("bases the body at its measure, not at zero", () => {
    // Free space is shared from the bases, so a body based at 0 arrives
    // 200px behind the index and stays there: at a 500px canvas that is
    // a 340px chapter list beside a 140px transcript, the short index
    // outgrowing the long body it indexes. `min-width: 0` is the half
    // everyone forgets — without it a flex item refuses to go below its
    // content and the overflow moves up a level instead of scrolling.
    const rule = globalsCss().match(/\.media-detail-below-body\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex:\s*1 1 68ch;/);
    expect(rule![0]).toMatch(/max-width:\s*68ch;/);
    expect(rule![0]).toMatch(/min-width:\s*0;/);
    expect(rule![0]).toMatch(/min-height:\s*0;/);
  });

  it("keeps the reading measure in one place", () => {
    // It was written out in `MarkdownPreview` and then again on the
    // media canvas's description, which is the drift this rule exists
    // to make unrepresentable rather than merely detectable.
    expect(globalsCss()).toMatch(/\.reading-measure\s*\{\s*max-width:\s*860px;\s*\}/);
  });

  it("passes the height on to whatever the slot puts in the body", () => {
    // The wrapper is only safe as long as it is itself a flex container
    // that hands the height through; otherwise the occupant lays itself
    // out at full length and the box clips it silently.
    const rule = globalsCss().match(
      /\.media-detail-below-body\s*>\s*\*\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex:\s*1 1 0%;/);
    expect(rule![0]).toMatch(/min-height:\s*0;/);
  });
});
