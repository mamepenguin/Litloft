/**
 * The expected snaps are computed by hand rather than recomputed from the
 * equation: a test that recomputes the implementation agrees with any
 * expression, including a wrong one.
 */
import { describe, it, expect } from "vitest";

import {
  SHEET_DRAWER_VH,
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  halfSnapUnderPlayer,
  sheetDrawerHeightPx,
  sheetTopAtSnap,
} from "@/lib/sheetSnap";

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
    what: "a player that fills the screen",
    viewportHeight: 375,
    playerBottom: 375,
  },
  {
    what: "a player leaving less room than the fraction it replaces",
    viewportHeight: 667,
    playerBottom: 450,
  },
] as const;
expect(FALLS_BACK).toHaveLength(8);

/**
 * Pushed after each `it()` and not before it: a record kept in front of the
 * thing it claims survives anything inserted between the two lines.
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
    for (const { viewportHeight } of CASES) {
      const snap = halfSnapUnderPlayer({ viewportHeight, playerBottom: 1 });
      expect(snap).not.toBeNull();
      expect(snap!).toBeLessThan(SHEET_SNAP_FULL);
    }
  });

  it("never gives back less than the fraction it replaces", () => {
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
    const at = (playerBottom: number) =>
      halfSnapUnderPlayer({ viewportHeight: 667, playerBottom })!;

    expect(at(200)).toBeGreaterThan(at(300));
    expect(at(300)).toBeGreaterThan(at(400));
  });
});

describe("sheetDrawerHeightPx", () => {
  it("is the drawer's fraction of the viewport vaul reads", () => {
    for (const viewportHeight of [375, 667, 915]) {
      expect(sheetDrawerHeightPx(viewportHeight)).toBeCloseTo(
        SHEET_DRAWER_VH * viewportHeight,
        6,
      );
    }
  });
});

describe("sheetTopAtSnap", () => {
  it("is where the sheet's top edge rests at a snap", () => {
    expect(sheetTopAtSnap(1000, 0.5)).toBeCloseTo(600, 6);
    expect(sheetTopAtSnap(1000, 0.9)).toBeCloseTo(200, 6);
  });
});

describe("the constants the derivation is written in", () => {
  it("keeps the drawer's height and full's snap as two numbers", () => {
    // Same digits, different quantities: one is how tall `Drawer.Content` is,
    // the other is how far up a snap point brings it.
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
