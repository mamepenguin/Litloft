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

/** Half the handoff, rounded down — so two of them clear it and one does not. */
const HALF_HANDOFF = Math.floor(SHEET_PULL_HANDOFF_PX / 2);

function run(
  begin: { scrollTop: number; maxScroll: number },
  moves: { dy: number; scrollTop: number }[],
): SheetPullState {
  return moves.reduce(
    (state, move) => advanceSheetPull(state, move),
    beginSheetPull(begin),
  );
}

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
    // Nothing was pushed past the top, so the scroller keeps the gesture
    // and the sheet never moves.
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
    // The sheet cannot be dragged upward from its content — that is the
    // knob's job.
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
  {
    // The direction is still read: a sheet that cannot scroll vertically
    // may still hold something that scrolls sideways.
    name: "nothing to scroll, dragged up",
    begin: { scrollTop: 0, maxScroll: 0 },
    moves: [
      { dy: -10, scrollTop: 0 },
      { dy: -140, scrollTop: 0 },
    ],
    velocity: -0.8,
    owner: "scroller",
    pull: 0,
    release: "settle",
  },
  {
    // In a sheet that cannot scroll, "past the top" is measured from
    // where the finger turned, because no part of the reversal was
    // answered by scrolling.
    name: "nothing to scroll, dragged up and then back down",
    begin: { scrollTop: 0, maxScroll: 0 },
    moves: [
      { dy: -40, scrollTop: 0 },
      { dy: -40 + SHEET_PULL_HANDOFF_PX - 1, scrollTop: 0 },
      { dy: -40 + SHEET_PULL_HANDOFF_PX, scrollTop: 0 },
      { dy: -40 + SHEET_PULL_HANDOFF_PX + 80, scrollTop: 0 },
    ],
    velocity: 0.1,
    owner: "sheet",
    pull: 80,
    release: "dismiss",
  },
  {
    // A finger that pushes at the top with a frame in the middle where
    // `clientY` did not change — which is ordinary, because moves are
    // coalesced and the position is rounded. The banked push survives it.
    name: "pushing to the handoff through a frame that did not move",
    begin: { scrollTop: 200, maxScroll: TALL },
    moves: [
      { dy: 200, scrollTop: 0 },
      { dy: 200 + HALF_HANDOFF, scrollTop: 0 },
      { dy: 200 + HALF_HANDOFF, scrollTop: 0 },
      { dy: 200 + SHEET_PULL_HANDOFF_PX, scrollTop: 0 },
      { dy: 200 + SHEET_PULL_HANDOFF_PX + 90, scrollTop: 0 },
    ],
    velocity: 0.1,
    owner: "sheet",
    pull: 90,
    release: "dismiss",
  },
];

describe("sheet pull gesture", () => {
  it("declares every gesture the design names", () => {
    expect(GESTURES).toHaveLength(10);
    expect(new Set(GESTURES.map((g) => g.name)).size).toBe(10);
  });

  describe("the values, not only the arithmetic", () => {
    it("hands over after 48px past the top and not after 47", () => {
      const push = (past: number) =>
        run({ scrollTop: 200, maxScroll: TALL }, [
          { dy: 200, scrollTop: 0 },
          { dy: 200 + past, scrollTop: 0 },
        ]).owner;
      expect(push(47)).toBe("scroller");
      expect(push(48)).toBe("sheet");
    });

    it("still calls a fractional offset the top, and 400px not the top", () => {
      // At zero, a device reporting `0.36` after a scroll clears the banked
      // push on every frame and the handoff can never accumulate.
      const startedAt = (scrollTop: number) =>
        beginSheetPull({ scrollTop, maxScroll: TALL }).owner;
      expect(startedAt(0.36)).toBe("undecided");
      expect(startedAt(3)).toBe("scroller");

      const banked = (scrollTop: number) =>
        run({ scrollTop: 200, maxScroll: TALL }, [
          { dy: 200, scrollTop: 0 },
          { dy: 200 + HALF_HANDOFF, scrollTop },
          { dy: 200 + SHEET_PULL_HANDOFF_PX, scrollTop },
        ]).pushedPastTop;
      expect(banked(0.36)).toBeGreaterThan(0);
      expect(banked(3)).toBe(0);
    });

    it("reads the direction after 4px and not after 3", () => {
      const move = (dy: number) =>
        run({ scrollTop: 0, maxScroll: TALL }, [{ dy, scrollTop: 0 }]).owner;
      expect(move(3)).toBe("undecided");
      expect(move(4)).toBe("sheet");
      expect(move(-3)).toBe("undecided");
      expect(move(-4)).toBe("scroller");
    });

    it("dismisses at 72px, and at 0.5px/ms from any distance short of it", () => {
      const at = (pull: number, velocity: number) =>
        releaseSheetPull(
          run({ scrollTop: 0, maxScroll: 0 }, [{ dy: pull, scrollTop: 0 }]),
          velocity,
        );
      expect(at(71, 0)).toBe("settle");
      expect(at(72, 0)).toBe("dismiss");
      expect(at(20, 0.49)).toBe("settle");
      expect(at(20, 0.5)).toBe("dismiss");
      expect(at(0, 9)).toBe("settle");
    });
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
    const scrollerOwned = GESTURES.filter((g) => g.owner === "scroller");
    expect(scrollerOwned).toHaveLength(3);
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
