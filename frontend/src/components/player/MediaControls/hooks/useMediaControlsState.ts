"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaController } from "@/lib/mediaController";

/**
 * MediaController is a pull-shaped contract: it exposes getters, not
 * events. Turning it into a push contract would ripple through every
 * backend (native, YouTube, Vimeo, anything added later), so the
 * controls poll instead.
 *
 * Two rates rather than start/stop: a paused player can start playing
 * again without telling us (a keyboard shortcut, an ad ending, an
 * autoplay kicking in), so we keep a slow heartbeat going and only
 * speed up when something is actually moving.
 */
const POLL_ACTIVE_MS = 250;
const POLL_IDLE_MS = 1000;
const DEFAULT_AUTO_HIDE_MS = 3000;

export interface MediaControlsSnapshot {
  currentTime: number;
  duration: number;
  bufferedFraction: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  interrupted: boolean;
}

const EMPTY_SNAPSHOT: MediaControlsSnapshot = {
  currentTime: 0,
  duration: 0,
  bufferedFraction: 0,
  paused: true,
  muted: false,
  volume: 1,
  playbackRate: 1,
  interrupted: false,
};

export interface UseMediaControlsStateOptions {
  mc: MediaController | null;
  /**
   * Duration from our own metadata, which is trustworthy even when the
   * player is reporting something else (an ad, or nothing yet).
   */
  durationHint?: number | null;
  autoHideMs?: number;
}

export interface MediaControlsState extends MediaControlsSnapshot {
  /** Playhead, or the in-flight drag position while scrubbing. */
  displayTime: number;
  scrubbing: boolean;
  controlsVisible: boolean;
  revealControls: () => void;
  beginScrub: (seconds: number) => void;
  updateScrub: (seconds: number) => void;
  endScrub: () => void;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function usableDuration(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

function readSnapshot(
  mc: MediaController,
  durationHint: number | null | undefined,
): MediaControlsSnapshot {
  return {
    currentTime: finite(mc.getCurrentTime()),
    duration: usableDuration(durationHint) || usableDuration(mc.getDuration()),
    bufferedFraction: finite(mc.getBufferedFraction()),
    paused: mc.isPaused(),
    muted: mc.isMuted(),
    volume: finite(mc.getVolume()),
    playbackRate: mc.getPlaybackRate(),
    interrupted: mc.isInterrupted?.() ?? false,
  };
}

function sameSnapshot(
  a: MediaControlsSnapshot,
  b: MediaControlsSnapshot,
): boolean {
  return (
    a.currentTime === b.currentTime &&
    a.duration === b.duration &&
    a.bufferedFraction === b.bufferedFraction &&
    a.paused === b.paused &&
    a.muted === b.muted &&
    a.volume === b.volume &&
    a.playbackRate === b.playbackRate &&
    a.interrupted === b.interrupted
  );
}

export function useMediaControlsState({
  mc,
  durationHint,
  autoHideMs = DEFAULT_AUTO_HIDE_MS,
}: UseMediaControlsStateOptions): MediaControlsState {
  const [snapshot, setSnapshot] = useState<MediaControlsSnapshot>(EMPTY_SNAPSHOT);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  // Bumping this restarts the auto-hide countdown declaratively, so the
  // timer lives in one effect instead of being juggled across refs.
  const [revealNonce, setRevealNonce] = useState(0);

  // The scrub position is mirrored in a ref so endScrub can read the
  // latest value without being re-created on every drag frame.
  const scrubTimeRef = useRef<number | null>(null);

  const { paused } = snapshot;
  const scrubbing = scrubTime !== null;

  useEffect(() => {
    if (!mc) return;
    const tick = () => {
      setSnapshot((prev) => {
        let next: MediaControlsSnapshot;
        try {
          next = readSnapshot(mc, durationHint);
        } catch {
          // The YouTube player throws while it swaps media. Hold the
          // last good reading rather than blanking the bar.
          return prev;
        }
        // Returning the previous object lets React bail out, so a
        // paused player does not re-render once per heartbeat.
        return sameSnapshot(prev, next) ? prev : next;
      });
    };
    tick();
    const id = setInterval(
      tick,
      paused && !scrubbing ? POLL_IDLE_MS : POLL_ACTIVE_MS,
    );
    return () => clearInterval(id);
  }, [mc, durationHint, paused, scrubbing]);

  useEffect(() => {
    // Nothing is moving, so there is nothing to get out of the way of.
    if (paused || scrubbing) {
      setControlsVisible(true);
      return;
    }
    setControlsVisible(true);
    const id = setTimeout(() => setControlsVisible(false), autoHideMs);
    return () => clearTimeout(id);
  }, [paused, scrubbing, autoHideMs, revealNonce]);

  const revealControls = useCallback(() => {
    setRevealNonce((n) => n + 1);
  }, []);

  const beginScrub = useCallback((seconds: number) => {
    scrubTimeRef.current = seconds;
    setScrubTime(seconds);
  }, []);

  const updateScrub = useCallback((seconds: number) => {
    if (scrubTimeRef.current === null) return;
    scrubTimeRef.current = seconds;
    setScrubTime(seconds);
  }, []);

  const endScrub = useCallback(() => {
    const target = scrubTimeRef.current;
    if (target === null) return;
    scrubTimeRef.current = null;
    setScrubTime(null);
    mc?.seek(target);
  }, [mc]);

  return {
    ...snapshot,
    displayTime: scrubTime ?? snapshot.currentTime,
    scrubbing,
    controlsVisible,
    revealControls,
    beginScrub,
    updateScrub,
    endScrub,
  };
}
