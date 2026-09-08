/**
 * How many related-file tiles fit on a row, measured in Chromium.
 *
 * ## Why this exists at all
 *
 * The property is "a tile is wide enough to read a filename in", and that
 * is a layout property. jsdom lays nothing out, so
 * `RelatedFilesSection.test.tsx` cannot see a column count at all — and
 * the alternative the repository has already measured and rejected is
 * reading `globals.css` as a string: in #200 the defect came back in full
 * by appending one line to the end of the stylesheet while every suite
 * stayed green. A later rule, an `@media` / `@container` / `@layer`
 * block, or an inline style each override a declaration that is still,
 * textually, right there.
 *
 * The bug this file is the detector for: the grid carried
 * `sm:grid-cols-2`, a **viewport** breakpoint, while the section renders
 * in two places whose widths have nothing to do with the window — the
 * 24rem inspector rail and the legacy vertical stack. Measured
 * 2026-09-08 against the running app, a 1456px window put two columns in
 * a 351px rail: 172px tiles whose name column was 37px and showed four
 * characters of a 27-character filename, on all eleven tiles.
 *
 * ## What it can see
 *
 * Anything decided by CSS plus the widths below: the column count at a
 * given container width, the tile width that follows from it, and — with
 * the span's own resolved font, through a canvas — how many characters of
 * a real filename the name column can show.
 *
 * ## What it cannot see
 *
 * Named so nobody reads a green tick as covering them.
 *
 * **No app is running.** The tiles are written by the fixture from a
 * declared table, so nothing here observes `RelatedFilesSection` choosing
 * to render, its fetch, its empty state, or the grouped / ungrouped card
 * that `RelatedFilesSection.test.tsx` holds. `relatedFilesFixtureParity.test.tsx`
 * is what keeps that table the component's own markup.
 *
 * **The case list is finite**, so a query keyed above the widest case
 * here is unreachable — measured: `@container related-files (min-width:
 * 1500px)` adding a third column survives, since 1200 is the widest
 * width below. The widths are not arbitrary: every one of them is a
 * width a real surface produces, or a point either side of the
 * threshold. There are **three** such surfaces, not two — see
 * `SURFACES` below.
 *
 * **Nothing here is about the tiles themselves.** Rendering them in
 * reverse order survives both this file and the jsdom suites; what a
 * tile *says* is `RelatedFilesSection.test.tsx`'s, and what it is
 * *shaped* like is the parity test's.
 *
 * **It says nothing about iOS Safari.** `container-type` establishes a
 * containment context, which on that browser renders a subtree holding a
 * `<video>`, `<audio>` or cross-origin iframe rotated and spinning
 * (`globals.css` ~line 820). Chromium never shows it. What guards that
 * here is the parity test's assertion that the tile holds no such
 * element, not this file.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "related-files.html"),
).href;

/**
 * The rail's grid: a 24rem inspector column, less the pane's `px-4`.
 *
 * **Before the pane's scrollbar**, which is the form to derive a
 * threshold from. The inspector is `overflow-auto` and always scrolls,
 * so where the browser draws a classic 15px scrollbar the list gets 336
 * instead; the threshold has to satisfy the widest rail it can face, not
 * the narrowest. The rail's own column count is the same either way —
 * both are far below the switch.
 */
const RAIL_GRID = 352;

/** `gap-2` between the columns. */
const GAP = 8;

/**
 * The threshold, in px at the 16px root font size: `45rem`.
 *
 * Derived, not picked: twice `RAIL_GRID` plus `GAP` is 712, and the
 * rounding to a whole rem **goes up**. Rounding down to 44rem is what
 * shipped in `df1474e5`, and it inverts the rule it comes from — each
 * column is then 348px, four under the rail's 352, and reads one
 * character worse. `thresholdColumn()` below is the arithmetic, so the
 * two cannot drift.
 */
const THRESHOLD = 720;

/** What one column is at a given container width, at two columns. */
const columnAt = (container: number) => (container - GAP) / 2;

/**
 * The three places this list is drawn, and the widths each produces.
 *
 * Two of them are stacks, and they are not the same stack — a claim
 * `df1474e5` got wrong. The canonical surface sits in the 2-pane right
 * pane, so its width is the window less the 280px tree and the padding.
 * The collection route (`?collection=`, `?folder_play=1`) is 2-pane
 * exempt and capped by `max-w-6xl` less `px-4`, so it is never wider
 * than 1120 whatever the window is — and it stays two columns at a
 * 900px window where the canonical stack has already dropped to one.
 */
