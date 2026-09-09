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
  SHEET_PEEK_PX,
  SHEET_SNAP_HALF_FALLBACK,
  halfSnapUnderPlayer,
} from "../src/lib/sheetSnap";

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
  player: Rect | null;
  playerPosition: string | null;
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
    buildPage: (spec: { playerPx: number; bodyPx: number }) => void;
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
 * lands is stated against the player's own measured box and against a
 * second measurement of the sheet at `full`; the only literal is
 * `SHEET_PEEK_PX`, which is the unit both bounds are expressed in.
 *
 * The sheet's top edge is the *drawer's* border-box top. The visible box
 * inside it begins one border lower — `100%` resolves against the
 * content box — which is the same border the C cases account for.
 */

/**
 * What is at the top of the canvas, by shape.
 *
 * Three aspect ratios and one player that has no ratio at all. The three
 * are what a video library actually holds, and the fourth is the case
 * where the room under the player is more than the sheet may take.
 */
const PLAYERS = [
  { label: "16:9", px: (width: number) => (width * 9) / 16 },
  { label: "4:3", px: (width: number) => (width * 3) / 4 },
  { label: "9:16 shot on a phone", px: (width: number) => (width * 16) / 9 },
  // A control bar and nothing above it. Not a ratio, which is the point:
  // its height does not follow the width, so it is short at every
  // viewport and the room under it is more than `full` itself shows.
  { label: "an audio bar", px: () => 54 },
] as const;
expect(PLAYERS).toHaveLength(4);

/**
 * What each pair is expected to do, declared by name.
 *
 * Three outcomes, and two of them are the bounds rather than the rule —
 * so they are written out here instead of being computed from the
 * measurement. A rule derived from what was observed moves with it and
 * can never disagree with it (`review-workflow.md`, detector rule 5),
 * and these two sets are exactly where D's headline claim is *not* true.
 *
 * - `floored`: a portrait clip is taller than a small phone's screen less
 *   the room the sheet must keep, so no snap clears it. The sheet takes
 *   the least there is — one resting strip — rather than a fraction that
 *   happens to look reasonable.
 * - `capped`: the room under the player is more than `full` shows, so
 *   `half` would meet or pass `full` and the drag between the two states
 *   would move nothing. It stops one strip short of `full` instead.
 *
 * Everything not named here lands the sheet's top edge on the player's
 * bottom edge, which is the rule.
 */
const FLOORED = ["667 × 9:16 shot on a phone", "745 × 9:16 shot on a phone"];
const CAPPED = [
  "667 × an audio bar",
  "745 × an audio bar",
  "812 × an audio bar",
  "915 × an audio bar",
];
expect(FLOORED).toHaveLength(2);
expect(CAPPED).toHaveLength(4);

type Outcome = "lands" | "floored" | "capped";

interface PlayerCase {
  height: number;
  hLabel: string;
  playerPx: number;
  pLabel: string;
  outcome: Outcome;
}

const PLAYER_CASES: PlayerCase[] = HEIGHTS.flatMap(({ height, label: hLabel }) =>
  PLAYERS.map(({ label: pLabel, px }) => {
    const key = `${height} × ${pLabel}`;
    return {
      height,
      hLabel,
      playerPx: px(WIDTH),
      pLabel,
      outcome: FLOORED.includes(key)
        ? ("floored" as const)
        : CAPPED.includes(key)
          ? ("capped" as const)
          : ("lands" as const),
    };
  }),
);
expect(PLAYER_CASES).toHaveLength(16);
// Named per outcome, so a pair silently changing class is red here
// rather than passing under whichever branch it landed in.
expect(PLAYER_CASES.filter((c) => c.outcome === "lands")).toHaveLength(10);
expect(PLAYER_CASES.filter((c) => c.outcome === "floored")).toHaveLength(2);
expect(PLAYER_CASES.filter((c) => c.outcome === "capped")).toHaveLength(4);

const PLAYER_GROUPS = [
  "the sheet's derived half against the player it sits under",
  "and the same after the page behind it has been scrolled",
  "replaced: the fixed half does not know the player is there",
] as const;
expect(PLAYER_GROUPS).toHaveLength(3);

const playerCaseId = (group: string, c: PlayerCase) =>
  `${group} — ${c.height}px with ${c.pLabel}`;

