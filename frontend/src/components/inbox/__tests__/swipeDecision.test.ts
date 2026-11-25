/**
 * SPEC-CORE-180 I7 — when a released Inbox swipe marks the row done.
 */

import { describe, expect, it } from "vitest";

import {
  SWIPE_FLICK_MIN_PX,
  SWIPE_FLICK_VELOCITY,
  swipeCompletes,
} from "../swipeDecision";

type Input = Parameters<typeof swipeCompletes>[0];

const base: Input = {
  dx: -50,
  dy: 0,
  width: 600,
  elapsedMs: 100,
  swiping: true,
  longPressed: false,
  scrolled: false,
};

const cases: Array<[string, Partial<Input>, boolean]> = [
  // Distance rule: |dx| >= width / 3.
  ["exactly a third of the width, slow", { dx: -200, elapsedMs: 100_000 }, true],
  ["past a third of the width, slow", { dx: -250, elapsedMs: 100_000 }, true],
  ["one pixel short of a third, slow", { dx: -199, elapsedMs: 100_000 }, false],
  ["a third of the width with no swipe flag", { dx: -200, elapsedMs: 100_000, swiping: false }, true],
  ["a third of the width with identical timestamps", { dx: -200, elapsedMs: 0 }, true],
  ["a third of the width with a negative elapsed time", { dx: -200, elapsedMs: -5 }, true],

  // Throw rule: swiping, |dx| >= 32, elapsedMs > 0, |dx| / elapsedMs > 0.11.
  ["a quick flick of 50 px", { dx: -50, elapsedMs: 100 }, true],
  ["a flick of exactly 32 px, fast", { dx: -32, elapsedMs: 10 }, true],
  ["a flick of 31 px, fast", { dx: -31, elapsedMs: 10 }, false],
  ["exactly 0.11 px/ms is not above it", { dx: -110, elapsedMs: 1000 }, false],
  ["just above 0.11 px/ms", { dx: -111, elapsedMs: 1000 }, true],
  ["a slow short swipe (0.05 px/ms)", { dx: -50, elapsedMs: 1000 }, false],
  ["a fast short release with no swipe flag", { dx: -50, elapsedMs: 10, swiping: false }, false],
  ["a fast short release with identical timestamps", { dx: -50, elapsedMs: 0 }, false],
  ["a fast short release with a negative elapsed time", { dx: -50, elapsedMs: -10 }, false],

  // Direction and dominance.
  ["a right swipe past a third", { dx: 250, elapsedMs: 100 }, false],
  ["a right flick", { dx: 50, elapsedMs: 10 }, false],
  ["no horizontal travel", { dx: 0, elapsedMs: 10 }, false],
  ["|dx| equal to |dy|, past a third", { dx: -250, dy: 250, elapsedMs: 100 }, false],
  ["|dx| equal to |dy|, a flick", { dx: -50, dy: -50, elapsedMs: 10 }, false],
  ["|dx| just above |dy|, a flick", { dx: -50, dy: 49, elapsedMs: 10 }, true],
  ["mostly vertical, past a third", { dx: -250, dy: -300, elapsedMs: 100 }, false],

  // Flags that forbid done.
  ["long-pressed, past a third", { dx: -400, longPressed: true }, false],
  ["long-pressed, a flick", { dx: -50, elapsedMs: 10, longPressed: true }, false],
  ["handed to scrolling, past a third", { dx: -400, scrolled: true }, false],
  ["handed to scrolling, a flick", { dx: -50, elapsedMs: 10, scrolled: true }, false],

  // Width boundaries.
  ["a zero-width row with a fast flick", { width: 0, dx: -50, elapsedMs: 10 }, true],
  ["a narrow row, distance rule below 32 px", { width: 60, dx: -20, elapsedMs: 100_000 }, true],
];

describe("SPEC-CORE-180 I7 swipeCompletes", () => {
  it("SPEC-CORE-180 states the flick constants", () => {
    expect(SWIPE_FLICK_VELOCITY).toBe(0.11);
    expect(SWIPE_FLICK_MIN_PX).toBe(32);
  });

  it.each(cases)("SPEC-CORE-180 I7 %s", (_name, overrides, expected) => {
    expect(swipeCompletes({ ...base, ...overrides })).toBe(expected);
  });
});
