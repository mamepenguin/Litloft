"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  canPageBack,
  canPageForward,
  faceAt,
  faceLabel,
  halfLabel,
  isSpreadActive,
  pageBack,
  pageForward,
  type SpreadFace,
  type SpreadPosition,
  type SpreadState,
} from "@/lib/spreadPaging";

export interface UseSpreadPagingOptions extends SpreadState {
  setIndex: Dispatch<SetStateAction<number>>;
  setShowRightHalf: Dispatch<SetStateAction<boolean>>;
}

export interface SpreadPaging {
  activeSplit: boolean;
  subPageLabel: "A" | "B" | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  navigatePrev: () => void;
  navigateNext: () => void;
  /** What is on screen at once, and what to draw for it. */
  face: SpreadFace;
  /** `7` or `7–8`, one-based, for the counter. */
  faceLabel: string;
}

/**
 * The values a page-turner needs, from the six it holds.
 *
 * Six out, not the seven each viewer used to derive: `isFirstSubPage`
 * had no consumer left once both viewers moved onto this, and it is the
 * one place `isOnFirstHalf` would escape the module ungated. Every other
 * export wraps that primitive in an `isSpreadActive` check, which is
 * what `pageBack`'s docstring leans on when it argues for consulting
 * `spreadMode` — publishing an ungated half would be the one thing that
 * could make that argument false.
 *
 * Both full-screen viewers had their own copy. They agreed, which is the
 * dangerous state: the next change to how a page turns has to be made
 * twice, and a review that reads one of them cannot see that the other
 * still says the old thing.
 */
export function useSpreadPaging({
  index,
  count,
  spreadMode,
  readingDirection,
  showRightHalf,
  orientationAt,
  canPair,
  setIndex,
  setShowRightHalf,
}: UseSpreadPagingOptions): SpreadPaging {
  const state: SpreadState = {
    index,
    count,
    spreadMode,
    readingDirection,
    showRightHalf,
    orientationAt,
    canPair,
  };

  const turn = useCallback(
    (next: SpreadPosition | null) => {
      if (!next) return;
      // Both land in one commit, so the page being left never repaints
      // with the incoming half. That comes from batching, not from the
      // order these two lines are written in — swapping them changes
      // nothing, and reading the order as load-bearing would be a
      // guarantee this does not give.
      setShowRightHalf(next.showRightHalf);
      // A delta through the updater rather than an absolute. The two agree
      // for one call per render and differ if two turns land in the same
      // batch — that is the behaviour being preserved here, not a property
      // of this refactor.
      const step = next.index - index;
      if (step !== 0) setIndex((prev) => prev + step);
    },
    [index, setIndex, setShowRightHalf],
  );

  // Identity matters: the viewers hand these to gesture and shortcut
  // hooks, and a new function every render would re-register listeners
  // the originals registered once.
  const navigatePrev = useCallback(
    () => turn(pageBack(state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      turn,
      index,
      count,
      spreadMode,
      readingDirection,
      showRightHalf,
      orientationAt,
      canPair,
    ],
  );
  const navigateNext = useCallback(
    () => turn(pageForward(state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      turn,
      index,
      count,
      spreadMode,
      readingDirection,
      showRightHalf,
      orientationAt,
      canPair,
    ],
  );

  return {
    face: faceAt(state),
    faceLabel: faceLabel(state),
    activeSplit: isSpreadActive(state),
    subPageLabel: halfLabel(state),
    canGoPrev: canPageBack(state),
    canGoNext: canPageForward(state),
    navigatePrev,
    navigateNext,
  };
}
