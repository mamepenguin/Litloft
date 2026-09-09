/**
 * The mobile Bottom Sheet, measured in Chromium.
 *
 * ## Why this exists at all
 *
 * Both halves of unit C are geometry, and jsdom lays nothing out — every
 * `getBoundingClientRect()` there is zeros, so a sheet whose foot is 67px
 * under the fold measures exactly like one that ends at the screen edge.
 * The reported defect was "the sheet cannot be scrolled to its end", and
 * the shape of it was a scroller reporting `scrollHeight ===
 * clientHeight` while a screenful of content sat below the viewport. No
 * class check reaches that: every class involved was present and correct
 * the whole time.
 *
 * ## What it can see
 *
 * Where the drawer, the box inside it and the scroller land at each snap
 * and at each viewport height; whether the end of a tab can be brought on
 * screen; which element the browser will actually scroll; and where the
 * tab strip sits once the header has gone past it.
 *
 * ## What it cannot see
 *
 * Named so a green tick is not read as covering them.
 *
 * **vaul is not running.** This page reproduces vaul's own arithmetic —
 * `--snap-point-height` is `innerHeight × (1 − snap)` — and sets the
 * variable and the transform itself. What pins that copy against the real
 * library is `MobileInspectorSheet.test.tsx`, which renders a real drawer
 * at each snap and reads the variable back off it.
 *
 * **And nothing here notices the components losing the arrangement.**
 * This file builds its own markup from the JSON in the fixture, so taking
 * `scroll="column"` off the sheet's inspector leaves every case green.
 * `mobileInspectorSheetFixtureParity.test.tsx` is what connects the two:
 * it renders both forms of the real `InspectorShell` and the real
 * `MobileInspectorSheet` and compares the class lists in both directions.
 * This file proves the arrangement works; that one proves the components
 * are using it.
 *
 * **The header's height is the fixture's**, and deliberately so — it is a
 * property of the file being looked at, not of the sheet. The cases vary
 * it against the height of the sheet it is drawn in rather than asserting
 * one measured number, because a number measured at one viewport is false
 * at the next.
 *
 * **The pointer is fine, not coarse.** `pointer-coarse:min-h-11` on the
 * strip and its tabs does not apply in this project, so the strip is
 * shorter here than on a phone. Nothing below asserts its height.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "mobile-inspector-sheet.html"),
).href;

/** A phone's width. Nothing below is a claim about the horizontal axis. */
const WIDTH = 375;

/**
 * The two snap points the sheet gives vaul, by name.
 *
 * `peek` is not among them — the drawer is not mounted there at all — so
 * these two are every state this file can be about.
 */
const SNAPS = [
  { snap: 0.5, label: "half" },
  { snap: 0.9, label: "full" },
] as const;

/**
 * Viewport heights, declared rather than picked.
 *
 * The failure this file is about survives at whichever height its author
 * happens to choose — the previous suite's one height was the reason a
 * false claim stayed green — so the cases run at four, spanning a small
 * phone to a large one. Every expectation below is arithmetic on `height`
 * and `snap`, never a literal measured at one of them.
 */
const HEIGHTS = [
  { height: 667, label: "iPhone SE" },
  { height: 745, label: "iPhone 15" },
  { height: 812, label: "iPhone X" },
  { height: 915, label: "a large Android" },
] as const;

expect(SNAPS).toHaveLength(2);
expect(HEIGHTS).toHaveLength(4);

/** Every combination, so no case can quietly cover one height and one snap. */
const CASES = HEIGHTS.flatMap(({ height, label: hLabel }) =>
  SNAPS.map(({ snap, label: sLabel }) => ({ height, snap, hLabel, sLabel })),
);
expect(CASES).toHaveLength(8);

interface Rect {
  top: number;
  bottom: number;
  height: number;
}