function eachPlayerCase(
  group: string,
  body: (page: import("@playwright/test").Page, c: PlayerCase) => Promise<void>,
): void {
  for (const c of PLAYER_CASES) {
    registered.push(playerCaseId(group, c));
    test(`${c.height}px (${c.hLabel}) with ${c.pLabel}`, async ({ page }) => {
      await body(page, c);
    });
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
  { height, playerPx }: { height: number; playerPx: number },
  { snap, scrollCanvasTo }: { snap?: number; scrollCanvasTo?: number } = {},
): Promise<{ m: Measurement; derived: number; playerBottom: number }> {
  await page.setViewportSize({ width: WIDTH, height });
  await page.evaluate((spec) => window.buildPage(spec), {
    playerPx,
    bodyPx: height * 2,
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

  const m = await layout(page, { height, snap: snap ?? derived });
  return { m, derived, playerBottom };
}

/** The room the sheet has on screen, border included, at one snap. */
const roomOnScreen = (m: Measurement) => m.visible!.height + m.drawerBorderTop;

/**
 * What every case asserts about a sheet built at the derived snap.
 *
 * Split out because the scrolled group asserts exactly the same thing
 * about exactly the same sixteen pairs, and a second copy is a second
 * place for one of the three outcomes to quietly go missing.
 */
async function expectSheetUnderPlayer(
  page: import("@playwright/test").Page,
  c: PlayerCase,
  { m }: { m: Measurement },
): Promise<void> {
  expect(m.player).not.toBeNull();
  expect(m.visible).not.toBeNull();
  // A real box, or "it is above the sheet" would be true of nothing.
  expect(m.player!.height).toBeGreaterThan(0);
  // The premise: the player is stuck to the top of the canvas, which is
  // what makes one measurement good for the whole of a scroll.
  expect(m.playerPosition).toBe("sticky");
  // Never less than the strip it replaced, whatever the outcome.
  expect(roomOnScreen(m)).toBeGreaterThanOrEqual(SHEET_PEEK_PX - 1);
  expect(m.visible!.bottom).toBeCloseTo(c.height, 0);

  if (c.outcome === "floored") {
    // No snap clears this player. The sheet gives up everything it can.
    expect(roomOnScreen(m)).toBeCloseTo(SHEET_PEEK_PX, 0);
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
    const atFull = await layout(page, { height: c.height, snap: 0.9 });
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

    // A snap vaul can hold, at every one of the sixteen. `fadeFromIndex`
    // names the first of an ascending pair, and a half at or above full
    // would invert it.
    expect(derived).toBeGreaterThan(0);
    expect(derived).toBeLessThan(0.9);

    await expectSheetUnderPlayer(page, c, { m });
  });
});

test.describe(PLAYER_GROUPS[1], () => {
  eachPlayerCase(PLAYER_GROUPS[1], async (page, c) => {
    // `position: sticky` is what the reader is promised: scroll the
    // description under the video and the video stays. It is also what
    // makes one measurement good for the whole page — the app derives
    // the snap once, from a `ResizeObserver` that watches the player's
    // *size*, and scrolling changes only where it is drawn. So the
    // scrolled sheet is built at the snap the top of the page produced,
    // which is the number the app would still be holding.
    const top = await layoutUnderPlayer(page, c);
    const scrolled = await layoutUnderPlayer(page, c, {
      snap: top.derived,
      scrollCanvasTo: TO_THE_END,
    });

    if (c.outcome === "floored") {
      // **The one shape that does travel, and it is the same set.**
      // Sticky is bounded by its containing block, so at the end of the
      // scroll a player taller than what the canvas can show is pulled
      // up with the page's last line. That happens exactly when the
      // player leaves less than a resting strip of room — the canvas
      // ends `SHEET_PEEK_PX` above the fold so the strip does not bury
      // it — which is the same condition that floors the snap. The two
      // sets coincide by construction, not by luck, so `FLOORED` names
      // both.
      expect(scrolled.playerBottom).toBeLessThan(top.playerBottom);
    } else {
      expect(scrolled.playerBottom).toBeCloseTo(top.playerBottom, 0);
    }

    await expectSheetUnderPlayer(page, c, { m: scrolled.m });
  });
});

/**
 * What this replaced, measured.
 *
 * Detector rule 4: the cases above claim the derivation is what puts the
 * sheet where it belongs. Until the fixed `0.5` is shown not to, that is
 * prose. It does not land on the player's edge at any of the sixteen —
 * it is drawn from the window and knows nothing about what is on the
 * page — and on the portrait pairs it covers the player outright, which
 * is the reported defect.
 */
const FIXED_HALF_COVERS = [
  "667 × 9:16 shot on a phone",
  "745 × 9:16 shot on a phone",
  "812 × 9:16 shot on a phone",
  "915 × 9:16 shot on a phone",
];
expect(FIXED_HALF_COVERS).toHaveLength(4);

test.describe(PLAYER_GROUPS[2], () => {
  eachPlayerCase(PLAYER_GROUPS[2], async (page, c) => {
    const { m } = await layoutUnderPlayer(page, c, {
      snap: SHEET_SNAP_HALF_FALLBACK,
    });

    // It never meets the player's edge — that is the whole difference.
    expect(Math.abs(m.drawer.top - m.player!.bottom)).toBeGreaterThan(1);

    if (FIXED_HALF_COVERS.includes(`${c.height} × ${c.pLabel}`)) {
      expect(m.player!.bottom).toBeGreaterThan(m.drawer.top);
    } else {
      // And where it does not cover it, it leaves a band of page between
      // the two that the derived snap gives to the sheet.
      expect(m.drawer.top).toBeGreaterThan(m.player!.bottom + 1);
    }
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