const SURFACES = {
  /** The inspector rail, at every window width it exists at. */
  rail: [RAIL_GRID],
  /** Canonical stack, 2-pane: window - 280 tree - 32 padding. */
  canonicalStack: [456, 588, 807, 1144],
  /** Collection route: capped at 1120, and 721 at a 768px window. */
  collectionStack: [721, 853, 1072, 1120],
};

/**
 * A real filename out of the library the bug was measured in.
 *
 * 28 characters, long enough to overflow the name column at every width
 * asserted below — which is what makes the name column's width a
 * question about the layout rather than about the font.
 */
const NAME = "15792094940_54b0fd8f84_o.jpg";
const FOLDER = "test_images";

interface Measurement {
  gridWidth: number;
  rows: number;
  columns: number;
  tiles: {
    shape: string;
    width: number;
    nameWidth: number;
    nameChars: number;
    nameLength: number;
  }[];
}

declare global {
  interface Window {
    buildRelated: (spec: {
      width: number;
      count: number;
      shapes?: string[];
      forceColumns?: number;
      name: string;
      folder: string;
    }) => void;
    measureRelated: () => Measurement;
  }
}

async function layout(
  page: import("@playwright/test").Page,
  width: number,
  count = 11,
  shapes?: string[],
  forceColumns?: number,
): Promise<Measurement> {
  // The window is sized to the frame, not left at the default 1280px.
  // That is the whole point: `sm:grid-cols-2` is invisible to a suite
  // that lays a 352px grid out in a window wide enough to trigger it,
  // which is precisely how this shipped.
  await page.setViewportSize({ width: width + 40, height: 900 });
  await page.evaluate(
    (spec) => window.buildRelated(spec),
    { width, count, shapes, forceColumns, name: NAME, folder: FOLDER },
  );
  return page.evaluate(() => window.measureRelated());
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test.describe("the column count is the container's question", () => {
  test("the inspector rail gets one column, at any window width", async ({ page }) => {
    // The defect, stated as its own test. The rail is 352px whether the
    // window is 768 or 1456, and a viewport breakpoint gave it two
    // columns at every one of them.
    //
    // Everything asserted here is a width, and a width is what the CSS
    // decides — no glyph count is written down. `df1474e5` typed the
    // rail's character count in as a literal and then compared the
    // threshold against the literal, so both sides of the comparison
    // came from one observation and the comparison could not fail on
    // the thing it was about. The character claim now lives in the next
    // test, between two measurements taken in the same run.
    const m = await layout(page, RAIL_GRID);
    expect(m.columns).toBe(1);
    expect(m.rows).toBe(11);
    for (const tile of m.tiles) {
      expect(tile.width).toBeCloseTo(RAIL_GRID, 0);
      // The name overflows here, so its column is the tile's leftovers
      // and not the string's own width. Stated rather than assumed: it
      // is the precondition that makes `nameWidth` a layout fact.
      expect(tile.nameChars).toBeLessThan(tile.nameLength);
      expect(tile.nameWidth).toBeCloseTo(m.tiles[0].nameWidth, 0);
    }
  });

  test("one column just under the threshold, and a wider column at it", async ({ page }) => {
    const under = await layout(page, THRESHOLD - 8);
    expect(under.columns).toBe(1);

    const rail = await layout(page, RAIL_GRID);
    const at = await layout(page, THRESHOLD);
    expect(at.columns).toBe(2);

    // The rule, as arithmetic on widths: each column at the switch is
    // exactly `(720 - 8) / 2`, and that is wider than the rail's single
    // column. Both numbers are exact, so neither can drift under the
    // comparison that follows.
    expect(columnAt(THRESHOLD)).toBe(356);
    for (const tile of at.tiles) {
      expect(tile.width).toBeCloseTo(columnAt(THRESHOLD), 0);
      expect(tile.width).toBeGreaterThan(rail.tiles[0].width);
    }

    // And the consequence, measured in this run against this run's rail
    // rather than against a number typed in from another machine: the
    // switch never costs the reader a character. Not `toBe` — the
    // column at the threshold is deliberately *wider* than the rail's,
    // so equality would be asserting the opposite of the rule. What
    // stops the inequality from drifting is that both of its operands
    // are pinned exactly above.
    for (const tile of at.tiles) {
      expect(tile.nameWidth).toBeGreaterThan(rail.tiles[0].nameWidth);
      expect(tile.nameChars).toBeGreaterThanOrEqual(rail.tiles[0].nameChars);
    }
  });

  test("a switch one rem lower would cost the reader a character", async ({ page }) => {
    // Why the rounding goes up, as a measurement rather than as a
    // paragraph. 44rem shipped in `df1474e5`; at it each column is
    // 348px, four pixels under the rail, and the name column loses a
    // character it had at one column in the rail.
    const rail = await layout(page, RAIL_GRID);
    const lower = await layout(page, THRESHOLD - 16);
    expect(lower.columns).toBe(1);

    // The layout the old threshold would have produced, forced: two
    // columns in a 704px container.
    const forced = await layout(page, THRESHOLD - 16, 11, undefined, 2);
    expect(forced.tiles[0].width).toBeCloseTo(columnAt(704), 0);
    expect(forced.tiles[0].width).toBeLessThan(rail.tiles[0].width);
    expect(forced.tiles[0].nameChars).toBeLessThan(rail.tiles[0].nameChars);
  });

  test("the canonical stack keeps its two columns where it had room", async ({ page }) => {
    // 1144px is that surface at a 1456px window, measured.
    const m = await layout(page, 1144);
    expect(m.columns).toBe(2);
    expect(m.tiles[0].nameChars).toBe(m.tiles[0].nameLength);
  });

  test("the canonical stack drops to one column where it did not", async ({ page }) => {
    // 456px is that surface at a 768px window, measured. It was two
    // columns of 224px there — five of ten characters of a Japanese
    // filename, the same defect as the rail's with a different number.
    const m = await layout(page, 456);
    expect(m.columns).toBe(1);
    expect(m.tiles[0].width).toBeCloseTo(456, 0);
  });

  test("the collection route keeps two columns where the canonical stack has none", async ({ page }) => {
    // The third surface, and the reason it is worth its own case: at a
    // 900px window the canonical stack is 588px and drops to one
    // column, while this one is 853px and keeps two. A commit that
    // knows about two surfaces states "1 column at 900" and is wrong
    // about half the app.
    const m = await layout(page, 853);
    expect(m.columns).toBe(2);
    expect(m.tiles[0].width).toBeCloseTo(columnAt(853), 0);

    // Its ceiling, which no window width exceeds.
    const capped = await layout(page, 1120);
    expect(capped.columns).toBe(2);
  });
});

test.describe("no width produces a tile narrower than the rail's single column", () => {
  // The invariant the threshold exists to hold, swept rather than
  // spot-checked: a tile is either the whole container or at least as
  // wide as the rail's one column. A 172px tile inside a 351px
  // container — what shipped before `df1474e5` — violates both halves
  // at once.
  //
  // The floor is `RAIL_GRID`, the number the describe block names. It
  // was `THRESHOLD / 2 - 4` — four whole pixels of unexplained slop, an
  // order above the sub-pixel tolerance used elsewhere in this file,
  // and it was exactly the amount by which the 44rem threshold broke
  // the rule. A floor loosened to admit the one case it was written to
  // judge is not a floor.
  const WIDTHS = [
    320,
    ...SURFACES.rail,
    ...SURFACES.canonicalStack,
    ...SURFACES.collectionStack,
    THRESHOLD - 8,
    THRESHOLD,
    1200,
  ];

  for (const width of [...new Set(WIDTHS)].sort((a, b) => a - b)) {
    test(`${width}px`, async ({ page }) => {
      const m = await layout(page, width);
      for (const tile of m.tiles) {
        const full = Math.abs(tile.width - m.gridWidth) < 1;
        expect(full || tile.width >= RAIL_GRID).toBe(true);
      }
    });
  }
});

test.describe("the shapes the tile actually comes in", () => {
  test("a thumbnail, a kind glyph and a missing file lay out alike", async ({ page }) => {
    // Three class lists, one geometry: the anchor's `opacity-60` and the
    // second row's badge change no box, and the thumbnail slot is `w-24`
    // whether it holds a picture or the glyph. Asserted rather than
    // assumed, because if they differed the widths above would only be
    // true of the shape they were measured on.
    const m = await layout(page, RAIL_GRID, 3, ["thumbnail", "icon", "missing"]);
    expect(m.tiles.map((t) => t.shape)).toEqual(["thumbnail", "icon", "missing"]);
    expect(new Set(m.tiles.map((t) => Math.round(t.nameWidth))).size).toBe(1);
    expect(new Set(m.tiles.map((t) => t.nameChars)).size).toBe(1);
  });
});
