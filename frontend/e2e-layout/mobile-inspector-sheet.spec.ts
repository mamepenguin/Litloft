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

import {
  SHEET_DRAWER_VH,
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  halfSnapUnderPlayer,
  sheetDrawerHeightPx,
} from "../src/lib/sheetSnap";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "mobile-inspector-sheet.html"),
).href;


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
 * Viewports, declared rather than picked — **and both orientations**.
 *
 * The failure this file is about survives at whichever viewport its
 * author happens to choose, so the cases run at five, spanning a small
 * phone to a large one. Every expectation below is arithmetic on the
 * case's own `height` and `snap`, never a literal measured at one of
 * them.
 *
 * The last one is the point of the list rather than a rounding-out of
 * it. A rotated phone is still under `useIsMobile`'s 768 breakpoint, so
 * it gets this sheet; it is where `globals.css` records an uncapped
 * player showing its own failure; and it is the only viewport here where
 * a framed player leaves less room than the sheet's fixed fraction, which
 * is the branch that hands the fixed fraction back. Four portrait
 * viewports at one width could not see any of it
 * (`review-workflow.md`, "the parameters are part of the observation").
 */
const VIEWPORTS = [
  { width: 375, height: 667, label: "iPhone SE" },
  { width: 375, height: 745, label: "iPhone 15" },
  { width: 375, height: 812, label: "iPhone X" },
  { width: 375, height: 915, label: "a large Android" },
  { width: 667, height: 375, label: "a phone held sideways" },
] as const;

expect(SNAPS).toHaveLength(2);
expect(VIEWPORTS).toHaveLength(5);
// Both orientations, asked of the list rather than of its length: a
// fifth portrait entry would keep the count and lose the case.
expect(VIEWPORTS.filter((v) => v.width > v.height)).toHaveLength(1);
expect(VIEWPORTS.filter((v) => v.width < v.height)).toHaveLength(4);

/** Every combination, so no case can quietly cover one viewport and one snap. */
const CASES = VIEWPORTS.flatMap(({ width, height, label: hLabel }) =>
  SNAPS.map(({ snap, label: sLabel }) => ({
    width,
    height,
    snap,
    hLabel,
    sLabel,
  })),
);
expect(CASES).toHaveLength(10);

interface Rect {
  top: number;
  bottom: number;
  height: number;
}

interface Measurement {
  viewportHeight: number;
  snapPointHeight: number;
  drawer: Rect;
  surfaceBorderTop: number;
  visible: Rect | null;
  scroller: Rect;
  strip: Rect;
  header: Rect;
  end: Rect;
  player: Rect | null;
  playerPosition: string | null;
  canvasClientHeight: number | null;
  canvasTop: number | null;
  belowHeight: number | null;
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
  width: number;
  height: number;
  snap: number;
  mode?: Mode;
  bound?: Bound;
  headerPx?: number;
  bodyPx?: number;
  /**
   * The drawer's height, when a case is about it being wrong.
   *
   * The fixture otherwise sizes it the way the component does — off
   * `window.innerHeight`, which is the viewport vaul solves its snaps
   * in. Passing a number here is how the "sized in a CSS viewport unit"
   * case draws a drawer belonging to a taller viewport than the one the
   * snap was computed from.
   */
  drawerPx?: number;
}

