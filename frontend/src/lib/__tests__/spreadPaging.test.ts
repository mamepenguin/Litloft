import { describe, expect, it } from "vitest";

import {
  canPageBack,
  canPageForward,
  faceAt,
  faceLabel,
  faceStart,
  halfLabel,
  isOnFirstHalf,
  isSpreadActive,
  pageBack,
  pageForward,
  type Orientation,
  type SpreadState,
} from "../spreadPaging";

/** Every page tall, unless a test says otherwise. */
function shapes(over: Record<number, Orientation> = {}) {
  return (i: number): Orientation => over[i] ?? "portrait";
}

function state(over: Partial<SpreadState> = {}): SpreadState {
  return {
    index: 1,
    count: 10,
    spreadMode: true,
    readingDirection: "ltr",
    showRightHalf: false,
    orientationAt: shapes(),
    canPair: true,
    ...over,
  };
}

/** A wide page at the current index: the splitting case. */
function splitting(over: Partial<SpreadState> = {}): SpreadState {
  return state({ orientationAt: shapes({ 1: "landscape" }), ...over });
}

describe("splitting a wide page — unchanged behaviour", () => {
  it("needs the mode and a wide page, not either alone", () => {
    expect(isSpreadActive(splitting())).toBe(true);
    expect(isSpreadActive(splitting({ spreadMode: false }))).toBe(false);
    expect(isSpreadActive(state())).toBe(false);
  });

  it("reads the first half in reading order, not screen order", () => {
    // The distinction the whole feature turns on: right-to-left starts
    // on the right half, so `showRightHalf` means opposite things.
    const ltr = (showRightHalf: boolean) =>
      isOnFirstHalf(splitting({ readingDirection: "ltr", showRightHalf }));
    const rtl = (showRightHalf: boolean) =>
      isOnFirstHalf(splitting({ readingDirection: "rtl", showRightHalf }));
    expect([ltr(false), ltr(true)]).toEqual([true, false]);
    expect([rtl(true), rtl(false)]).toEqual([true, false]);
  });

  it("labels the halves only while a wide page is split", () => {
    expect(halfLabel(splitting())).toBe("A");
    expect(halfLabel(splitting({ showRightHalf: true }))).toBe("B");
    expect(halfLabel(splitting({ spreadMode: false }))).toBeNull();
    expect(halfLabel(state())).toBeNull();
  });

  it("moves the half before it moves the page", () => {
    expect(pageForward(splitting())).toEqual({ index: 1, showRightHalf: true });
    expect(pageForward(splitting({ showRightHalf: true }))).toEqual({
      index: 2,
      showRightHalf: false,
    });
  });

  it("mirrors both turns when reading right to left", () => {
    const rtl = { readingDirection: "rtl" as const };
    expect(pageForward(splitting({ ...rtl, showRightHalf: true }))).toEqual({
      index: 1,
      showRightHalf: false,
    });
    expect(pageBack(splitting({ ...rtl, showRightHalf: true }))).toEqual({
      index: 0,
      showRightHalf: false,
    });
  });

  it("asks spreadMode, not the active split, about the page it arrives at", () => {
    // Whether the page being arrived at has two halves is not something
    // the page being left can answer.
    expect(
      pageBack(state({ index: 1, spreadMode: false, canPair: false })),
    ).toEqual({ index: 0, showRightHalf: false });
    expect(pageBack(state({ index: 1, canPair: false }))).toEqual({
      index: 0,
      showRightHalf: true,
    });
  });
});

