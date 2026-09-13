/**
 * The mobile Bottom Sheet, measured in Chromium.
 *
 * vaul is not running: this page reproduces its arithmetic —
 * `--snap-point-height` is `innerHeight × (1 − snap)` — and sets the
 * variable and the transform itself.
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


/** `peek` is not among them — the drawer is not mounted there at all. */
const SNAPS = [
  { snap: 0.5, label: "half" },
  { snap: 0.9, label: "full" },
] as const;

/**
 * The landscape entry is the only viewport where a framed player leaves
 * less room than the sheet's fixed fraction, which is the branch that hands
 * the fixed fraction back.
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
   * Overrides the drawer's height, which the fixture otherwise derives from
   * `window.innerHeight` like the component does.
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
 * `bodyPx` defaults to twice the viewport, which is longer than the
 * tallest sheet any snap produces, so the end is below the fold before
 * scrolling by construction.
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
 * Pushed after `test()` registers, never before: a record written first
 * survives a `continue`, `throw` or conditional that drops the
 * registration.
 */
const registered: string[] = [];

const caseKey = (c: Case) => `${c.width}x${c.height} at ${c.sLabel}`;
const caseId = (group: string, c: Case) => `${group} — ${caseKey(c)}`;

/**
 * Every body in this file builds its last sheet at its case's own snap,
 * so the variable on the drawer is the case's.
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

      const drove = await droveViewport(page);
      expect(drove.width).toBe(c.width);
      expect(drove.height).toBe(c.height);
      expect(drove.snap).toBeCloseTo(c.snap, 3);
    });
    registered.push(caseId(group, c));
  }
}

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

    expect(m.snapPointHeight).toBeCloseTo(height * (1 - snap), 0);

    expect(m.drawer.bottom).toBeGreaterThan(height);
    expect(m.drawer.bottom - height).toBeCloseTo(m.snapPointHeight, 0);

    // `100%` resolves against the content box, so the border lands above
    // the visible box. It is the *surface's* border — the drawer is
    // unpainted, so that a content pull can translate the surface alone.
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
    const m = await layout(page, { width, height, snap });
    expect(m.drawer.height).toBeCloseTo(sheetDrawerHeightPx(m.viewportHeight), 0);
    expect(m.viewportHeight).toBe(height);
  });
});

test.describe(GROUPS[2], () => {
  eachCase(GROUPS[2], async (page, { width, height, snap }) => {
    const before = await layout(page, { width, height, snap });

    // A scroller whose content already fitted would satisfy "the end is
    // visible" without anything having scrolled.
    expect(before.end.top).toBeGreaterThan(height);
    expect(before.maxScroll).toBeGreaterThan(0);

    const after = await layout(page, { width, height, snap }, TO_THE_END);

    expect(after.scrollTop).toBeCloseTo(after.maxScroll, 0);
    expect(after.end.bottom).toBeLessThanOrEqual(height + 1);
    expect(after.end.top).toBeGreaterThanOrEqual(0);
  });
});

test.describe(GROUPS[3], () => {
  eachCase(GROUPS[3], async (page, { width, height, snap }) => {
    const m = await layout(page, { width, height, snap });

    // Named, not counted: the two-tier form also has exactly one scrolling
    // box — the wrong one.
    expect(m.verticallyScrollable).toEqual(["mobile-inspector-content"]);
  });
});

test.describe(GROUPS[4], () => {
  eachCase(GROUPS[4], async (page, { width, height, snap }) => {
    // A header taller than the whole visible sheet, which at `half` is
    // the file page's real shape: the strip starts below the fold.
    const spec = { width, height, snap, headerPx: height };

    const rest = await layout(page, spec);
    expect(rest.stripTopInScroller).toBeGreaterThan(rest.scroller.height);

    const scrolled = await layout(page, spec, TO_THE_END);
    expect(scrolled.stripPosition).toBe("sticky");
    expect(scrolled.stripTopInScroller).toBeCloseTo(0, 0);
    expect(scrolled.headerTopInScroller).toBeLessThan(0);
    expect(scrolled.strip.top).toBeGreaterThanOrEqual(0);
    expect(scrolled.strip.bottom).toBeLessThanOrEqual(height + 1);
    // Opaque, or the tab body travels visibly through it.
    expect(scrolled.stripBackground).not.toBe("rgba(0, 0, 0, 0)");
    // The tab body is positioned, and two positioned boxes at
    // `z-index: auto` paint in document order, which puts the panel on top.
    expect(scrolled.bodyPosition).toBe("relative");
    expect(scrolled.stripHit).toBe("inspector-tabs");
  });
});

test.describe(GROUPS[5], () => {
  eachCase(GROUPS[5], async (page, { width, height, snap }) => {
    const m = await layout(page, { width, height, snap, headerPx: 40 });
    expect(m.strip.bottom).toBeLessThanOrEqual(height + 1);
    expect(m.stripTopInScroller).toBeCloseTo(40, 0);
  });
});

/**
 * Where the `shrink-0` header and tab strip are taller than the whole
 * visible sheet, the two-tier form overflows the sheet's own scroller as
 * well as the panel.
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
      expect(m.verticallyScrollable).toEqual(["inspector-panel"]);
      expect(m.maxScroll).toBe(0);
    }
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

    // A cap of the snap's own fraction is short by everything above the
    // scroller — the handle, and the drawer's top edge.
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

// `halfSnapUnderPlayer` is handed the player's *measured* bottom edge: a
// fixture that recomputed the arithmetic in the browser would agree with
// any derivation at all, including one that ignored the player.

/**
 * A framed player is 16:9 whatever the file is — a portrait clip is
 * letterboxed inside the frame — so a `9:16` or `4:3` wrapper is a shape
 * this page cannot draw. An audio bar has no ratio and is short at every
 * viewport.
 */
