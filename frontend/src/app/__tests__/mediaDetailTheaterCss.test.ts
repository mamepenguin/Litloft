import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function globalsCss(): string {
  return readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
}

/**
 * Anchored with `^` under `/m`: unanchored, a deleted base rule silently
 * retargets onto a qualified rule such as `[data-sheet-snap] .media-detail-player`.
 */
function baseRule(): RegExpMatchArray | null {
  return globalsCss().match(/^\.media-detail-player\s*\{[^}]*\}/m);
}

describe("media detail theater sizing", () => {
  it("derives the player width from the measured height with a viewport fallback", () => {
    expect(globalsCss()).toMatch(
      /\.media-detail-player\[data-framed="true"\]\s*\{[^}]*max-width:\s*calc\(var\(--player-avail,\s*100dvh\)\s*\*\s*16\s*\/\s*9\);[^}]*margin-inline:\s*auto;/,
    );
  });

  it("keeps an explicit width alongside the auto margins", () => {
    // An auto inline margin turns off a grid item's default `stretch`, so
    // without this a <video> with no metadata yet sizes to 300x150.
    const rule = globalsCss().match(
      /\.media-detail-player\[data-framed="true"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*100%;/);
  });

  it("leaves the unframed player column alone", () => {
    // The cap inverts a 16:9 ratio, so on an image, PDF or text preview it
    // would narrow them on a short window for no reason.
    const rule = baseRule();
    expect(rule).not.toBeNull();
    expect(rule![0]).not.toMatch(/max-width/);
    expect(rule![0]).not.toMatch(/margin-inline/);
  });

  it("keeps the player itself the grid item, and nothing around it", () => {
    // A box wrapping the player and its occupant would take away
    // `position: sticky`'s travel, which exists only inside the containing block.
    const rule = baseRule();
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/grid-area:\s*player;/);
    const aside = globalsCss().match(
      /^\.media-detail-player-aside\s*\{[^}]*\}/m,
    );
    expect(aside).not.toBeNull();
    expect(aside![0]).toMatch(/grid-area:\s*player-aside;/);
  });

  it("gives the occupant a row only where there is an occupant", () => {
    // A named row is laid out even when empty and `gap` is drawn on both
    // sides of it, so an unconditional row costs the gap twice.
    //
    // Comments are stripped first because the split is on braces, and
    // globals.css comments contain braces.
    const withoutComments = globalsCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
    const templates = withoutComments
      .split("}")
      .map((block) => block.split("{"))
      .filter(
        ([selector, body]) =>
          body?.includes("grid-template-areas:") &&
          selector.includes(".media-detail-grid"),
      )
      .map(([selector, body]) => ({
        selector: oneLine(selector),
        areas: oneLine(/grid-template-areas:([^;]*);/.exec(body)?.[1] ?? ""),
      }));

    const OCCUPIED = ":has(> .media-detail-player-aside:not(:empty))";
    const WIDE = '[data-media-layout="beside"] [data-media-width="wide"] ';
    expect(templates).toEqual([
      { selector: ".media-detail-grid", areas: '"player" "companion" "rest"' },
      {
        selector: `.media-detail-grid${OCCUPIED}`,
        areas: '"player" "player-aside" "companion" "rest"',
      },
      {
        selector: `${WIDE}.media-detail-grid`,
        areas: '"player companion" "rest companion"',
      },
      {
        selector: `${WIDE}.media-detail-grid${OCCUPIED}`,
        areas:
          '"player companion" "player-aside companion" "rest companion"',
      },
    ]);
  });
});

