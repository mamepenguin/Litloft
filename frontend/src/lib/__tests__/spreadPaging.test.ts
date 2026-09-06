import { describe, expect, it } from "vitest";

import {
  canPageBack,
  canPageForward,
  halfLabel,
  isOnFirstHalf,
  isSpreadActive,
  pageBack,
  pageForward,
  type SpreadState,
} from "../spreadPaging";

function state(over: Partial<SpreadState> = {}): SpreadState {
  return {
    index: 1,
    count: 3,
    splitMode: true,
    readingDirection: "ltr",
    isCurrentLandscape: true,
    showRightHalf: false,
    ...over,
  };
}

describe("spread activation", () => {
  it("needs the mode and a landscape page, not either alone", () => {
    expect(isSpreadActive(state())).toBe(true);
    expect(isSpreadActive(state({ splitMode: false }))).toBe(false);
    expect(isSpreadActive(state({ isCurrentLandscape: false }))).toBe(false);
  });

  it("reads the first half in reading order, not screen order", () => {
    // The distinction the whole feature turns on: right-to-left starts
    // on the right half, so `showRightHalf` means opposite things.
    expect(isOnFirstHalf(state({ readingDirection: "ltr", showRightHalf: false }))).toBe(true);
    expect(isOnFirstHalf(state({ readingDirection: "ltr", showRightHalf: true }))).toBe(false);
    expect(isOnFirstHalf(state({ readingDirection: "rtl", showRightHalf: true }))).toBe(true);
    expect(isOnFirstHalf(state({ readingDirection: "rtl", showRightHalf: false }))).toBe(false);
  });

  it("labels the halves only while a spread is active", () => {
    expect(halfLabel(state())).toBe("A");
    expect(halfLabel(state({ showRightHalf: true }))).toBe("B");
    expect(halfLabel(state({ splitMode: false }))).toBeNull();
    expect(halfLabel(state({ isCurrentLandscape: false }))).toBeNull();
  });
});

describe("turning a page", () => {
  it("moves the half before it moves the page", () => {
    expect(pageForward(state({ index: 0, showRightHalf: false }))).toEqual({
      index: 0,
      showRightHalf: true,
    });
    expect(pageForward(state({ index: 0, showRightHalf: true }))).toEqual({
      index: 1,
      showRightHalf: false,
    });
  });

  it("lands on the far half of the page it goes back to", () => {
    // Going back from the first half of page 1 lands on page 0's *last*
    // half, which is the right one when reading left-to-right.
    expect(pageBack(state({ index: 1, showRightHalf: false }))).toEqual({
      index: 0,
      showRightHalf: true,
    });
  });

  it("mirrors both turns when reading right to left", () => {
    const rtl = { readingDirection: "rtl" as const };
    expect(pageForward(state({ ...rtl, index: 0, showRightHalf: true }))).toEqual({
      index: 0,
      showRightHalf: false,
    });
    expect(pageForward(state({ ...rtl, index: 0, showRightHalf: false }))).toEqual({
      index: 1,
      showRightHalf: true,
    });
    expect(pageBack(state({ ...rtl, index: 1, showRightHalf: true }))).toEqual({
      index: 0,
      showRightHalf: false,
    });
  });

  it("asks splitMode, not the active spread, about the page it arrives at", () => {
    // Whether the page being arrived at has two halves is not something
    // the page being left can answer. With the mode off there is no far
    // half to land on.
    expect(
      pageBack(state({ index: 1, splitMode: false, isCurrentLandscape: false })),
    ).toEqual({ index: 0, showRightHalf: false });
    expect(
      pageBack(state({ index: 1, splitMode: true, isCurrentLandscape: false })),
    ).toEqual({ index: 0, showRightHalf: true });
  });

  it("stops at both ends", () => {
    expect(pageBack(state({ index: 0, showRightHalf: false }))).toBeNull();
    expect(pageForward(state({ index: 2, showRightHalf: true }))).toBeNull();
    expect(canPageBack(state({ index: 0, showRightHalf: false }))).toBe(false);
    expect(canPageForward(state({ index: 2, showRightHalf: true }))).toBe(false);
  });

  it("can still turn within the last page's spread", () => {
    // The end of the folder is not the end of the page.
    const last = state({ index: 2, showRightHalf: false });
    expect(canPageForward(last)).toBe(true);
    expect(pageForward(last)).toEqual({ index: 2, showRightHalf: true });
  });

  it("agrees with itself: a turn is possible exactly when it lands somewhere", () => {
    // The two are separate expressions in the source, and a page-turner
    // whose button is enabled and whose turn does nothing is worse than
    // one that admits it.
    for (const index of [0, 1, 2]) {
      for (const splitMode of [true, false]) {
        for (const isCurrentLandscape of [true, false]) {
          for (const readingDirection of ["ltr", "rtl"] as const) {
            for (const showRightHalf of [true, false]) {
              const s = state({
                index,
                splitMode,
                isCurrentLandscape,
                readingDirection,
                showRightHalf,
              });
              expect(canPageForward(s)).toBe(pageForward(s) !== null);
              expect(canPageBack(s)).toBe(pageBack(s) !== null);
            }
          }
        }
      }
    }
  });
});