interface Measurement {
  viewportHeight: number;
  snapPointHeight: number;
  drawer: Rect;
  drawerBorderTop: number;
  visible: Rect | null;
  scroller: Rect;
  strip: Rect;
  header: Rect;
  end: Rect;
  stripTopInScroller: number;
  headerTopInScroller: number;
  stripPosition: string;
  stripHit: string | null;
  bodyPosition: string;
  stripBackground: string;
  scrollTop: number;
  maxScroll: number;
  verticallyScrollable: string[];
}

type Mode = "column" | "panel";
type Bound = "visible-box" | "cap-50vh" | "none";

interface Spec {
  height: number;
  snap: number;
  mode?: Mode;
  bound?: Bound;
  headerPx?: number;
  bodyPx?: number;
}

declare global {
  interface Window {
    buildSheet: (spec: {
      snap: number;
      mode: Mode;
      bound: Bound;
      headerPx: number;
      bodyPx: number;
    }) => void;
    measureSheet: (scrollTo?: number) => Measurement;
  }
}

/**
 * Builds the sheet and measures it, optionally after a scroll.
 *
 * `bodyPx` defaults to twice the viewport, which is longer than the
 * tallest sheet any snap produces (`0.8 × vh`), so "the end is below the
 * fold before scrolling" is true by construction rather than by luck.
 */
async function layout(
  page: import("@playwright/test").Page,
  {
    height,
    snap,
    mode = "column",
    bound = "visible-box",
    headerPx = 120,
    bodyPx = height * 2,
  }: Spec,
  scrollTo?: number,
): Promise<Measurement> {
  await page.setViewportSize({ width: WIDTH, height });
  await page.evaluate(
    (spec) => window.buildSheet(spec),
    { snap, mode, bound, headerPx, bodyPx },
  );
  return page.evaluate((to) => window.measureSheet(to), scrollTo);
}

/** Past any content this fixture draws; the browser clamps it to the end. */
const TO_THE_END = 1_000_000;

type Case = (typeof CASES)[number];

/**
 * What the loops below actually registered, recorded as they register it.
 *
 * Pinning `CASES.length` does not observe a loop: `for (… of
 * CASES.slice(0, 1))` dropped seven of these cases and the suite reported
 * green, because nothing compared the tests that exist against the
 * population they were meant to come from. Two of the loops were worse —
 * they ran inside a single test, where a `slice` does not even change the
 * count.
 *
 * So every case goes through `eachCase`, which pushes its id **and**
 * registers the test in the same two lines. A `slice`, a `break` or a
 * `continue` anywhere in that loop shortens this array, and the guard at
 * the bottom of the file compares it against the cross product of
 * `GROUPS` and `CASES` — recomputed from the two declarations rather than
 * from the array itself, so the expected side does not move with the
 * loop. Same recipe as `mobileInspectorSheetFixtureParity.test.tsx`.
 */
const registered: string[] = [];

const caseId = (group: string, c: Case) => `${group} — ${c.height}px at ${c.sLabel}`;

function eachCase(
  group: string,
  body: (page: import("@playwright/test").Page, c: Case) => Promise<void>,
): void {
  for (const c of CASES) {
    registered.push(caseId(group, c));
    test(`${c.height}px (${c.hLabel}) at ${c.sLabel}`, async ({ page }) => {
      await body(page, c);
    });
  }
}

/**
 * Every group of cases in this file, by name.
 *
 * Declared rather than counted, so deleting a whole describe is red as
 * well: the guard rebuilds the expected register from this list.
 */
