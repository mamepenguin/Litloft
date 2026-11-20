"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { MediaController } from "./mediaController";
import {
  watchedRangesStore,
  type WatchedPiece,
  type WatchedRegistration,
} from "./watchedRangesStore";

export interface MostWatchedSpot {
  /** Seconds from the start of the file. */
  start: number;
  /** The highest level in the run: 2 or 3. */
  strength: number;
  length: number;
}

/** A run of consecutive segments at level 2 or 3, longest-kept order. */
export function spotsFromPieces(pieces: WatchedPiece[]): MostWatchedSpot[] {
  const spots: MostWatchedSpot[] = [];
  let run: { start: number; end: number; strength: number } | null = null;

  const flush = () => {
    if (!run) return;
    spots.push({ start: run.start, strength: run.strength, length: run.end - run.start });
    run = null;
  };

  for (const piece of pieces) {
    if (piece.level < 2) {
      flush();
      continue;
    }
    if (run && run.end === piece.start) {
      run.end = piece.end;
      run.strength = Math.max(run.strength, piece.level);
      continue;
    }
    flush();
    run = { start: piece.start, end: piece.end, strength: piece.level };
  }
  flush();

  return spots.sort(
    (a, b) => b.strength - a.strength || b.length - a.length || a.start - b.start,
  );
}

const EMPTY_SPOTS: MostWatchedSpot[] = [];
const serverVersion = () => 0;

function useStoreVersion(mc: MediaController | null): number {
  const subscribe = useCallback(
    (onChange: () => void) =>
      mc ? watchedRangesStore.subscribe(mc, onChange) : () => {},
    [mc],
  );
  const getVersion = useCallback(
    () => (mc ? watchedRangesStore.version(mc) : 0),
    [mc],
  );
  return useSyncExternalStore(subscribe, getVersion, serverVersion);
}

/**
 * Recomputed only when the band's data or the length changes: the clock
 * re-renders the bar several times a second and must not re-derive them.
 */
export function useMostWatchedSpots(
  mc: MediaController | null,
  duration: number,
): MostWatchedSpot[] {
  const version = useStoreVersion(mc);
  return useMemo(() => {
    if (!mc || !(duration > 0)) return EMPTY_SPOTS;
    // Nothing may be derived from a version other than the one this
    // render read; the next render recomputes.
    if (watchedRangesStore.version(mc) !== version) return EMPTY_SPOTS;
    return spotsFromPieces(watchedRangesStore.pieces(mc, duration));
  }, [mc, version, duration]);
}

export function useWatchedRegistration(mc: MediaController | null): WatchedRegistration | null {
  useStoreVersion(mc);
  return mc ? watchedRangesStore.registration(mc) : null;
}
