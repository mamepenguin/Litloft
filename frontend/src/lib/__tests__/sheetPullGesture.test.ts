/**
 * The Bottom Sheet's gesture-ownership table, state by state.
 *
 * **This is the only place the whole table can be measured, and it cannot
 * measure a browser.** jsdom lays nothing out: `getBoundingClientRect()`
 * is zeros, writing `scrollTop` moves nothing, and `preventDefault()` on
 * a synthetic touch cancels no scroll that never started. So what is held
 * here is the decision — who owns a gesture that began in this state, and
 * what releasing it does — with the scroll positions handed in as
 * numbers.
 *
 * That the browser then honours the decision (the scroller does not move
 * a pixel while the sheet does, and the reverse) is measured in
 * `e2e-components/sheet-gesture.spec.ts` against the real component with
 * CDP touch events.
 */

import { describe, expect, it } from "vitest";

import {
  SHEET_PULL_DISMISS_PX,
  SHEET_PULL_DISMISS_VELOCITY,
  SHEET_PULL_HANDOFF_PX,
  SHEET_PULL_TOP_EPS_PX,
  advanceSheetPull,
  beginSheetPull,
  releaseSheetPull,
  type SheetPullState,
} from "../sheetPullGesture";

/** A scroller with room to move, so `maxScroll` is never the deciding term. */
const TALL = 800;

function run(
  begin: { scrollTop: number; maxScroll: number },
  moves: { dy: number; scrollTop: number }[],
): SheetPullState {
  return moves.reduce(
    (state, move) => advanceSheetPull(state, move),
    beginSheetPull(begin),
  );
}

/**
 * Every gesture the design names, as declared inputs and declared
 * outcomes — not as outcomes read back from a run.
 *
 * Each row is a whole gesture: where the scroller stood when the finger
 * landed, where the finger went, how fast it was moving when it left, and
 * what the sheet is supposed to do about it. The population is pinned
 * below, because a table that can be walked back to any length is not a
 * table (`.claude/rules/review-workflow.md`, detector rule 5).
 */
const GESTURES: {
  name: string;
  begin: { scrollTop: number; maxScroll: number };
  moves: { dy: number; scrollTop: number }[];
  velocity: number;
  owner: SheetPullState["owner"];
  pull: number;
  release: "dismiss" | "settle";
}[] = [
  {
    // Condition 1: nothing to scroll, so the gesture was never the
    // scroller's to take.
    name: "a sheet that does not scroll, pushed down",
    begin: { scrollTop: 0, maxScroll: 0 },
    moves: [
      { dy: 20, scrollTop: 0 },
      { dy: 90, scrollTop: 0 },
    ],
    velocity: 0.1,
    owner: "sheet",
    pull: 90,
    release: "dismiss",
  },
  {
    // Condition 2: at the top, pushed down far enough.
    name: "at the top, pushed down past the dismiss distance",
    begin: { scrollTop: 0, maxScroll: TALL },
    moves: [
      { dy: 10, scrollTop: 0 },
      { dy: SHEET_PULL_DISMISS_PX + 1, scrollTop: 0 },
    ],
    velocity: 0.05,
    owner: "sheet",
    pull: SHEET_PULL_DISMISS_PX + 1,
    release: "dismiss",
  },
  {
    // Condition 2, not far enough: the sheet still followed the finger,
    // and springs back.
    name: "at the top, pushed down and released short",
    begin: { scrollTop: 0, maxScroll: TALL },
    moves: [
      { dy: 10, scrollTop: 0 },
      { dy: SHEET_PULL_DISMISS_PX - 10, scrollTop: 0 },
    ],
    velocity: 0.05,
    owner: "sheet",
    pull: SHEET_PULL_DISMISS_PX - 10,
    release: "settle",
  },
  {
    // Condition 4: a flick from the top closes on velocity, at a distance
    // the previous row springs back from.
    name: "at the top, flicked down",
    begin: { scrollTop: 0, maxScroll: TALL },
    moves: [
      { dy: 12, scrollTop: 0 },
      { dy: SHEET_PULL_DISMISS_PX - 10, scrollTop: 0 },
    ],
    velocity: SHEET_PULL_DISMISS_VELOCITY + 0.2,
    owner: "sheet",
    pull: SHEET_PULL_DISMISS_PX - 10,
    release: "dismiss",
  },
  {
    // Condition 3: started below the top, scrolled to the top without
    // lifting, then kept pushing.
    name: "scrolled to the top and kept pushing",
    begin: { scrollTop: 300, maxScroll: TALL },
    moves: [
      { dy: 100, scrollTop: 200 },
      { dy: 300, scrollTop: 0 },
      { dy: 300 + SHEET_PULL_HANDOFF_PX, scrollTop: 0 },
      { dy: 300 + SHEET_PULL_HANDOFF_PX + 100, scrollTop: 0 },
    ],
    velocity: 0.1,
    owner: "sheet",
    pull: 100,
    release: "dismiss",
  },
  {
    // The negative form of condition 3: a hard flick that only reached
    // the top as the finger left. Nothing was pushed past the top, so the
    // scroller keeps the gesture and the sheet never moves.
    name: "flicked hard and only reached the top on the way out",
    begin: { scrollTop: 400, maxScroll: TALL },
    moves: [
      { dy: 200, scrollTop: 200 },
      { dy: 400, scrollTop: 0 },
      { dy: 400 + SHEET_PULL_HANDOFF_PX - 1, scrollTop: 0 },
    ],
    velocity: SHEET_PULL_DISMISS_VELOCITY + 1,
    owner: "scroller",
    pull: 0,
    release: "settle",
  },
  {
    // Reading on: at the top, moving up. The scroller takes it and keeps
    // it, so the sheet cannot be dragged upward from its content — that
    // is the knob's job.
    name: "at the top, dragged up to read on",
    begin: { scrollTop: 0, maxScroll: TALL },
    moves: [
      { dy: -10, scrollTop: 0 },
      { dy: -200, scrollTop: 190 },
    ],
    velocity: -0.8,
    owner: "scroller",
    pull: 0,
    release: "settle",
  },
];

