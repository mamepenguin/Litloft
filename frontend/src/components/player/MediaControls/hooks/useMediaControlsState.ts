"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptionsState, MediaController } from "@/lib/mediaController";

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

/**
 * How close the player has to get to a requested position before the
 * bar stops showing that position instead of the clock. Loose on
 * purpose: the YouTube player re-buffers on every seekTo, and its clock
 * lags the request by a beat even once it lands.
 */
const SEEK_SETTLE_S = 1.5;
/**
 * Give up waiting. A seek can be refused outright — during an ad, or
 * past the end of a stream — and the bar must not sit on a position the
 * player never reached.
 */
const SEEK_SETTLE_TIMEOUT_MS = 3000;

/**
 * The volume slider needs the same treatment as the scrub bar, and for
 * a sharper reason: it is dragged continuously, so a level that only
 * catches up on the next poll trails the pointer by up to a full idle
 * interval — a second, on a paused player. The knob is drawn by the
 * browser and follows the finger regardless, so the painted fill would
 * visibly lag behind its own knob.
 *
 * The tolerance is under one step of the slider (0.05), so a level the
 * player rounded on its way through is still recognised as arrival.
 */
const VOLUME_SETTLE = 0.02;
/** Give up: the backend may refuse the level (iOS ignores volume writes). */
const VOLUME_SETTLE_TIMEOUT_MS = 2000;

export interface MediaControlsSnapshot {
  currentTime: number;
  duration: number;
  bufferedFraction: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  interrupted: boolean;
  captions: CaptionsState;
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
  captions: "unavailable",
};

export interface UseMediaControlsStateOptions {
  mc: MediaController | null;
  /**
   * Duration from our own metadata, which is trustworthy even when the
   * player is reporting something else (an ad, or nothing yet).
   */
  durationHint?: number | null;
  autoHideMs?: number;
  /**
   * Keep the controls up regardless of the idle timer. Set while
   * something transient is open over the frame — a sheet that faded
   * out three seconds after the viewer opened it would be unusable.
   */
  holdVisible?: boolean;
}

export interface MediaControlsState extends MediaControlsSnapshot {
  /** Playhead, or the in-flight drag position while scrubbing. */
  displayTime: number;
  scrubbing: boolean;
  controlsVisible: boolean;
  revealControls: () => void;
  /**
   * Put the bar away now. Used by the touch layer, where a tap toggles
   * the controls and a skip gesture takes the frame over.
   */
  hideControls: () => void;
  beginScrub: (seconds: number) => void;
  updateScrub: (seconds: number) => void;
  endScrub: () => void;
  /**
   * Write a level (0-1) to the player and show it straight away, rather
   * than waiting for the poll to confirm it. See VOLUME_SETTLE.
   */
  setVolume: (value: number) => void;
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
    captions: mc.getCaptions?.() ?? "unavailable",
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
    a.interrupted === b.interrupted &&
    a.captions === b.captions
  );
}

export function useMediaControlsState({
  mc,
  durationHint,
  autoHideMs = DEFAULT_AUTO_HIDE_MS,
  holdVisible = false,
}: UseMediaControlsStateOptions): MediaControlsState {
  const [snapshot, setSnapshot] = useState<MediaControlsSnapshot>(EMPTY_SNAPSHOT);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  // Where the viewer asked to be, held until the player gets there.
  // Dropping it the moment the scrub ends makes the bar snap back to
  // the old position for a poll interval before jumping forward.
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  // Same idea for the level the viewer just dragged to.
  const [pendingVolume, setPendingVolume] = useState<number | null>(null);
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
    // holdVisible is the same idea for something the viewer opened
    // deliberately and is still reading.
    if (paused || scrubbing || holdVisible) {
      setControlsVisible(true);
      return;
    }
    setControlsVisible(true);
    const id = setTimeout(() => setControlsVisible(false), autoHideMs);
    return () => clearTimeout(id);
  }, [paused, scrubbing, holdVisible, autoHideMs, revealNonce]);

  const revealControls = useCallback(() => {
    setRevealNonce((n) => n + 1);
  }, []);

  // Stays hidden until something re-runs the effect above (playback
  // starting or stopping, a scrub, another reveal). An explicit "put it
  // away" outranks the "paused means visible" default until then.
  const hideControls = useCallback(() => {
    setControlsVisible(false);
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
    setPendingSeek(target);
    mc?.seek(target);
  }, [mc]);

  useEffect(() => {
    if (pendingSeek === null) return;
    if (Math.abs(snapshot.currentTime - pendingSeek) < SEEK_SETTLE_S) {
      setPendingSeek(null);
    }
  }, [snapshot.currentTime, pendingSeek]);

  useEffect(() => {
    if (pendingSeek === null) return;
    const id = setTimeout(() => setPendingSeek(null), SEEK_SETTLE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [pendingSeek]);

  const setVolume = useCallback(
    (value: number) => {
      const clamped = Math.min(Math.max(value, 0), 1);
      setPendingVolume(clamped);
      mc?.setVolume(clamped);
    },
    [mc],
  );

  useEffect(() => {
    if (pendingVolume === null) return;
    if (Math.abs(snapshot.volume - pendingVolume) < VOLUME_SETTLE) {
      setPendingVolume(null);
    }
  }, [snapshot.volume, pendingVolume]);

  useEffect(() => {
    if (pendingVolume === null) return;
    const id = setTimeout(() => setPendingVolume(null), VOLUME_SETTLE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [pendingVolume]);

  return {
    ...snapshot,
    volume: pendingVolume ?? snapshot.volume,
    displayTime: scrubTime ?? pendingSeek ?? snapshot.currentTime,
    scrubbing,
    controlsVisible,
    revealControls,
    hideControls,
    beginScrub,
    updateScrub,
    endScrub,
    setVolume,
  };
}