const GROUPS = [
  "the drawer hangs below the fold, and the box inside it does not",
  "the drawer itself is still 90vh",
  "the end of the tab can be brought on screen",
  "exactly one box scrolls, and it is the sheet's",
  "the tab strip stays reachable once it has been scrolled to",
  "the tab strip is on screen from the start when the header fits",
  "replaced: the pinned header leaves the wrong box scrolling",
  "replaced: the hand-written cap ends below the screen",
  "replaced: an unbounded scroller ends a whole overhang below the screen",
] as const;
expect(GROUPS).toHaveLength(9);

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test.describe(GROUPS[0], () => {
  eachCase(GROUPS[0], async (page, { height, snap }) => {
    const m = await layout(page, { height, snap });

    // vaul's number, from the inputs rather than from the reading:
    // it translates the drawer down by the part of the window the snap
    // does not cover.
    expect(m.snapPointHeight).toBeCloseTo(height * (1 - snap), 0);

    // The defect C-2 is about, asserted rather than assumed: the
    // drawer's own foot really is off the screen, at every snap.
    expect(m.drawer.bottom).toBeGreaterThan(height);
    expect(m.drawer.bottom - height).toBeCloseTo(m.snapPointHeight, 0);

    // And the box the scroller lives in is the drawer less exactly
    // that — stated against the drawer's own measured box, so no snap
    // value and no viewport unit is repeated in the expectation. The
    // border is named because `100%` resolves against the content box:
    // it lands above the visible box rather than inside it, which is
    // why the consequence on the next line is exact.
    expect(m.visible).not.toBeNull();
    expect(
      m.visible!.height + m.snapPointHeight + m.drawerBorderTop,
    ).toBeCloseTo(m.drawer.height, 0);
    expect(m.drawerBorderTop).toBeGreaterThan(0);
    expect(m.visible!.bottom).toBeCloseTo(height, 0);
    expect(m.scroller.bottom).toBeLessThanOrEqual(height + 1);
  });
});

test.describe(GROUPS[1], () => {
  eachCase(GROUPS[1], async (page, { height, snap }) => {
    // Left alone deliberately, and not because vaul measures it — the
    // translate is a pure function of `window.innerHeight` and the snap.
    // The drawer's height is the *other* term in what the fix computes:
    // the visible box is that height less the translate, so shrinking
    // `Drawer.Content` moves its top down while the translate stays put.
    // At `h-[50vh]` and snap 0.5 the whole drawer would land at or below
    // the fold.
    const m = await layout(page, { height, snap });
    expect(m.drawer.height).toBeCloseTo(height * 0.9, 0);
  });
});

test.describe(GROUPS[2], () => {
  eachCase(GROUPS[2], async (page, { height, snap }) => {
    const before = await layout(page, { height, snap });

    // The claim is about content that is off the screen. A scroller
    // whose content already fitted would satisfy "the end is visible"
    // without anything having scrolled.
    expect(before.end.top).toBeGreaterThan(height);
    expect(before.maxScroll).toBeGreaterThan(0);

    const after = await layout(page, { height, snap }, TO_THE_END);

    expect(after.scrollTop).toBeCloseTo(after.maxScroll, 0);
    // The reported defect, inverted: the last line of the tab is on
    // the screen, not merely inside a box whose own foot is past it.
    expect(after.end.bottom).toBeLessThanOrEqual(height + 1);
    expect(after.end.top).toBeGreaterThanOrEqual(0);
  });
});

test.describe(GROUPS[3], () => {
  eachCase(GROUPS[3], async (page, { height, snap }) => {
    const m = await layout(page, { height, snap });

    // Named, not counted. The two-tier form also has one scrolling box
    // — the wrong one — so a count would not separate them, and would
    // not say what it had found either.
    expect(m.verticallyScrollable).toEqual(["mobile-inspector-content"]);
  });
});