declare global {
  interface Window {
    buildSheet: (spec: {
      snap: number;
      mode: Mode;
      bound: Bound;
      headerPx: number;
      bodyPx: number;
      drawerPx?: number;
    }) => void;
    buildPage: (spec: {
      playerPx: number;
      framed: boolean;
      bodyPx: number;
    }) => void;
    scrollCanvas: (to: number) => void;
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
    width,
    height,
    snap,
    mode = "column",
    bound = "visible-box",
    headerPx = 120,
    bodyPx = height * 2,
    drawerPx,
  }: Spec,
  scrollTo?: number,
): Promise<Measurement> {
  await page.setViewportSize({ width, height });
  await page.evaluate(
    (spec) => window.buildSheet(spec),
    { snap, mode, bound, headerPx, bodyPx, drawerPx },
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
 * So every case goes through `eachCase`, which registers the test and
 * **then** records it. The order is the whole of it: recorded first, a
 * `continue`, a `throw` or a conditional between the two lines drops the
 * registration and leaves the record — measured, in the version this
 * replaces, at 45 browser cases lost with the guard still green. Recorded
 * last, a skipped push leaves the register short of the declarations and
 * the guard red, and anything that skips the `test()` takes its push with
 * it — two directions caught by two different halves, not by one
 * impossibility. The guard at the bottom of the file compares this array
 * against the cross product of the group lists and the case lists,
 * recomputed from the declarations rather than from the array itself, so
 * the expected side does not move with the loop.
 *
 * What a register cannot see at all is which case a body was actually
 * handed: both of its sides come from the same declarations, so a helper
 * passing every body the same case keeps every name and every record.
 * That is why both helpers below end by reading what the page was
 * actually driven to and comparing it against the case they registered.
 *
 * What neither can see is `test.skip` in place of `test`, which
 * registers a case that does not run. The runner's own report is where
 * that shows.
 */
const registered: string[] = [];

const caseKey = (c: Case) => `${c.width}x${c.height} at ${c.sLabel}`;
const caseId = (group: string, c: Case) => `${group} — ${caseKey(c)}`;

/**
 * The case a body was actually driven at, read back off the browser.
 *
 * The viewport is Chromium's own `innerWidth` / `innerHeight` rather
 * than Playwright's record of what was asked for, and the snap is the
 * variable the fixture wrote on the drawer it last built. Every body in
 * this file builds at its case's own snap — the ones that build twice
 * build twice at it — so the last sheet standing is the case's.
 */
async function droveViewport(
  page: import("@playwright/test").Page,
): Promise<{ width: number; height: number; snap: number }> {
  return page.evaluate(() => {
    const drawer = document.querySelector<HTMLElement>(
      "[data-testid='mobile-inspector-sheet']",
    )!;
    const offset = Number.parseFloat(
      getComputedStyle(drawer).getPropertyValue("--snap-point-height"),
    );
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      snap: 1 - offset / window.innerHeight,
    };
  });
}

function eachCase(
  group: string,
  body: (page: import("@playwright/test").Page, c: Case) => Promise<void>,
): void {
  for (const c of CASES) {
    test(`${c.width}x${c.height} (${c.hLabel}) at ${c.sLabel}`, async ({
      page,
    }) => {
      await body(page, c);

      // What the body drove, against what it was registered for. The
      // register above cannot ask this — it is built from the same two
      // declarations it is compared against — so a helper handing every
      // body `CASES[0]` collapses ten cases onto one with every name and
      // every record intact.
      const drove = await droveViewport(page);
      expect(drove.width).toBe(c.width);
      expect(drove.height).toBe(c.height);
      expect(drove.snap).toBeCloseTo(c.snap, 3);
    });
    registered.push(caseId(group, c));
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
  "the drawer is nine tenths of the viewport vaul reads",
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
  eachCase(GROUPS[0], async (page, { width, height, snap }) => {
    const m = await layout(page, { width, height, snap });

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
    // why the consequence on the next line is exact. It is the
    // *surface's* border — the drawer is unpainted, so that a content
    // pull can translate the surface and nothing else.
    expect(m.visible).not.toBeNull();
    expect(
      m.visible!.height + m.snapPointHeight + m.surfaceBorderTop,
    ).toBeCloseTo(m.drawer.height, 0);
    expect(m.surfaceBorderTop).toBeGreaterThan(0);
    expect(m.visible!.bottom).toBeCloseTo(height, 0);
    expect(m.scroller.bottom).toBeLessThanOrEqual(height + 1);
  });
});

test.describe(GROUPS[1], () => {
  eachCase(GROUPS[1], async (page, { width, height, snap }) => {
    // Left alone deliberately, and not because vaul measures it — the
    // translate is a pure function of `window.innerHeight` and the snap.
    // The drawer's height is the *other* term in what the fix computes:
    // the visible box is that height less the translate, so shrinking
    // `Drawer.Content` moves its top down while the translate stays put.
    //
    // **And it is that height in the viewport vaul reads.** Asserted
    // against `sheetDrawerHeightPx` on the browser's own
    // `window.innerHeight` rather than against a fraction written here,
    // because the two terms of the derivation agreeing about which
    // viewport they are in is the whole of the first finding this round.
    // A desktop Chromium cannot separate `100vh` from `innerHeight`, so
    // the case that does is further down.
    const m = await layout(page, { width, height, snap });
    expect(m.drawer.height).toBeCloseTo(sheetDrawerHeightPx(m.viewportHeight), 0);
    expect(m.viewportHeight).toBe(height);
  });
});

test.describe(GROUPS[2], () => {
  eachCase(GROUPS[2], async (page, { width, height, snap }) => {
    const before = await layout(page, { width, height, snap });

    // The claim is about content that is off the screen. A scroller
    // whose content already fitted would satisfy "the end is visible"
    // without anything having scrolled.
    expect(before.end.top).toBeGreaterThan(height);
    expect(before.maxScroll).toBeGreaterThan(0);

    const after = await layout(page, { width, height, snap }, TO_THE_END);

    expect(after.scrollTop).toBeCloseTo(after.maxScroll, 0);
    // The reported defect, inverted: the last line of the tab is on
    // the screen, not merely inside a box whose own foot is past it.
    expect(after.end.bottom).toBeLessThanOrEqual(height + 1);
    expect(after.end.top).toBeGreaterThanOrEqual(0);
  });
});

test.describe(GROUPS[3], () => {
  eachCase(GROUPS[3], async (page, { width, height, snap }) => {
    const m = await layout(page, { width, height, snap });

    // Named, not counted. The two-tier form also has one scrolling box
    // — the wrong one — so a count would not separate them, and would
    // not say what it had found either.
    expect(m.verticallyScrollable).toEqual(["mobile-inspector-content"]);
  });
});

test.describe(GROUPS[4], () => {
  eachCase(GROUPS[4], async (page, { width, height, snap }) => {
    // A header taller than the whole visible sheet, which at `half` is
    // the file page's real shape: the strip then starts below the fold
    // and the reader has to scroll to it. That is the trade the
    // one-column decision makes, and this is it written down.
    const spec = { width, height, snap, headerPx: height };

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
  eachCase(GROUPS[5], async (page, { width, height, snap }) => {
    // The other side of the same mechanism: sticky pins a box that has
    // been reached, it does not pull one up. With a header that fits, the
    // strip is on screen from the start.
    const m = await layout(page, { width, height, snap, headerPx: 40 });
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
/**
 * The viewports where the pinned header does not even fit the sheet.
 *
 * Declared, because it is a different question from anything the outcome
 * lists answer: whether the `shrink-0` header and tab strip are taller
 * than the whole visible sheet. Where they are, the two-tier form
 * overflows the sheet's own scroller *as well as* the panel — two boxes
 * with something to move, and neither of them reaching the tab. A phone
 * held sideways at `half` is the one, which is the same viewport the
 * derived snap has to hand back to the fixed fraction.
 */
const HEADER_OVERFLOWS_THE_SHEET = ["667x375 at half"];
expect(HEADER_OVERFLOWS_THE_SHEET).toHaveLength(1);

test.describe(GROUPS[6], () => {
  eachCase(GROUPS[6], async (page, c) => {
    const m = await layout(page, { ...c, mode: "panel" }, TO_THE_END);

    if (HEADER_OVERFLOWS_THE_SHEET.includes(caseKey(c))) {
      expect(m.verticallyScrollable).toEqual([
        "mobile-inspector-content",
        "inspector-panel",
      ]);
      expect(m.maxScroll).toBeGreaterThan(0);
    } else {
      // The nested pair: the sheet's own scroller has nothing to scroll,
      // because the shell inside it has taken a height to fill and put
      // the overflow in the panel.
      expect(m.verticallyScrollable).toEqual(["inspector-panel"]);
      expect(m.maxScroll).toBe(0);
    }
    // Either way, scrolling the sheet does not move the end of the tab,
    // which is the defect the column form removed.
    expect(m.end.top).toBeGreaterThan(c.height);
  });
});

test.describe(GROUPS[7], () => {
  eachCase(GROUPS[7], async (page, { width, height, snap }) => {
    const m = await layout(
      page,
      { width, height, snap, bound: "cap-50vh" },
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
  eachCase(GROUPS[8], async (page, { width, height, snap }) => {
    const m = await layout(page, { width, height, snap, bound: "none" }, TO_THE_END);

    expect(m.scroller.bottom).toBeCloseTo(m.drawer.bottom, 0);
    expect(m.end.bottom).toBeGreaterThan(height);
  });
});

/**
 * Unit D: `half` is where the player ends.
 *
 * The sheet's `half` snap stops being a fixed fraction of the window and
 * becomes the room under the player, so a phone can carry the video and
 * the transcript at once. Everything about that is geometry, and this is
 * the only place in the repository that can see it: jsdom returns zeros
 * for every rect, so a sheet drawn over the video measures there exactly
 * like one drawn under it.
 *
 * **The derivation is the app's, not a copy.** `halfSnapUnderPlayer` is
 * imported from `src/lib/sheetSnap.ts` and handed the player's *measured*
 * bottom edge — the page is built and measured first, then the snap is
 * computed, then the sheet is built at it. A fixture that recomputed the
 * arithmetic in the browser would agree with any derivation at all,
 * including one that ignored the player.
 *
 * **The assertions are relationships, never pixels.** Where the sheet
 * lands is stated against the player's own measured box and against
 * second measurements of the sheet at `full` and at the fixed fraction
 * it replaced; the only literals are `SHEET_PEEK_PX`, which is the unit
 * the upper bound is expressed in, and `URL_BAR_PX`, which is an input
 * to one case and is named where it is declared.
 *
 * The sheet's top edge is the *drawer's* border-box top. The visible box
 * inside it begins one border lower — `100%` resolves against the
 * content box — which is the same border the C cases account for.
 */

/**
 * What is at the top of the canvas, by shape — and it is two shapes.
 *
 * A framed player is 16:9 whatever the file is: `VideoPlayer` draws the
 * `<video>` in `aspect-video`, the `.loft` embed uses a `padding-top:
 * 56.25%` shim, and a portrait clip is letterboxed inside that frame
 * rather than making the wrapper tall. So the fixture states the shim
 * and lets the stylesheet's own width cap decide the height; a `9:16`
 * or `4:3` wrapper would be a shape this page cannot draw, and testing
 * one is testing the fixture.
 *
 * The second is an audio bar: a control row and nothing above it, with
 * no ratio to invert, so it is short at every viewport and the room
 * under it is more than `full` itself shows.
 */
const PLAYERS = [
  { label: "a framed player", framed: true, px: 0 },
  { label: "an audio bar", framed: false, px: 54 },
] as const;
expect(PLAYERS).toHaveLength(2);
expect(PLAYERS.filter((p) => p.framed)).toHaveLength(1);

/**
 * What each pair is expected to do, declared by name.
 *
 * Three outcomes, and two of them are the bounds rather than the rule —
 * so they are written out here instead of being computed from the
 * measurement. A rule derived from what was observed moves with it and
 * can never disagree with it (`review-workflow.md`, detector rule 5),
 * and these two sets are exactly where D's headline claim is *not* true.
 *
 * - `capped`: the room under the player is more than `full` shows, so
 *   `half` would meet or pass `full` and the drag between the two states
 *   would move nothing. It stops one strip short of `full` instead.
 * - `fallback`: the player leaves less room than the fixed fraction the
 *   sheet used before this derivation existed, so there is nothing to
 *   buy by keeping it whole and `half` is that fixed fraction again. A
 *   phone held sideways is the shape that gets there: the stylesheet
 *   caps a framed player at the scrollport's own height, so what is left
 *   under it is a handful of pixels.
 *
 * Everything not named here lands the sheet's top edge on the player's
 * bottom edge, which is the rule.
 *
 * The tallest portrait viewport clears the cap by about two pixels — a
 * 16:9 player on a 915px screen leaves 674 against a bound of 676 — so
 * the last portrait row is close to changing class. It is declared, not
 * derived, precisely so that moving it is red rather than silent.
 */
const CAPPED = [
  "375x667 × an audio bar",
  "375x745 × an audio bar",
  "375x812 × an audio bar",
  "375x915 × an audio bar",
  "667x375 × an audio bar",
];
const FALLBACK = ["667x375 × a framed player"];
expect(CAPPED).toHaveLength(5);
expect(FALLBACK).toHaveLength(1);

type Outcome = "lands" | "capped" | "fallback";

interface PlayerCase {
  width: number;
  height: number;
  hLabel: string;
  playerPx: number;
  framed: boolean;
  pLabel: string;
  outcome: Outcome;
}

const playerKey = (width: number, height: number, pLabel: string) =>
  `${width}x${height} × ${pLabel}`;

const PLAYER_CASES: PlayerCase[] = VIEWPORTS.flatMap(
  ({ width, height, label: hLabel }) =>
    PLAYERS.map(({ label: pLabel, px, framed }) => {
      const key = playerKey(width, height, pLabel);
      return {
        width,
        height,
        hLabel,
        playerPx: px,
        framed,
        pLabel,
        outcome: CAPPED.includes(key)
          ? ("capped" as const)
          : FALLBACK.includes(key)
            ? ("fallback" as const)
            : ("lands" as const),
      };
    }),
);
expect(PLAYER_CASES).toHaveLength(10);
// Named per outcome, so a pair silently changing class is red here
// rather than passing under whichever branch it landed in.
expect(PLAYER_CASES.filter((c) => c.outcome === "lands")).toHaveLength(4);
expect(PLAYER_CASES.filter((c) => c.outcome === "capped")).toHaveLength(5);
expect(PLAYER_CASES.filter((c) => c.outcome === "fallback")).toHaveLength(1);

/**
 * The cases where the player is pulled up at the end of the scroll, and
 * by how far.
 *
 * Sticky travels only inside its containing block, so where that block
 * ends before the scroll does, its last line drags the player up.
 * Declared rather than derived from the outcome: it is a different
 * condition from either bound, and the two only happen to coincide on
 * this list.
 *
 * **Not "the player is taller than the scrollport".** On the one pair
 * that travels the player is 326.98 against a 327px scrollport — very
 * slightly shorter — and it travels anyway, because the page reserves
 * room under it for the resting strip. The block running out is the
 * mechanism; a comparison of those two heights is not.
 *
 * **The distance is declared too, not just the direction.** A
 * `toBeLessThan` is satisfied by one pixel of travel as readily as by
 * the whole player, and the whole reason the travel is harmless is a
 * magnitude: the room it opens under the player stays below the floor
 * beneath which `halfSnapUnderPlayer` hands back the fixed fraction, so
 * the snap solved at the top of the page is still the snap the bottom of
 * the page would have produced. That is asserted directly below as well
 * — a bound that moves with the viewport and the player rather than with
 * this table — but a bare direction here would let the number this file
 * measures move to anything at all in silence.
 */
const TRAVEL_PX: Record<string, number> = {
  "667x375 × a framed player": 88,
};
expect(Object.keys(TRAVEL_PX)).toHaveLength(1);

/**
 * Every travelling pair is a `fallback` pair, and the two lists are not
 * the same list by accident.
 *
 * A player travels when its containing block runs out before the scroll
 * does, which on this page means the player has taken so much of the
 * scrollport that what is reserved below it no longer fits — and a player
 * that takes the scrollport leaves nothing under it, which is the
 * condition `fallback` names. So where the edge moves there was never a
 * derived snap to go stale, and where a snap was derived the edge does
 * not move. That is the whole reason one measurement at the top of the
 * page is good for the rest of it.
 *
 * Asserted as a subset rather than left to the reader: a pair that
 * travelled *and* derived would be a stale number nothing here would
 * notice, and it has to disagree with this line first.
 */
expect(Object.keys(TRAVEL_PX).filter((k) => !FALLBACK.includes(k))).toEqual([]);

/**
 * A phone's URL bar, as an input.
 *
 * Not a measurement of anything in this repository: it stands for the
 * difference between the large viewport a CSS `vh` resolves against and
 * the `window.innerHeight` vaul solves its snaps in, which is the height
 * of the browser chrome that is showing. 80px is in the range iOS Safari
 * and Chrome on Android use. Chromium at a fixed viewport size cannot
 * produce the difference itself, so the case below draws it.
 */
const URL_BAR_PX = 80;

const PLAYER_GROUPS = [
  "the sheet's derived half against the player it sits under",
  "and the same after the page behind it has been scrolled",
  "the player starts at the scrollport's edge with nothing following it",
  "replaced: the fixed half does not know the player is there",
  "replaced: a drawer sized in a CSS viewport unit reaches over the player",
] as const;
expect(PLAYER_GROUPS).toHaveLength(5);

const playerCaseId = (group: string, c: PlayerCase) =>
  `${group} — ${playerKey(c.width, c.height, c.pLabel)}`;

function eachPlayerCase(
  group: string,
  body: (page: import("@playwright/test").Page, c: PlayerCase) => Promise<void>,
): void {
  // Registered first and recorded second, for the reason `registered`
  // gives: a record written before the registration it claims survives
  // anything inserted between the two.
  for (const c of PLAYER_CASES) {
    test(`${c.width}x${c.height} (${c.hLabel}) with ${c.pLabel}`, async ({
      page,
    }) => {
      await body(page, c);

      // The page the body actually drew, against the case it was
      // registered for — the viewport from Chromium and the player's
      // kind from the element the fixture built. A `PlayerCase` is a
      // viewport crossed with a player, so those two readings name it
      // completely: handing every body `PLAYER_CASES[0]` would collapse
      // all forty onto one page and leave the register untouched, and
      // every row of this file's measurements with it.
      //
      // The snap is not read here, unlike `eachCase`: these groups build
      // deliberately at `full` and at the fixed fraction as well as at
      // the derived snap, so the last sheet standing is not the case's.
      const drove = await page.evaluate(() => {
        const player = document.querySelector<HTMLElement>(
          "[data-testid='media-detail-player']",
        )!;
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          framed: player.dataset.framed === "true",
        };
      });
      expect(drove).toEqual({
        width: c.width,
        height: c.height,
        framed: c.framed,
      });
    });
    registered.push(playerCaseId(group, c));
  }
}

/**
 * Draw the page, measure the player, derive the snap, draw the sheet.
 *
 * In that order, which is the app's own: the snap is a function of a
 * measurement, so choosing it first would prove nothing.
 */
async function layoutUnderPlayer(
  page: import("@playwright/test").Page,
  { width, height, playerPx, framed }: PlayerCase,
  {
    snap,
    scrollCanvasTo,
    drawerPx,
    // Twice the viewport by default: a page with somewhere to scroll,
    // which is every case but the one that asks what happens when the
    // player is the only thing in the canvas. Zero is not a smaller
    // version of the same page — it takes away the slack `position:
    // sticky` needs to correct anything, which is what makes the
    // player's own flow position observable.
    bodyPx = height * 2,
  }: {
    snap?: number;
    scrollCanvasTo?: number;
    drawerPx?: number;
    bodyPx?: number;
  } = {},
): Promise<{ m: Measurement; derived: number; playerBottom: number }> {
  await page.setViewportSize({ width, height });
  await page.evaluate((spec) => window.buildPage(spec), {
    playerPx,
    framed,
    bodyPx,
  });
  if (scrollCanvasTo !== undefined) {
    await page.evaluate((to) => window.scrollCanvas(to), scrollCanvasTo);
  }

  const playerBottom = await page.evaluate(
    () =>
      document
        .querySelector("[data-testid='media-detail-player']")!
        .getBoundingClientRect().bottom,
  );

  const derived =
    halfSnapUnderPlayer({ viewportHeight: height, playerBottom }) ??
    SHEET_SNAP_HALF_FALLBACK;

  const m = await layout(page, {
    width,
    height,
    snap: snap ?? derived,
    drawerPx,
  });
  return { m, derived, playerBottom };
}

/** The room the sheet has on screen, border included, at one snap. */
const roomOnScreen = (m: Measurement) => m.visible!.height + m.surfaceBorderTop;

/**
 * What every case asserts about a sheet built at the derived snap.
 *
 * Split out because the scrolled group asserts exactly the same thing
 * about exactly the same ten pairs, and a second copy is a second place
 * for one of the three outcomes to quietly go missing.
 */
async function expectSheetUnderPlayer(
  page: import("@playwright/test").Page,
  c: PlayerCase,
  { m, atRest }: { m: Measurement; atRest: boolean },
): Promise<void> {
  expect(m.player).not.toBeNull();
  expect(m.visible).not.toBeNull();
  // A real box, or "it is above the sheet" would be true of nothing.
  expect(m.player!.height).toBeGreaterThan(0);
  // The premise: the player is stuck to the top of the canvas, which is
  // what makes one measurement good for the whole of a scroll.
  expect(m.playerPosition).toBe("sticky");

  // And it is *already* there, unscrolled — which is the half `position`
  // alone does not state and the half the derived snap rests on. Two
  // ways it is not, both measured on this page:
  //
  //  - a top padding on the host puts the player below the scrollport,
  //    so it travels before it pins and one bottom edge becomes two
  //    (the stylesheet takes that padding off);
  //  - the player's own first child bleeds with a negative top margin,
  //    and with the padding gone that margin puts the player *above* the
  //    scrollport. Where something follows the player, `sticky` then
  //    corrects it downward — the box moves with its size unchanged,
  //    which is the one channel `useSheetHalfSnap` does not watch.
  //
  // The fixture draws both the padding and the bleed, so this comparison
  // is what says the stylesheet cancels both.
  //
  // Only at rest. A sticky box travels inside its own containing block,
  // so where that block ends before the scroll does, the end of it pulls
  // the box back up — which is the travel the scrolled group measures on
  // purpose, and the direction `useSheetHalfSnap` records as safe. Which
  // of these pairs it happens to is declared in `TRAVEL_PX`, not derived
  // from a comparison here.
  if (atRest) {
    expect(m.canvasTop).not.toBeNull();
    expect(m.player!.top).toBeCloseTo(m.canvasTop!, 0);
  }

  if (c.framed) {
    // The width cap, asked as the thing it buys: a framed player is
    // never taller than the scrollport it is stuck to. `globals.css`
    // records that dropping this cap showed itself in phone landscape,
    // and it is landscape that this file now measures — so a page that
    // stopped marking the player framed would draw one 30px taller than
    // its own scrollport here and say nothing.
    expect(m.canvasClientHeight).not.toBeNull();
    expect(m.player!.height).toBeLessThanOrEqual(m.canvasClientHeight! + 1);
  }
  expect(m.visible!.bottom).toBeCloseTo(c.height, 0);

  // **Never less room than the fixed fraction it replaces**, at any of
  // the ten. Measured against a second build at that fraction rather
  // than against the arithmetic, because the whole complaint this bound
  // answers was that the derivation could take room away: a landscape
  // phone used to get 55px here, one pixel under the resting strip and
  // 94px under what the fixed fraction gives.
  const atFixedHalf = await layout(page, {
    width: c.width,
    height: c.height,
    snap: SHEET_SNAP_HALF_FALLBACK,
  });
  expect(roomOnScreen(m)).toBeGreaterThanOrEqual(roomOnScreen(atFixedHalf) - 1);

  if (c.outcome === "fallback") {
    // Not "the sheet gives up what it can" — it is the fixed fraction
    // again, exactly, and it does *not* clear the player. Both halves
    // are stated: a derivation that quietly kept deriving here would
    // pass the bound above and fail the equality.
    expect(roomOnScreen(m)).toBeCloseTo(roomOnScreen(atFixedHalf), 0);
    expect(m.drawer.top).toBeLessThan(m.player!.bottom);
    return;
  }

  // The claim: the whole of the player's box — the frame and the action
  // row under it — is above the sheet's top edge.
  expect(m.player!.bottom).toBeLessThanOrEqual(m.drawer.top + 1);

  if (c.outcome === "capped") {
    // Clear, but not touching: the room under this player is more than
    // `full` itself shows, so `half` stops one strip short of `full`
    // instead of meeting it. Measured against a second build at `full`
    // rather than against the arithmetic that produced it.
    const atFull = await layout(page, {
      width: c.width,
      height: c.height,
      snap: SHEET_SNAP_FULL,
    });
    expect(roomOnScreen(atFull) - roomOnScreen(m)).toBeCloseTo(
      SHEET_PEEK_PX,
      0,
    );
    expect(m.drawer.top).toBeGreaterThan(m.player!.bottom + 1);
    return;
  }

  // The rule: it starts where the player ends, so nothing between them
  // is wasted.
  expect(m.drawer.top).toBeCloseTo(m.player!.bottom, 0);
}

test.describe(PLAYER_GROUPS[0], () => {
  eachPlayerCase(PLAYER_GROUPS[0], async (page, c) => {
    const { m, derived } = await layoutUnderPlayer(page, c);

    // A snap vaul can hold, at every one of the ten, and never one that
    // shows less than the fraction it replaced. `fadeFromIndex` names the
    // first of an ascending pair, and a half at or above full would
    // invert it.
    expect(derived).toBeGreaterThanOrEqual(SHEET_SNAP_HALF_FALLBACK);
    expect(derived).toBeLessThan(SHEET_SNAP_FULL);

    await expectSheetUnderPlayer(page, c, { m, atRest: true });
  });
});

test.describe(PLAYER_GROUPS[1], () => {
  eachPlayerCase(PLAYER_GROUPS[1], async (page, c) => {
    // `position: sticky` is what the reader is promised: scroll the
    // description under the video and the video stays. It is also what
    // makes one measurement good for the whole page — the app derives
    // the snap once and scrolling changes only where the player is
    // drawn. So the scrolled sheet is built at the snap the top of the
    // page produced, which is the number the app would still be holding.
    //
    // The host's `p-4` is in this page, which is the point: a top
    // padding is travel in front of a sticky box, and the stylesheet
    // takes that one side off under `[data-sheet-snap]`. Put it back and
    // the bottom edge below moves by it.
    const top = await layoutUnderPlayer(page, c);
    const scrolled = await layoutUnderPlayer(page, c, {
      snap: top.derived,
      scrollCanvasTo: TO_THE_END,
    });

    // **The hazard**: the app solves `half` once, at the top of the page,
    // and holds that number for the whole of a scroll. A number solved
    // from an edge that then moved would be stale, so the two branches
    // below are the two ways it cannot be — and they are the only two,
    // because the subset asserted beside `TRAVEL_PX` says a pair either
    // travels or derives and never both.
    //
    // Recomputing the derivation from the scrolled edge and comparing it
    // with `top.derived` is *not* what does this, and the earlier version
    // of this case did exactly that: on the nine pairs that do not travel
    // the two edges are the same number, and on the one that does both
    // sides fall back, so the comparison was `0.5 === 0.5` with 62px of
    // slack before it had any content at all.
    const travel = TRAVEL_PX[playerKey(c.width, c.height, c.pLabel)];
    if (travel !== undefined) {
      // Bounded by its containing block: a player taller than what the
      // canvas can show is pulled up with the page's last line, by this
      // much and not merely upwards.
      expect(top.playerBottom - scrolled.playerBottom).toBeCloseTo(travel, 0);

      // And there was nothing to go stale. Asserted as the derivation's
      // own answer at *both* edges rather than as a distance: `null` is
      // "the room here is under the floor I refuse below", which is the
      // branch the top of the page took and the branch the scrolled page
      // still takes. A viewport or a player shape whose travel lifted the
      // room over that floor would return a number here — a snap the app
      // would not be holding — and go red instead of passing quietly.
      for (const edge of [top.playerBottom, scrolled.playerBottom]) {
        expect(
          halfSnapUnderPlayer({
            viewportHeight: c.height,
            playerBottom: edge,
          }),
        ).toBeNull();
      }
      expect(top.derived).toBe(SHEET_SNAP_HALF_FALLBACK);
    } else {
      // The edge did not move, so the number solved from it is the number
      // the scrolled page would solve. There is nothing further to assert
      // here, and recomputing from an edge pinned equal to the one the
      // snap came from would assert nothing.
      expect(scrolled.playerBottom).toBeCloseTo(top.playerBottom, 0);
    }

    await expectSheetUnderPlayer(page, c, { m: scrolled.m, atRest: false });
  });
});

/**
 * The player's own flow position, with nothing under it to hide it.
 *
 * The group above asks the same question of a page that scrolls, and on
 * one it cannot answer: with slack below the player, `position: sticky`
 * pulls a player whose flow position is *above* the scrollport down to
 * the scrollport's edge, so the reading is right whatever the margins
 * did. Deleting the rule that cancels the bleed's negative top margin
 * left every case there green (measured).
 *
 * With `bodyPx: 0` the player is the only thing in the canvas, so sticky
 * has nowhere to travel and no correction to make. What it is drawn at is
 * its flow position, and the two ways that is wrong are both visible:
 *
 *  - the host's `p-4` uncancelled puts it 16px below the edge, which is
 *    travel before it pins;
 *  - the bleed's `-mt-4` uncancelled puts it 16px above, where the top of
 *    the video is behind the page chrome on a page that cannot scroll to
 *    bring it back.
 *
 * The sheet is still drawn, at the snap the page derives, because the
 * shared assertions below are about a page with one on it.
 */
test.describe(PLAYER_GROUPS[2], () => {
  eachPlayerCase(PLAYER_GROUPS[2], async (page, c) => {
    const { m } = await layoutUnderPlayer(page, c, { bodyPx: 0 });

    expect(m.player).not.toBeNull();
    expect(m.canvasTop).not.toBeNull();
    expect(m.playerPosition).toBe("sticky");
    expect(m.player!.top).toBeCloseTo(m.canvasTop!, 0);
    // And there really was nothing under it — which is the property the
    // group needs, and it is not "the canvas cannot scroll": the resting
    // strip's own `padding-bottom` makes the canvas scrollable at some of
    // these viewports with the player as its only content. What the
    // reading above needs is no *slack between the player and the end*,
    // because that is what lets `sticky` correct the player's position
    // and make the comparison right whatever the margins did. So it is
    // the height of the box after the player.
    //
    // "The player's bottom is inside the scrollport" was the first form
    // of this guard and it is inert — true of 40px of slack as well, and
    // measured: at `bodyPx: 40` the group stayed green with the margin
    // rule reverted. This form goes red there.
    expect(m.belowHeight).toBe(0);
  });
});

/**
 * What this replaced, measured.
 *
 * Detector rule 4: the cases above claim the derivation is what puts the
 * sheet where it belongs. Until the fixed `0.5` is shown not to, that is
 * prose. It does not land on the player's edge at any of the ten — it is
 * drawn from the window and knows nothing about what is on the page —
 * and on the pairs named below it covers the player outright, which is
 * the reported defect.
 *
 * The landscape framed pair is in that set and is *also* the pair the
 * derivation hands back to the fixed fraction, so there the two are the
 * same sheet. It is named here rather than skipped: the claim "the fixed
 * half covers this player" is true of it either way.
 */
const FIXED_HALF_COVERS = ["667x375 × a framed player"];
expect(FIXED_HALF_COVERS).toHaveLength(1);

test.describe(PLAYER_GROUPS[3], () => {
  eachPlayerCase(PLAYER_GROUPS[3], async (page, c) => {
    const { m } = await layoutUnderPlayer(page, c, {
      snap: SHEET_SNAP_HALF_FALLBACK,
    });

    if (FIXED_HALF_COVERS.includes(playerKey(c.width, c.height, c.pLabel))) {
      expect(m.player!.bottom).toBeGreaterThan(m.drawer.top);
    } else {
      // Where it does not cover it, it leaves a band of page between the
      // two that the derived snap gives to the sheet — and it never
      // meets the player's edge, which is the whole difference.
      expect(m.drawer.top).toBeGreaterThan(m.player!.bottom + 1);
    }
  });
});

/**
 * The other thing this replaced: the drawer's height in a CSS `vh`.
 *
 * `Drawer.Content` used to be `h-[90vh]`. CSS `vh` is the **large**
 * viewport — the height with the browser's chrome retracted — while
 * every snap point vaul computes is a fraction of `window.innerHeight`,
 * which is the height with the chrome showing. One box, two viewports:
 * the drawer is taller than the arithmetic believes by
 * `SHEET_DRAWER_VH × (lvh − innerHeight)`, and since it is anchored to
 * the bottom edge, its top reaches that much further up — over the
 * player the derivation exists to leave whole.
 *
 * Chromium at a fixed viewport size cannot separate the two units, so
 * the case builds the difference: the same derived snap, with the drawer
 * drawn at `SHEET_DRAWER_VH` of a viewport `URL_BAR_PX` taller. That is
 * exactly what the class resolved to on a phone showing its URL bar, and
 * it is why the component now writes the height in px off
 * `sheetDrawerHeightPx(window.innerHeight)` instead.
 */
test.describe(PLAYER_GROUPS[4], () => {
  eachPlayerCase(PLAYER_GROUPS[4], async (page, c) => {
    const shipped = await layoutUnderPlayer(page, c);
    const asVh = await layoutUnderPlayer(page, c, {
      snap: shipped.derived,
      drawerPx: SHEET_DRAWER_VH * (c.height + URL_BAR_PX),
    });

    // A taller drawer at the same translate reaches further up, by
    // exactly the height it gained. Stated as the difference between two
    // measured boxes, so it holds at every viewport in the list.
    expect(shipped.m.drawer.top - asVh.m.drawer.top).toBeCloseTo(
      SHEET_DRAWER_VH * URL_BAR_PX,
      0,
    );

    if (c.outcome !== "lands") return;

    // And where the shipped sheet lands on the player's edge, the `vh`
    // one is over it. Both halves, so a change that moved them together
    // could not pass.
    expect(asVh.m.drawer.top).toBeLessThan(shipped.playerBottom);
    expect(shipped.m.drawer.top).toBeGreaterThanOrEqual(
      shipped.playerBottom - 1,
    );
  });
});


test("every group ran at every case", () => {
  // The expected side is rebuilt from the two declarations, so it does
  // not follow a loop that has been walked back. Order matters: this is
  // the register in the order the file wrote it.
  expect(registered).toEqual([
    ...GROUPS.flatMap((group) => CASES.map((c) => caseId(group, c))),
    ...PLAYER_GROUPS.flatMap((group) =>
      PLAYER_CASES.map((c) => playerCaseId(group, c)),
    ),
  ]);
});