describe("sheet pull gesture", () => {
  it("declares every gesture the design names", () => {
    expect(GESTURES).toHaveLength(7);
    expect(new Set(GESTURES.map((g) => g.name)).size).toBe(7);
  });

  describe.each(GESTURES)(
    "$name",
    ({ begin, moves, velocity, owner, pull, release }) => {
      const state = run(begin, moves);

      it(`is owned by the ${owner}`, () => {
        expect(state.owner).toBe(owner);
      });

      it(`translates the sheet by ${pull}px`, () => {
        expect(state.pull).toBe(pull);
      });

      it(`${release}s on release`, () => {
        expect(releaseSheetPull(state, velocity)).toBe(release);
      });
    },
  );

  it("never translates the sheet while the scroller owns the gesture", () => {
    // The one claim that has to hold for every row rather than per row:
    // a gesture the scroller owns leaves the sheet at rest, whatever the
    // finger did. This is the jsdom half of "the two never move together";
    // the browser half is in `e2e-components/sheet-gesture.spec.ts`.
    const scrollerOwned = GESTURES.filter((g) => g.owner === "scroller");
    expect(scrollerOwned).toHaveLength(2);
    for (const g of scrollerOwned) {
      expect(run(g.begin, g.moves).pull).toBe(0);
    }
  });

  it("treats a sub-pixel scroll offset as the top", () => {
    // Browsers report fractional `scrollTop` on a device pixel ratio that
    // is not 1, so an exact `=== 0` would refuse condition 2 on a phone.
    const state = run({ scrollTop: SHEET_PULL_TOP_EPS_PX, maxScroll: TALL }, [
      { dy: 30, scrollTop: SHEET_PULL_TOP_EPS_PX },
    ]);
    expect(state.owner).toBe("sheet");
  });

  it("does not treat a scroll offset past the epsilon as the top", () => {
    const state = run(
      { scrollTop: SHEET_PULL_TOP_EPS_PX + 1, maxScroll: TALL },
      [{ dy: 30, scrollTop: SHEET_PULL_TOP_EPS_PX + 1 }],
    );
    expect(state.owner).toBe("scroller");
  });

  it("forgets the push it had accumulated if the scroller moves again", () => {
    // Inside one gesture the finger can reach the top, push part of the
    // way toward the handoff, then drag back up into the content. The
    // push that is left over must not be spent later: it was answered by
    // scrolling.
    const state = run({ scrollTop: 200, maxScroll: TALL }, [
      { dy: 200, scrollTop: 0 },
      { dy: 200 + SHEET_PULL_HANDOFF_PX - 1, scrollTop: 0 },
      { dy: 150, scrollTop: 50 },
      { dy: 200, scrollTop: 0 },
      { dy: 200 + SHEET_PULL_HANDOFF_PX - 1, scrollTop: 0 },
    ]);
    expect(state.owner).toBe("scroller");
    expect(state.pull).toBe(0);
  });

  it("clamps the sheet at its resting position when the finger goes back up", () => {
    // The sheet owns the gesture and keeps it, but it only ever travels
    // downward: dragging up from the content does not expand it, because
    // expanding is the knob's.
    const state = run({ scrollTop: 0, maxScroll: TALL }, [
      { dy: 60, scrollTop: 0 },
      { dy: -120, scrollTop: 0 },
    ]);
    expect(state.owner).toBe("sheet");
    expect(state.pull).toBe(0);
    expect(releaseSheetPull(state, -1)).toBe("settle");
  });
});