test.describe(GROUPS[4], () => {
  eachCase(GROUPS[4], async (page, { height, snap }) => {
    // A header taller than the whole visible sheet, which at `half` is
    // the file page's real shape: the strip then starts below the fold
    // and the reader has to scroll to it. That is the trade the
    // one-column decision makes, and this is it written down.
    const spec = { height, snap, headerPx: height };

    const rest = await layout(page, spec);
    expect(rest.stripTopInScroller).toBeGreaterThan(rest.scroller.height);

    // Scrolled all the way down, the strip has not gone with the
    // header: it is at the top edge of the box that scrolled, and the
    // header has travelled off the top of it.
    const scrolled = await layout(page, spec, TO_THE_END);
    expect(scrolled.stripPosition).toBe("sticky");
    expect(scrolled.stripTopInScroller).toBeCloseTo(0, 0);
    expect(scrolled.headerTopInScroller).toBeLessThan(0);
    // On the screen, not merely at the top of a box that is not.
    expect(scrolled.strip.top).toBeGreaterThanOrEqual(0);
    expect(scrolled.strip.bottom).toBeLessThanOrEqual(height + 1);
    // Opaque, or the tab body travels visibly through it.
    expect(scrolled.stripBackground).not.toBe("rgba(0, 0, 0, 0)");
    // And in front of it. The tab body is positioned — an addon
    // section, a popover anchor — and two positioned boxes at
    // `z-index: auto` paint in document order, which puts the panel on
    // top. This is the strip's own stacking order, asked of the
    // browser rather than read off a class.
    expect(scrolled.bodyPosition).toBe("relative");
    expect(scrolled.stripHit).toBe("inspector-tabs");
  });
});

test.describe(GROUPS[5], () => {
  eachCase(GROUPS[5], async (page, { height, snap }) => {
    // The other side of the same mechanism: sticky pins a box that has
    // been reached, it does not pull one up. With a header that fits, the
    // strip is on screen from the start.
    const m = await layout(page, { height, snap, headerPx: 40 });
    expect(m.strip.bottom).toBeLessThanOrEqual(height + 1);
    expect(m.stripTopInScroller).toBeCloseTo(40, 0);
  });
});

/**
 * The arrangements this unit replaced, measured so that going back to
 * either of them is a failing case rather than a judgement call.
 *
 * Detector rule 4: the sentences above claim the column form and the
 * `--snap-point-height` box are what put the end of the tab on screen.
 * Until the two alternatives are shown not to, that is prose.
 */
test.describe(GROUPS[6], () => {
  eachCase(GROUPS[6], async (page, { height, snap }) => {
    const m = await layout(page, { height, snap, mode: "panel" }, TO_THE_END);

    // The nested pair: the sheet's own scroller has nothing to scroll,
    // because the shell inside it has taken a height to fill and put
    // the overflow in the panel.
    expect(m.verticallyScrollable).toEqual(["inspector-panel"]);
    expect(m.maxScroll).toBe(0);
    // And so scrolling the sheet does not move the end of the tab.
    expect(m.end.top).toBeGreaterThan(height);
  });
});

test.describe(GROUPS[7], () => {
  eachCase(GROUPS[7], async (page, { height, snap }) => {
    const m = await layout(
      page,
      { height, snap, bound: "cap-50vh" },
      TO_THE_END,
    );

    // A cap of the snap's own fraction is a second definition of a
    // number vaul already publishes, and it is short by everything
    // above the scroller — the handle, and the drawer's top edge.
    expect(m.visible).toBeNull();
    expect(m.scroller.bottom).toBeGreaterThan(height);
    expect(m.end.bottom).toBeGreaterThan(height);
  });
});

test.describe(GROUPS[8], () => {
  eachCase(GROUPS[8], async (page, { height, snap }) => {
    const m = await layout(page, { height, snap, bound: "none" }, TO_THE_END);

    expect(m.scroller.bottom).toBeCloseTo(m.drawer.bottom, 0);
    expect(m.end.bottom).toBeGreaterThan(height);
  });
});

test("every group ran at every case", () => {
  // The expected side is rebuilt from the two declarations, so it does
  // not follow a loop that has been walked back. Order matters: this is
  // the register in the order the file wrote it.
  expect(registered).toEqual(
    GROUPS.flatMap((group) => CASES.map((c) => caseId(group, c))),
  );
});