const PLAYERS = [
  { label: "a framed player", framed: true, px: 0 },
  { label: "an audio bar", framed: false, px: 54 },
] as const;
expect(PLAYERS).toHaveLength(2);
expect(PLAYERS.filter((p) => p.framed)).toHaveLength(1);

/**
 * Declared, not derived from the measurement.
 *
 * - `capped`: the room under the player is more than `full` shows, so
 *   `half` stops one strip short of `full` instead.
 * - `fallback`: the player leaves less room than the fixed fraction, so
 *   `half` is that fixed fraction again.
 *
 * Everything not named here lands the sheet's top edge on the player's
 * bottom edge.
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
expect(PLAYER_CASES.filter((c) => c.outcome === "lands")).toHaveLength(4);
expect(PLAYER_CASES.filter((c) => c.outcome === "capped")).toHaveLength(5);
expect(PLAYER_CASES.filter((c) => c.outcome === "fallback")).toHaveLength(1);

/**
 * Pairs whose player is pulled up at the end of the scroll, and by how far.
 *
 * Sticky travels only inside its containing block, so where that block
 * ends before the scroll does, its last line drags the player up. That is
 * not the same as "the player is taller than the scrollport": the page
 * reserves room under it for the resting strip.
 */
const TRAVEL_PX: Record<string, number> = {
  "667x375 × a framed player": 88,
};
expect(Object.keys(TRAVEL_PX)).toHaveLength(1);

/**
 * A travelling pair that also derived a snap would hold a stale snap, so
 * every travelling pair must be a `fallback` pair.
 */
expect(Object.keys(TRAVEL_PX).filter((k) => !FALLBACK.includes(k))).toEqual([]);

