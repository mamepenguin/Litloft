/**
 * The snap that puts the sheet's top edge on the player's bottom edge.
 *
 * **This file is arithmetic and nothing else.** jsdom lays nothing out,
 * so it has no opinion about whether the snap it computes actually keeps
 * a player whole — every `getBoundingClientRect()` there is zeros, and a
 * sheet drawn over the video measures exactly like one drawn under it.
 * The relationship `playerBottom ≤ sheetTop` is measured in Chromium, in
 * `e2e-layout/mobile-inspector-sheet.spec.ts`, against the value this
 * function returns.
 *
 * So the expectations below are declared, not derived: each case carries
 * a snap computed by hand from the equation in the docstring, rather
 * than the equation written out a second time — a test that recomputes
 * the implementation is reading one table twice and agrees with any
 * expression at all, including a wrong one (`review-workflow.md`,
 * detector rule 5). The claims that are not literals — the cap, the
 * direction, the floor the derivation refuses, and the ways there is
 * nothing to derive — are stated as properties, which is what they are.
 */
import { describe, it, expect } from "vitest";

import {
  SHEET_DRAWER_VH,
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  halfSnapUnderPlayer,
  sheetDrawerHeightPx,
} from "@/lib/sheetSnap";

/**
 * Three shapes, each a different branch, with the snap written out.
 *
 * Two ordinary players at two viewport heights, and one that reaches the
 * upper bound. A table of the ordinary cases alone would leave the cap
 * unread, and it is where a player far shorter than the screen ends up.
 *
 * The lower end is not in this table because it has no snap: below the
 * room the fixed fraction already gives, the function declines and the
 * caller keeps that fraction. `FALLS_BACK` is where those live.
 */
const CASES = [
  {
    what: "a framed player on a small phone",
    viewportHeight: 667,
    playerBottom: 315,
    snap: 0.627736,
  },
  {
    what: "a taller player on a taller phone",
    viewportHeight: 812,
    playerBottom: 329.25,
    snap: 0.69452,
  },
  {
    what: "a player barely taller than its own controls",
    viewportHeight: 667,
    playerBottom: 100,
    snap: 0.816042,
  },
] as const;
expect(CASES).toHaveLength(3);

/**
 * Where there is no snap to give, by reason.
 *
 * Each row is a different way of having nothing to derive, and the
 * reason is in the row rather than in a comment above the loop, so that
 * deleting a branch of the function leaves one of them naming itself.
 */
const FALLS_BACK = [
  {
    what: "a viewport with no height",
    viewportHeight: 0,
    playerBottom: 300,
  },
  {
    what: "a viewport height that is not a number",
    viewportHeight: Number.NaN,
    playerBottom: 300,
  },
  {
    what: "a viewport with no upper end",
    viewportHeight: Number.POSITIVE_INFINITY,
    playerBottom: 300,
  },
  {
    what: "a rect that never laid out",
    viewportHeight: 667,
    playerBottom: 0,
  },
  {
    what: "a rect above the viewport's own top",
    viewportHeight: 667,
    playerBottom: -20,
  },
  {
    what: "a screen the two bounds do not fit inside",
    viewportHeight: 120,
    playerBottom: 40,
  },
  {
    // A phone held sideways: the stylesheet caps a framed player at the
    // scrollport's own height there, so what is under it is nothing.
    what: "a player that fills the screen",
    viewportHeight: 375,
    playerBottom: 375,
  },
  {
    // And the general form of it, which is the bound rather than that
    // one viewport: less room than the fixed fraction already gives.
    what: "a player leaving less room than the fraction it replaces",
    viewportHeight: 667,
    playerBottom: 450,
  },
] as const;
expect(FALLS_BACK).toHaveLength(8);

/**
 * What the loops registered, recorded after each registration.
 *
 * Written after the `it()` and not before it: a record kept in front of
 * the thing it claims survives anything inserted between the two lines —
 * measured, in the version this replaces, at three of four cases silently
 * dropped with the guard still green.
 */
const ran: string[] = [];

