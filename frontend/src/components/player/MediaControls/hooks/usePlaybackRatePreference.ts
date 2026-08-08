"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "video-share-playback-rate";
const DEFAULT_RATE = 1;

/**
 * Rates the speed selector offers. Deliberately a closed set rather
 * than free input: the YouTube IFrame player silently ignores a rate
 * outside `getAvailablePlaybackRates()`, which would leave the UI
 * claiming a speed the player never applied.
 */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function isOfferedRate(rate: number): boolean {
  return (PLAYBACK_RATES as readonly number[]).includes(rate);
}

/**
 * Snap a reported rate onto the offered set. A backend may apply a
 * speed we never offer; rendering a select with no matching option
 * would blank the control, so show the closest match instead. Ties go
 * to the faster rate (`<=` keeps the later, larger candidate).
 */
export function nearestOfferedRate(rate: number): number {
  return PLAYBACK_RATES.reduce((best, candidate) =>
    Math.abs(candidate - rate) <= Math.abs(best - rate) ? candidate : best,
  );
}

export function readPlaybackRatePreference(): number {
  if (typeof window === "undefined") return DEFAULT_RATE;
  try {
    const raw = window.localStorage?.getItem?.(STORAGE_KEY);
    if (raw == null) return DEFAULT_RATE;
    const parsed = Number.parseFloat(raw);
    return isOfferedRate(parsed) ? parsed : DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

/**
 * Playback speed that survives across files and sessions, mirroring
 * how `useAutoplayPreference` handles the autoplay toggle.
 *
 * Returns the user's *preferred* rate. The rate a player actually
 * applied is read back from the MediaController — the two can diverge
 * when a backend refuses the requested speed.
 */
export function usePlaybackRatePreference(): [number, (value: number) => void] {
  const [rate, setRate] = useState(DEFAULT_RATE);

  // Hydrate in an effect rather than in the initial state: reading
  // localStorage during render would make the server and client markup
  // disagree.
  useEffect(() => {
    setRate(readPlaybackRatePreference());
  }, []);

  const update = useCallback((value: number) => {
    if (!isOfferedRate(value)) return;
    setRate(value);
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable (private mode, test env) — keep in-memory only
    }
  }, []);

  return [rate, update];
}