/**
 * A phone's URL bar, as an input: the difference between the large
 * viewport a CSS `vh` resolves against and the `window.innerHeight` vaul
 * solves its snaps in. 80px is in the range iOS Safari and Chrome on
 * Android use; Chromium at a fixed viewport size cannot produce it.
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
  for (const c of PLAYER_CASES) {
    test(`${c.width}x${c.height} (${c.hLabel}) with ${c.pLabel}`, async ({
      page,
    }) => {
      await body(page, c);

      // The snap is not read here, unlike `eachCase`: these groups also
      // build at `full` and at the fixed fraction, so the last sheet
      // standing is not the case's.
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

/** In the app's own order: the snap is a function of a measurement. */
async function layoutUnderPlayer(
  page: import("@playwright/test").Page,
  { width, height, playerPx, framed }: PlayerCase,
  {
    snap,
    scrollCanvasTo,
    drawerPx,
    // Zero is not a smaller version of the same page: it takes away the
    // slack `position: sticky` needs to correct anything, which makes the
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

async function expectSheetUnderPlayer(
  page: import("@playwright/test").Page,
  c: PlayerCase,
  { m, atRest }: { m: Measurement; atRest: boolean },
): Promise<void> {
  expect(m.player).not.toBeNull();
  expect(m.visible).not.toBeNull();
  // A real box, or "it is above the sheet" would be true of nothing.
  expect(m.player!.height).toBeGreaterThan(0);
  expect(m.playerPosition).toBe("sticky");

  // The fixture draws both a top padding on the host and a negative top
  // margin on the player's first child; this says the stylesheet cancels
  // both. Only at rest: at the end of a scroll the containing block can
  // pull a sticky box back up, which `TRAVEL_PX` declares.
  if (atRest) {
    expect(m.canvasTop).not.toBeNull();
    expect(m.player!.top).toBeCloseTo(m.canvasTop!, 0);
  }

  if (c.framed) {
    expect(m.canvasClientHeight).not.toBeNull();
    expect(m.player!.height).toBeLessThanOrEqual(m.canvasClientHeight! + 1);
  }
  expect(m.visible!.bottom).toBeCloseTo(c.height, 0);

  // Measured against a second build at the fixed fraction rather than
  // against the arithmetic.
  const atFixedHalf = await layout(page, {
    width: c.width,
    height: c.height,
    snap: SHEET_SNAP_HALF_FALLBACK,
  });
  expect(roomOnScreen(m)).toBeGreaterThanOrEqual(roomOnScreen(atFixedHalf) - 1);

  if (c.outcome === "fallback") {
    // Exactly the fixed fraction, and it does *not* clear the player: a
    // derivation that kept deriving here would pass the bound above and
    // fail the equality.
    expect(roomOnScreen(m)).toBeCloseTo(roomOnScreen(atFixedHalf), 0);
    expect(m.drawer.top).toBeLessThan(m.player!.bottom);
    return;
  }

  expect(m.player!.bottom).toBeLessThanOrEqual(m.drawer.top + 1);

  if (c.outcome === "capped") {
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

  expect(m.drawer.top).toBeCloseTo(m.player!.bottom, 0);
}

test.describe(PLAYER_GROUPS[0], () => {
  eachPlayerCase(PLAYER_GROUPS[0], async (page, c) => {
    const { m, derived } = await layoutUnderPlayer(page, c);

    // `fadeFromIndex` names the first of an ascending pair, and a half at
    // or above full would invert it.
    expect(derived).toBeGreaterThanOrEqual(SHEET_SNAP_HALF_FALLBACK);
    expect(derived).toBeLessThan(SHEET_SNAP_FULL);

    await expectSheetUnderPlayer(page, c, { m, atRest: true });
  });
});

test.describe(PLAYER_GROUPS[1], () => {
  eachPlayerCase(PLAYER_GROUPS[1], async (page, c) => {
    // The app derives the snap once, at the top of the page, so the
    // scrolled sheet is built at that number.
    const top = await layoutUnderPlayer(page, c);
    const scrolled = await layoutUnderPlayer(page, c, {
      snap: top.derived,
      scrollCanvasTo: TO_THE_END,
    });

    // Recomputing the derivation from the scrolled edge and comparing it
    // with `top.derived` asserts nothing: where the edge does not move the
    // two are equal, and where it does both sides fall back.
    const travel = TRAVEL_PX[playerKey(c.width, c.height, c.pLabel)];
    if (travel !== undefined) {
      expect(top.playerBottom - scrolled.playerBottom).toBeCloseTo(travel, 0);

      // `null` at both edges: the travel never lifted the room over the
      // derivation's floor, so there was no derived snap to go stale.
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
      expect(scrolled.playerBottom).toBeCloseTo(top.playerBottom, 0);
    }

    await expectSheetUnderPlayer(page, c, { m: scrolled.m, atRest: false });
  });
});

/**
 * With slack below the player, `position: sticky` pulls a player whose
 * flow position is above the scrollport down to its edge, so the reading
 * is right whatever the margins did. With `bodyPx: 0` there is nothing to
 * correct, and the drawn position is the flow position.
 */
test.describe(PLAYER_GROUPS[2], () => {
  eachPlayerCase(PLAYER_GROUPS[2], async (page, c) => {
    const { m } = await layoutUnderPlayer(page, c, { bodyPx: 0 });

    expect(m.player).not.toBeNull();
    expect(m.canvasTop).not.toBeNull();
    expect(m.playerPosition).toBe("sticky");
    expect(m.player!.top).toBeCloseTo(m.canvasTop!, 0);
    // Not "the canvas cannot scroll" — the resting strip's `padding-bottom`
    // can make it scrollable with the player as its only content. What the
    // reading needs is no slack after the player, and "the player's bottom
    // is inside the scrollport" is true of some slack as well.
    expect(m.belowHeight).toBe(0);
  });
});

/**
 * The landscape framed pair is also the pair the derivation hands back to
 * the fixed fraction, so there the two are the same sheet.
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
      expect(m.drawer.top).toBeGreaterThan(m.player!.bottom + 1);
    }
  });
});

/**
 * CSS `vh` is the large viewport, while every snap vaul computes is a
 * fraction of `window.innerHeight`. Chromium at a fixed viewport size
 * cannot separate the two, so the case draws the drawer at
 * `SHEET_DRAWER_VH` of a viewport `URL_BAR_PX` taller.
 */
test.describe(PLAYER_GROUPS[4], () => {
  eachPlayerCase(PLAYER_GROUPS[4], async (page, c) => {
    const shipped = await layoutUnderPlayer(page, c);
    const asVh = await layoutUnderPlayer(page, c, {
      snap: shipped.derived,
      drawerPx: SHEET_DRAWER_VH * (c.height + URL_BAR_PX),
    });

    expect(shipped.m.drawer.top - asVh.m.drawer.top).toBeCloseTo(
      SHEET_DRAWER_VH * URL_BAR_PX,
      0,
    );

    if (c.outcome !== "lands") return;

    expect(asVh.m.drawer.top).toBeLessThan(shipped.playerBottom);
    expect(shipped.m.drawer.top).toBeGreaterThanOrEqual(
      shipped.playerBottom - 1,
    );
  });
});


test.describe("no row of the tab body shows above the stuck strip", () => {
  test.use({ deviceScaleFactor: 3 });

  /**
   * The same band screenshotted with the tab body painted and with it
   * hidden: any difference is the body showing through.
   */
  async function bandAboveStrip(
    page: import("@playwright/test").Page,
    spec: Spec,
  ): Promise<{ painted: Buffer; hidden: Buffer }> {
    const m = await layout(page, spec, TO_THE_END);
    expect(m.stripPosition).toBe("sticky");
    const body = page.locator("[data-testid='inspector-panel'] > div").first();
    const clip = {
      x: 0,
      y: Math.floor(m.strip.top) - 1,
      width: spec.width,
      height: 4,
    };
    await body.evaluate((el) => {
      (el as HTMLElement).style.background = "#ff00ff";
    });
    const painted = await page.screenshot({ clip, animations: "disabled" });
    await body.evaluate((el) => {
      (el as HTMLElement).style.visibility = "hidden";
    });
    const hidden = await page.screenshot({ clip, animations: "disabled" });
    return { painted, hidden };
  }

  test("375x812 at full", async ({ page }) => {
    const { painted, hidden } = await bandAboveStrip(page, {
      width: 375,
      height: 812,
      snap: 0.9,
      headerPx: 812,
    });
    expect(painted.equals(hidden)).toBe(true);
  });

  test("375x667 at half, on a fractional scroller top", async ({ page }) => {
    const { painted, hidden } = await bandAboveStrip(page, {
      width: 375,
      height: 667,
      snap: 0.5,
      headerPx: 667,
      drawerPx: 667 * 0.9 + 0.37,
    });
    expect(painted.equals(hidden)).toBe(true);
  });
});

test("every group ran at every case", () => {
  // The expected side is rebuilt from the declarations, so it does not
  // follow a loop that has been walked back.
  expect(registered).toEqual([
    ...GROUPS.flatMap((group) => CASES.map((c) => caseId(group, c))),
    ...PLAYER_GROUPS.flatMap((group) =>
      PLAYER_CASES.map((c) => playerCaseId(group, c)),
    ),
  ]);
});
