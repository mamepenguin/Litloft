"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  canPageBack,
  canPageForward,
  halfLabel,
  isOnFirstHalf,
  isSpreadActive,
  pageBack,
  pageForward,
  type SpreadPosition,
  type SpreadState,
} from "@/lib/spreadPaging";

export interface UseSpreadPagingOptions extends SpreadState {
  setIndex: Dispatch<SetStateAction<number>>;
  setShowRightHalf: Dispatch<SetStateAction<boolean>>;
}

export interface SpreadPaging {
  activeSplit: boolean;
  isFirstSubPage: boolean;
  subPageLabel: "A" | "B" | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  navigatePrev: () => void;
  navigateNext: () => void;
}

/**
 * The seven values a page-turner needs, from the six it holds.
 *
 * Both full-screen viewers had their own copy. They agreed, which is the
 * dangerous state: the next change to how a page turns has to be made
 * twice, and a review that reads one of them cannot see that the other
 * still says the old thing.
 */
export function useSpreadPaging({
  index,
  count,
  splitMode,
  readingDirection,
  isCurrentLandscape,
  showRightHalf,
  setIndex,
  setShowRightHalf,
}: UseSpreadPagingOptions): SpreadPaging {
  const state: SpreadState = {
    index,
    count,
    splitMode,
    readingDirection,
    isCurrentLandscape,
    showRightHalf,
  };

  const turn = useCallback(
    (next: SpreadPosition | null) => {
      if (!next) return;
      // The half is set before the index, so the page being left keeps its
      // own position while the new one comes up.
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
      splitMode,
      readingDirection,
      isCurrentLandscape,
      showRightHalf,
    ],
  );
  const navigateNext = useCallback(
    () => turn(pageForward(state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      turn,
      index,
      count,
      splitMode,
      readingDirection,
      isCurrentLandscape,
      showRightHalf,
    ],
  );

  return {
    activeSplit: isSpreadActive(state),
    isFirstSubPage: isOnFirstHalf(state),
    subPageLabel: halfLabel(state),
    canGoPrev: canPageBack(state),
    canGoNext: canPageForward(state),
    navigatePrev,
    navigateNext,
  };
}
