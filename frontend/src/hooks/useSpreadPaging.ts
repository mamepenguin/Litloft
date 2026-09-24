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
  face: SpreadFace;
  /** Where a turn forward or back would land, for drawing it ahead. */
  nextFace: SpreadFace | null;
  prevFace: SpreadFace | null;
  faceLabel: string;
}

/**
 * No `isFirstSubPage` output: it is the one place `isOnFirstHalf` would
 * escape the module ungated. Every other export wraps that primitive in an
 * `isSpreadActive` check, which is what `pageBack` leans on.
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
      // order these two lines are written in.
      setShowRightHalf(next.showRightHalf);
      // A delta through the updater rather than an absolute. The two agree
      // for one call per render and differ if two turns land in the same
      // batch.
      const step = next.index - index;
      if (step !== 0) setIndex((prev) => prev + step);
    },
    [index, setIndex, setShowRightHalf],
  );

  // Identity matters: the viewers hand these to gesture and shortcut
  // hooks, and a new function every render would re-register listeners.
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

  const forward = pageForward(state);
  const back = pageBack(state);

  return {
    face: faceAt(state),
    nextFace: forward ? faceAt({ ...state, ...forward }) : null,
    prevFace: back ? faceAt({ ...state, ...back }) : null,
    faceLabel: faceLabel(state),
    activeSplit: isSpreadActive(state),
    subPageLabel: halfLabel(state),
    canGoPrev: canPageBack(state),
    canGoNext: canPageForward(state),
    navigatePrev,
    navigateNext,
  };
}
