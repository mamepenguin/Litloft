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

  it("keeps the player's explicit width alongside the auto margins", () => {
    // An auto inline margin turns off a block-level box's default
    // `stretch`, so without this a <video> with no metadata yet sizes to
    // 300x150.
    const rule = globalsCss().match(
      /\.media-detail-player\[data-framed="true"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*100%;/);
  });

  it("caps only a framed player", () => {
    // The cap inverts a 16:9 ratio, so on an image, PDF or text preview, or
    // an audio player, it would narrow them on a short window for no reason.
    const capped = [
      ...globalsCss().matchAll(
        /\.media-detail-player[^{]*\{[^}]*max-width:[^}]*\}/g,
      ),
    ].map((match) => match[0]);
    expect(capped.length).toBeGreaterThan(0);
    for (const rule of capped) {
      expect(rule).toMatch(/\[data-framed="true"\]/);
    }
  });
});

describe("the workbench under the player", () => {
  it("claims the scroll container's visible height only while a panel is shown", () => {
    const host = globalsCss().match(
      /\.media-detail-host\[data-workbench="on"\]\s*\{[^}]*\}/,
    );
    expect(host).not.toBeNull();
    expect(host![0]).toMatch(/display:\s*flex;/);
    expect(host![0]).toMatch(/flex-direction:\s*column;/);
    expect(host![0]).toMatch(
      /min-height:\s*var\(--rail-avail,\s*100dvh\);/,
    );
  });

  it("caps a framed player at half the visible height", () => {
    const cap = globalsCss().match(
      /\.media-detail-host\[data-workbench="on"\]\s+\.media-detail-player\[data-framed="true"\]\s*\{[^}]*\}/,
    );
    expect(cap).not.toBeNull();
    expect(cap![0]).toMatch(
      /max-width:\s*calc\(\s*var\(--rail-avail,\s*100dvh\)\s*\*\s*var\(--workbench-player-share,\s*0\.5\)\s*\*\s*16\s*\/\s*9\s*\);/,
    );
  });

  it("wraps the row rather than scrolling it sideways", () => {
    const row = globalsCss().match(
      /\.media-detail-workbench-row\s*\{[^}]*\}/,
    );
    expect(row).not.toBeNull();
    expect(row![0]).toMatch(/flex-wrap:\s*wrap;/);

    const toggles = globalsCss().match(
      /\.media-detail-workbench-toggles\s*\{[^}]*\}/,
    );
    expect(toggles).not.toBeNull();
    expect(toggles![0]).toMatch(/flex-wrap:\s*wrap;/);
  });

  it("puts the player's actions at the row's trailing end", () => {
    const actions = globalsCss().match(
      /\.media-detail-workbench-actions\s*\{[^}]*\}/,
    );
    expect(actions).not.toBeNull();
    expect(actions![0]).toMatch(/margin-left:\s*auto;/);
  });

  it("grows a toggle to the touch floor on a coarse pointer", () => {
    const rule = globalsCss().match(
      /@media \(pointer: coarse\) \{\s*\.workbench-toggle\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/min-height:\s*2\.75rem;/);
  });

  it("takes no height under the row when no panel is shown", () => {
    const rule = globalsCss().match(
      /\.media-detail-workbench-grid\[hidden\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/display:\s*none;/);
  });

  it("sits two panels side by side at the wide width and stacks them below it", () => {
    const wide = globalsCss().match(
      /\.media-detail-workbench\[data-workbench-width="wide"\]\s*\.media-detail-workbench-grid\s*\{[^}]*\}/,
    );
    expect(wide).not.toBeNull();
    expect(wide![0]).toMatch(/flex-direction:\s*row;/);

    const narrow = globalsCss().match(
      /\.media-detail-workbench\[data-workbench-width="narrow"\]\s*\.media-detail-workbench-grid\s*\{[^}]*\}/,
    );
    expect(narrow).not.toBeNull();
    expect(narrow![0]).toMatch(/flex-direction:\s*column;/);
  });

  it("scrolls each panel's body inside itself", () => {
    const rule = globalsCss().match(
      /\.media-detail-workbench-body\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/overflow:\s*auto;/);
  });

  it("gives the collection surface 60% of the visible height and no gap", () => {
    const rule = globalsCss().match(
      /\.media-detail-host\[data-collection-workbench="true"\]\s*\.media-detail-workbench-grid:not\(\[hidden\]\)\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(
      /height:\s*max\(18rem,\s*calc\(var\(--rail-avail,\s*100dvh\)\s*\*\s*0\.6\)\);/,
    );
    expect(rule![0]).toMatch(/gap:\s*0;/);
  });
});

describe("the reading measure", () => {
  it("lives in one place", () => {
    expect(globalsCss()).toMatch(
      /\.reading-measure\s*\{\s*max-width:\s*860px;\s*\}/,
    );
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

describe("inspector stacked under the player", () => {
  it("turns the row into a column, canvas first", () => {
    const rule = globalsCss().match(
      /\[data-inspector-fit="stacked"\]\[data-inspector-open="true"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex-direction:\s*column;/);
  });

  it("caps the canvas at 60% so the inspector keeps 40%", () => {
    const rule = globalsCss().match(
      /\[data-inspector-fit="stacked"\]\[data-inspector-open="true"\]\s*>\s*main\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/max-height:\s*60%;/);
  });

  it("gives the pane the full width under it", () => {
    // Not narrowed: under 320px Japanese wraps at 12–14 characters a line.
    const rule = globalsCss().match(
      /\[data-inspector-fit="stacked"\]\[data-inspector-open="true"\]\s+\.inspector-pane\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*100%;/);
    expect(rule![0]).toMatch(/flex:\s*1 1 40%;/);
    expect(rule![0]).toMatch(/border-inline-start:\s*0;/);
  });

  it("caps a framed player at half the row, less the bars sharing the canvas", () => {
    // The find bar, the action row and the padding come out of the half, so
    // the frame's controls are always on screen and the canvas never scrolls
    // to reach them.
    const rule = globalsCss().match(
      /\[data-inspector-fit="stacked"\]\[data-inspector-open="true"\]\s+\.media-detail-player\[data-framed="true"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/max-width:/);
    // The canvas is as tall as the player here, so a cap measured from it
    // would shrink the player to nothing.
    expect(rule![0]).not.toMatch(/--player-avail/);
    expect(rule![0]).toMatch(/var\(--fit-player-h/);
    expect(rule![0]).toMatch(/\*\s*16\s*\/\s*9/);
    expect(rule![0]).not.toMatch(/max-height/);
  });

  it("keeps the overlay rule for a file the row cannot hold", () => {
    const rule = globalsCss().match(
      /\[data-inspector-fit="overlay"\]\s+\.inspector-pane\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/position:\s*absolute;/);
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