describe("media detail, companion below the player", () => {
  it("gives both surfaces one height budget, measured", () => {
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
    // `max-height` on a row container clamps the line's cross size, so an
    // occupant that ignores `fillHeight` would otherwise run past the box.
    const rule = globalsCss().match(/\.media-detail-below\s*\{[^}]*\}/);
    expect(rule![0]).toMatch(/overflow:\s*hidden;/);
  });

  it("gives the index a floor equal to its base, and a ceiling", () => {
    // Past about 350px a column of timestamps stops reading as an index.
    const rule = globalsCss().match(/\.media-detail-below-index\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex:\s*1 1 12\.5rem;/);
    expect(rule![0]).toMatch(/min-width:\s*12\.5rem;/);
    expect(rule![0]).toMatch(/max-width:\s*22rem;/);
  });

  it("bases the body at its measure, not at zero", () => {
    // Free space is shared from the bases, so a body based at 0 stays
    // narrower than the short index beside it.
    const rule = globalsCss().match(/\.media-detail-below-body\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex:\s*1 1 68ch;/);
    expect(rule![0]).toMatch(/max-width:\s*68ch;/);
    expect(rule![0]).toMatch(/min-width:\s*0;/);
    expect(rule![0]).toMatch(/min-height:\s*0;/);
  });

  it("hides the empty box rather than letting the layout drop it", () => {
    // Not omitted from the layout: the occupants report whether they have
    // anything, so removing the box would freeze the answer at its first guess.
    const rule = globalsCss().match(
      /\.media-detail-below\[data-occupied="false"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/display:\s*none;/);
  });

  it("keeps the reading measure in one place", () => {
    expect(globalsCss()).toMatch(/\.reading-measure\s*\{\s*max-width:\s*860px;\s*\}/);
  });

  it("passes the height on to whatever the slot puts in the body", () => {
    const rule = globalsCss().match(
      /\.media-detail-below-body\s*>\s*\*\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex:\s*1 1 0%;/);
    expect(rule![0]).toMatch(/min-height:\s*0;/);
  });
});

describe("inspector overlay placement", () => {
  it("takes the pane out of flow without touching its width", () => {
    // Not narrowed: under 320px Japanese wraps at 12–14 characters a line.
    const rule = globalsCss().match(
      /\[data-inspector-fit="overlay"\]\s+\.inspector-pane\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/position:\s*absolute;/);
    expect(rule![0]).toMatch(/inset-block:\s*0;/);
    expect(rule![0]).toMatch(/inset-inline-end:\s*0;/);
    expect(rule![0]).not.toMatch(/width/);
    expect(rule![0]).not.toMatch(/max-width/);
  });

  it("stays under everything that has to stay reachable over it", () => {
    // The mini player sits inside this panel's band, and the sidebar's
    // backdrop (z 30) is modal while open.
    const rule = globalsCss().match(
      /\[data-inspector-fit="overlay"\]\s+\.inspector-pane\s*\{[^}]*\}/,
    );
    const z = rule![0].match(/z-index:\s*(\d+);/);
    expect(z).not.toBeNull();
    expect(Number(z![1])).toBeLessThan(30);
  });

  it("gives it no shadow", () => {
    const rule = globalsCss().match(
      /\[data-inspector-fit="overlay"\]\s+\.inspector-pane\s*\{[^}]*\}/,
    );
    expect(rule![0]).not.toMatch(/box-shadow/);
  });
});

describe("the sheet's resting action row", () => {
  it("grows its controls to the touch floor on a coarse pointer", () => {
    // Grown rather than overhung: the controls sit 2-4px apart, so 44px hit
    // areas would overlap and the later sibling would steal its neighbour's edge.
    const css = globalsCss();
    const rule = css.match(
      /@media \(pointer: coarse\) \{\s*\.file-action-row-touch > \*\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/min-width:\s*2\.75rem;/);
    expect(rule![0]).toMatch(/min-height:\s*2\.75rem;/);

    expect(rule![0]).toMatch(/display:\s*inline-flex;/);
    expect(rule![0]).toMatch(/align-items:\s*center;/);
    expect(rule![0]).toMatch(/justify-content:\s*center;/);

    const depth = [...css.slice(0, rule!.index!)].reduce(
      (d, c) => (c === "{" ? d + 1 : c === "}" ? d - 1 : d),
      0,
    );
    expect(depth).toBe(0);
  });
});

describe("the player on a phone", () => {
  it("sticks the wrapper, which is the element that can travel", () => {
    // A sticky box moves only within its containing block; the frame's parent
    // is barely taller than the frame, so sticking the frame has no travel.
    const rule = globalsCss().match(
      /\[data-sheet-snap\]\s+\.media-detail-player\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/position:\s*sticky;/);
    expect(rule![0]).toMatch(/top:\s*0;/);
  });

  it("caps it from a variable that cannot drift while it is stuck", () => {
    // `--player-avail` derives from this element's own offset, so the cap
    // would tighten as a stuck player scrolls. Dropping the cap instead puts
    // the control bar below the fold in phone landscape.
    const rule = globalsCss().match(
      /\[data-sheet-snap\]\s+\.media-detail-player\[data-framed="true"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(
      /max-width:\s*calc\(var\(--rail-avail,\s*100dvh\)\s*\*\s*16\s*\/\s*9\);/,
    );
    expect(rule![0]).not.toMatch(/--player-avail/);
  });
});