describe("halfSnapUnderPlayer", () => {
  for (const c of CASES) {
    it(`derives ${c.what}`, () => {
      expect(
        halfSnapUnderPlayer({
          viewportHeight: c.viewportHeight,
          playerBottom: c.playerBottom,
        }),
      ).toBeCloseTo(c.snap, 6);
    });
    ran.push(c.what);
  }

  for (const c of FALLS_BACK) {
    it(`has nothing to derive from ${c.what}`, () => {
      expect(
        halfSnapUnderPlayer({
          viewportHeight: c.viewportHeight,
          playerBottom: c.playerBottom,
        }),
      ).toBeNull();
    });
    ran.push(c.what);
  }

  it("ran every case in both tables", () => {
    expect(ran).toEqual([
      ...CASES.map((c) => c.what),
      ...FALLS_BACK.map((c) => c.what),
    ]);
  });

  it("never reaches full, so the two expanded states stay distinguishable", () => {
    // The cap's reason, stated as the thing it buys. A `half` equal to
    // `full` gives vaul two identical snap points: the drag between them
    // moves nothing and the sheet has two names for one state. The
    // shortest player is the case that gets there, so it is the one asked.
    for (const { viewportHeight } of CASES) {
      // One pixel of player: the shortest thing that is still measured.
      const snap = halfSnapUnderPlayer({ viewportHeight, playerBottom: 1 });
      expect(snap).not.toBeNull();
      expect(snap!).toBeLessThan(SHEET_SNAP_FULL);
    }
  });

  it("never gives back less than the fraction it replaces", () => {
    // The bound the landscape regression is about, as a property over
    // every player position rather than at the one viewport that showed
    // it. A derivation that clamped a too-tall player to some floor
    // instead of declining satisfies every literal above and fails here
    // at the positions where that floor is shorter than `half` already
    // was: a 55px sheet, against 150px for the fraction it replaced.
    for (const viewportHeight of [375, 667, 812, 915]) {
      for (let playerBottom = 1; playerBottom < viewportHeight; playerBottom++) {
        const snap = halfSnapUnderPlayer({ viewportHeight, playerBottom });
        if (snap === null) continue;
        expect(snap).toBeGreaterThanOrEqual(SHEET_SNAP_HALF_FALLBACK);
        expect(snap).toBeLessThan(SHEET_SNAP_FULL);
      }
    }
  });

  it("gives a taller player a smaller sheet", () => {
    // The direction, which no single value can show. A derivation that
    // dropped the player term entirely — or inverted it — satisfies every
    // literal above at one height and fails here.
    const at = (playerBottom: number) =>
      halfSnapUnderPlayer({ viewportHeight: 667, playerBottom })!;

    expect(at(200)).toBeGreaterThan(at(300));
    expect(at(300)).toBeGreaterThan(at(400));
  });
});

describe("sheetDrawerHeightPx", () => {
  it("is the drawer's fraction of the viewport vaul reads", () => {
    // The component writes this on `Drawer.Content` and the derivation
    // uses it as one of its two terms. One function so the two cannot be
    // in different viewports, which is what a `vh` class made them:
    // `MobileInspectorSheet.test.tsx` holds the element to this value and
    // to carrying no viewport unit of its own.
    for (const viewportHeight of [375, 667, 915]) {
      expect(sheetDrawerHeightPx(viewportHeight)).toBeCloseTo(
        SHEET_DRAWER_VH * viewportHeight,
        6,
      );
    }
  });
});

describe("the constants the derivation is written in", () => {
  it("keeps the drawer's height and full's snap as two numbers", () => {
    // They carry the same digits today and are different quantities: one
    // is how tall `Drawer.Content` is, the other is how far up a snap
    // point brings it. This is here so that a reader who notices the
    // coincidence does not remove one of them.
    expect(SHEET_DRAWER_VH).toBe(0.9);
    expect(SHEET_SNAP_FULL).toBe(0.9);
  });

  it("keeps the fallback below full and above nothing", () => {
    expect(SHEET_SNAP_HALF_FALLBACK).toBeGreaterThan(0);
    expect(SHEET_SNAP_HALF_FALLBACK).toBeLessThan(SHEET_SNAP_FULL);
  });

  it("bounds the room by the resting strip's own height", () => {
    expect(SHEET_PEEK_PX).toBe(56);
  });
});
