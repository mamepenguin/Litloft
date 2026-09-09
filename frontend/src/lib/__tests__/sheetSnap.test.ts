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
 * detector rule 5). The three claims that are not literals — the cap,
 * the direction, and the two ways there is nothing to derive — are
 * stated as properties, which is what they are.
 */
import { describe, it, expect } from "vitest";

import {
  SHEET_DRAWER_VH,
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  halfSnapUnderPlayer,
} from "@/lib/sheetSnap";

/**
 * Four shapes, each a different branch, with the snap written out.
 *
 * The first two are ordinary players at two viewport heights and two
 * aspect ratios; the last two are the ends the room is clamped at. A
 * table of the ordinary cases alone would leave both clamps unread, and
 * they are where a player that does not fit the screen ends up.
 */
const CASES = [
  {
    what: "a 16:9 player on a small phone",
    viewportHeight: 667,
    playerBottom: 315,
    snap: 0.627736,
  },
  {
    what: "a 4:3 player on a taller phone",
    viewportHeight: 812,
    playerBottom: 329.25,
    snap: 0.694520,
  },
  {
    what: "a player whose foot is already past the fold",
    viewportHeight: 667,
    playerBottom: 800,
    snap: 0.183958,
  },
  {
    what: "a player barely taller than its own controls",
    viewportHeight: 667,
    playerBottom: 100,
    snap: 0.816042,
  },
] as const;
expect(CASES).toHaveLength(4);

/** What the loop registered, so walking it back disagrees with `CASES`. */
const ran: string[] = [];

describe("halfSnapUnderPlayer", () => {
  for (const c of CASES) {
    ran.push(c.what);
    it(`derives ${c.what}`, () => {
      expect(
        halfSnapUnderPlayer({
          viewportHeight: c.viewportHeight,
          playerBottom: c.playerBottom,
        }),
      ).toBeCloseTo(c.snap, 6);
    });
  }

  it("ran every case in the table", () => {
    expect(ran).toEqual(CASES.map((c) => c.what));
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

  it("gives a taller player a smaller sheet", () => {
    // The direction, which no single value can show. A derivation that
    // dropped the player term entirely — or inverted it — satisfies every
    // literal above at one height and fails here.
    const at = (playerBottom: number) =>
      halfSnapUnderPlayer({ viewportHeight: 667, playerBottom })!;

    expect(at(200)).toBeGreaterThan(at(300));
    expect(at(300)).toBeGreaterThan(at(400));
  });

  it("has nothing to derive from a viewport with no height", () => {
    // Before the first layout, and in the environments where
    // `innerHeight` is 0. The caller falls back rather than snapping the
    // sheet to a number computed from nothing.
    for (const viewportHeight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        halfSnapUnderPlayer({ viewportHeight, playerBottom: 300 }),
      ).toBeNull();
    }
  });

  it("has nothing to derive from a rect that never laid out", () => {
    // Zero is the one that matters, and it is not the same as "a very
    // short player": an unpainted subtree measures `bottom: 0`, and a
    // room of the whole window clamps to a sheet that covers the player
    // it exists to stay under. The fallback is the honest answer.
    for (const playerBottom of [0, -20, Number.NaN]) {
      expect(
        halfSnapUnderPlayer({ viewportHeight: 667, playerBottom }),
      ).toBeNull();
    }
  });

  it("has nothing to derive on a screen the two bounds do not fit inside", () => {
    // Not a phone, but it is what `viewportHeight` reads as while a tab
    // is being restored or a window is being dragged to nothing. The
    // room the sheet may take is bounded below by a peek row and above by
    // full's own room less another one, and under ~140px those bounds
    // cross.
    expect(
      halfSnapUnderPlayer({ viewportHeight: 120, playerBottom: 40 }),
    ).toBeNull();
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