describe("pairing two tall pages", () => {
  it("keeps the cover alone and pairs from there", () => {
    // A scanned book opens on a cover, then 1-2, 3-4.
    expect(faceStart(0)).toBe(0);
    expect([faceStart(1), faceStart(2)]).toEqual([1, 1]);
    expect([faceStart(3), faceStart(4)]).toEqual([3, 3]);

    expect(faceAt(state({ index: 0 })).kind).toBe("single");
    expect(faceAt(state({ index: 1 })).indices).toEqual([1, 2]);
    expect(faceAt(state({ index: 2 })).indices).toEqual([1, 2]);
  });

  it("moves the index by two across a pair, and by one otherwise", () => {
    expect(pageForward(state({ index: 1 }))).toEqual({
      index: 3,
      showRightHalf: false,
    });
    expect(pageForward(state({ index: 0 }))).toEqual({
      index: 1,
      showRightHalf: false,
    });
  });

  it("lands on the start of the face it turns back into", () => {
    // Not inside it: turning back from the 3-4 face reaches 1-2 at 1.
    expect(pageBack(state({ index: 3 }))?.index).toBe(1);
    expect(pageBack(state({ index: 1 }))?.index).toBe(0);
  });

  it("leaves a wide page to be split rather than pairing it", () => {
    const nextIsWide = state({
      index: 1,
      orientationAt: shapes({ 2: "landscape" }),
    });
    expect(faceAt(nextIsWide).kind).toBe("single");
    expect(faceAt(nextIsWide).indices).toEqual([1]);
  });

  it("does not pair a page whose shape has not been reported", () => {
    // `unknown` is an answer. Pairing on a guess is how a spread ends up
    // one page out of step for the rest of the book.
    const unknownNext = state({
      index: 1,
      orientationAt: shapes({ 2: "unknown" }),
    });
    expect(faceAt(unknownNext).kind).toBe("single");
  });

  it("leaves the last page alone rather than drawing an empty half", () => {
    const atEnd = state({ index: 9, count: 10 });
    expect(faceAt(atEnd).indices).toEqual([9]);
    expect(canPageForward(atEnd)).toBe(false);
  });

  it("comes apart when the frame narrows and pairs again when it widens", () => {
    // The switch stays on throughout; it is the window that changed.
    // `canPair` is the only input that moves here, so this is the whole
    // of what a resize does to the face.
    const wide = state({ index: 1, canPair: true });
    const narrow = state({ index: 1, canPair: false });

    expect(wide.spreadMode).toBe(true);
    expect(narrow.spreadMode).toBe(true);

    expect(faceAt(wide).kind).toBe("pair");
    expect(faceAt(narrow).kind).toBe("single");
    expect(faceAt(wide).kind).toBe("pair");

    // And the turn follows the face rather than the index: two pages
    // showing means two pages turned.
    expect(pageForward(wide)?.index).toBe(3);
    expect(pageForward(narrow)?.index).toBe(2);
  });

  it("counts what is on the screen, not just where the index is", () => {
    expect(faceLabel(state({ index: 1 }))).toBe("2–3");
    expect(faceLabel(state({ index: 2 }))).toBe("2–3");
    expect(faceLabel(state({ index: 0 }))).toBe("1");
    expect(faceLabel(splitting())).toBe("2");
  });
});

describe("both ends", () => {
  it("stops at the start and the end", () => {
    expect(pageBack(state({ index: 0 }))).toBeNull();
    expect(pageForward(state({ index: 9, count: 10 }))).toBeNull();
  });

  it("can still turn within the last page's split", () => {
    const last = state({
      index: 9,
      count: 10,
      orientationAt: shapes({ 9: "landscape" }),
    });
    expect(canPageForward(last)).toBe(true);
    expect(pageForward(last)).toEqual({ index: 9, showRightHalf: true });
  });

  it("agrees with itself: a turn is possible exactly when it lands somewhere", () => {
    // The two are separate expressions in the source, and a page-turner
    // whose button is enabled and whose press does nothing is worse than
    // one that admits it.
    let checked = 0;
    for (const index of [0, 1, 2, 8, 9]) {
      for (const spreadMode of [true, false]) {
        for (const canPair of [true, false]) {
          for (const readingDirection of ["ltr", "rtl"] as const) {
            for (const showRightHalf of [true, false]) {
              for (const shape of [
                "portrait",
                "landscape",
                "unknown",
              ] as const) {
                const s = state({
                  index,
                  spreadMode,
                  canPair,
                  readingDirection,
                  showRightHalf,
                  orientationAt: shapes({ [index]: shape }),
                });
                expect(canPageForward(s)).toBe(pageForward(s) !== null);
                expect(canPageBack(s)).toBe(pageBack(s) !== null);
                checked++;
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(240);
  });
});
