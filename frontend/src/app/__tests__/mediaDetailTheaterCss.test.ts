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

  it("gives the index a floor equal to its base, and a ceiling", () => {
    // Floor equal to base is what stops it shrinking, so it is frozen
    // rather than shrunk-then-clamped when the canvas is narrow. The
    // ceiling is its own number: past about 350px a column of
    // timestamps stops reading as an index.
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

  it("hides the empty box rather than letting the layout drop it", () => {
    // `display: none` and not the layout omitting the box: its
    // occupants are what report whether they have anything for the
    // file, so a box removed because they had nothing yet would remove
    // the reporters too and freeze the answer at its first guess. The
    // attribute is what the layout writes and what the test in
    // `MediaShell` asserts; this binds it to a rule that does something.
    const rule = globalsCss().match(
      /\.media-detail-below\[data-occupied="false"\]\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/display:\s*none;/);
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

/**
 * The inspector's overlay form.
 *
 * jsdom does no layout, so the positioning that makes "covers the
 * canvas rather than narrowing it" true is only readable as text.
 */
describe("inspector overlay placement", () => {
  it("takes the pane out of flow without touching its width", () => {
    // Narrowing was tried and rejected — under 320px Japanese wraps at
    // 12–14 characters a line — so the pane keeps `w-96` and covers the
    // canvas instead. A `width` here would be that rejected design
    // arriving through the back door.
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
    // The mini player is ~320px against the right edge, so it lands
    // entirely inside this panel's band; at 40 it was buried, close
    // button and all. Below the sidebar's backdrop at 30 too — the
    // sidebar is modal while open, and a bright interactive panel above
    // its dim is the page claiming to be two things at once.
    const rule = globalsCss().match(
      /\[data-inspector-fit="overlay"\]\s+\.inspector-pane\s*\{[^}]*\}/,
    );
    const z = rule![0].match(/z-index:\s*(\d+);/);
    expect(z).not.toBeNull();
    expect(Number(z![1])).toBeLessThan(30);
  });

  it("gives it no shadow", () => {
    // DESIGN.md §4 keeps properties panels at Level 0 and names
    // decorative use on flat-surface components as forbidden. The pane
    // already separates by surface colour and a left border, which is
    // the depth that section asks for first.
    const rule = globalsCss().match(
      /\[data-inspector-fit="overlay"\]\s+\.inspector-pane\s*\{[^}]*\}/,
    );
    expect(rule![0]).not.toMatch(/box-shadow/);
  });
});

describe("the sheet's resting action row", () => {
  it("grows its controls to the touch floor on a coarse pointer", () => {
    // Not the row: a tall row with `items-center` never stretches a
    // child into it, which is how the targets stayed 28px inside a 44px
    // row. Grown rather than overhung, because these controls sit 2-4px
    // apart and 44px hit areas would overlap by a third — the later
    // sibling would then win the hit test for its neighbour's edge.
    //
    // The selector covers both rows. It named the compact one alone, and
    // the inspector's row — same controls, 4px gap — stayed at 32px.
    const css = globalsCss();
    const rule = css.match(
      /@media \(pointer: coarse\) \{\s*\.file-action-row-touch > \*\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/min-width:\s*2\.75rem;/);
    expect(rule![0]).toMatch(/min-height:\s*2\.75rem;/);

    // The other three, measured load-bearing and previously pinned by
    // nothing. They are one unit rather than a box rule plus two garnishes:
    // `align-items` is observable at all only because `display: inline-flex`
    // gives a flex context to children that have none, and removing either of
    // those alone leaves the gallery icon 6px off centre inside the box the
    // rule just grew. `justify-content` centres it horizontally in three
    // controls.
    expect(rule![0]).toMatch(/display:\s*inline-flex;/);
    expect(rule![0]).toMatch(/align-items:\s*center;/);
    expect(rule![0]).toMatch(/justify-content:\s*center;/);

    // At the top level, not nested in another at-rule.
    //
    // This test reads the stylesheet as text, so it can say the rule is
    // written and never that it reaches a screen. Wrapping the whole block in
    // `@media print { … }` leaves the substring above intact and passes —
    // measured, with the floor gone everywhere: the compact strip back to
    // 28x28 and the inspector row to 32. Counting braces closes that.
    //
    // **It does not close a later block overriding these declarations**, and
    // nothing here can: that needs a browser this suite does not have.
    const depth = [...css.slice(0, rule!.index!)].reduce(
      (d, c) => (c === "{" ? d + 1 : c === "}" ? d - 1 : d),
      0,
    );
    expect(depth).toBe(0);
  });
});

describe("the player on a phone", () => {
  it("sticks the wrapper, which is the element that can travel", () => {
    // A sticky box moves only within its own containing block. On the
    // frame, whose parent holds the frame and an action row that is
    // usually `empty:hidden`, the travel was zero — the player scrolled
    // away exactly as it did before. The wrapper's parent is the canvas
    // host, as tall as everything under the player.
    const rule = globalsCss().match(
      /\[data-sheet-snap\]\s+\.media-detail-player\s*\{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/position:\s*sticky;/);
    expect(rule![0]).toMatch(/top:\s*0;/);
  });

  it("caps it from a variable that cannot drift while it is stuck", () => {
    // `--player-avail` comes from this element's own offset, which is a
    // constant zero while stuck against a scroll position that keeps
    // growing — the cap would tighten as the reader scrolls. Dropping
    // the cap is not the answer either: phone landscape is still under
    // the mobile breakpoint, and an uncapped 667px-wide player is
    // taller than its scrollport, so its control bar sits below the
    // fold. `--rail-avail` is the scrollport itself and knows nothing
    // about the player.
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
