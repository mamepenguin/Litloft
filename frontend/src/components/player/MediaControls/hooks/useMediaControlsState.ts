"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptionsState, MediaController } from "@/lib/mediaController";
import { getMediaClockSnapshot, subscribeMediaClock } from "@/lib/mediaClock";

/**
 * MediaController is a pull-shaped contract: it exposes getters, not
 * events. Turning it into a push contract would ripple through every
 * backend (native, YouTube, Vimeo, anything added later), so we poll.
 */
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
 * interval.
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

/** How long a skip keeps the seek bar and its watched band up. */
const SKIP_WINDOW_MS = 2000;

export interface UseMediaControlsStateOptions {
  mc: MediaController | null;
  durationHint?: number | null;
  autoHideMs?: number;
  /**
   * True in the touch layout, where a skip shows the bottom bar alone
   * rather than the whole chrome.
   */
  touch?: boolean;
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
  /** Touch layout only: the seek bar and full-screen button without the rest. */
  bottomOnly: boolean;
  /** Whether the watched band is shown for a reason other than a hover. */
  bandVisible: boolean;
  revealControls: () => void;
  hideControls: () => void;
  beginScrub: (seconds: number) => void;
  updateScrub: (seconds: number) => void;
  endScrub: () => void;
  setVolume: (value: number) => void;
  /** A skip: the band shows for two seconds, and on touch the chrome goes bottom-only. */
  noteSkip: () => void;
  /** Restarts those two seconds for an action that is not a skip (a scrub end, a full-screen press). */
  restartSkipWindow: () => void;
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
  // Position, length, paused and interrupted come from the shared
  // clock so the bar can never disagree with the mini player about
  // whether playback is running. The rest is read here — those are the
  // fields the clock deliberately excludes.
  const clock = getMediaClockSnapshot(mc);
  return {
    currentTime: clock.currentTime,
    // The hint comes from our own file metadata and is trustworthy even
    // when the player is reporting something else (an ad, or nothing
    // yet), which is why it is layered here rather than in the clock:
    // it is a property of the file, not of the controller.
    duration: usableDuration(durationHint) || clock.duration,
    bufferedFraction: finite(mc.getBufferedFraction()),
    paused: clock.paused,
    muted: mc.isMuted(),
    volume: finite(mc.getVolume()),
    playbackRate: mc.getPlaybackRate(),
    interrupted: clock.interrupted,
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
  touch = false,
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
  const [bottomOnly, setBottomOnly] = useState(false);
  const [skipWindow, setSkipWindow] = useState(false);
  const [revealNonce, setRevealNonce] = useState(0);

  // The scrub position is mirrored in a ref so endScrub can read the
  // latest value without being re-created on every drag frame.
  const scrubTimeRef = useRef<number | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { paused } = snapshot;
  const scrubbing = scrubTime !== null;

  // Read by the skip timer, which outlives the render that started it.
  const bottomOnlyRef = useRef(bottomOnly);
  bottomOnlyRef.current = bottomOnly;
  const scrubbingRef = useRef(scrubbing);
  scrubbingRef.current = scrubbing;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const prevPausedRef = useRef(paused);
  const touchRef = useRef(touch);
  touchRef.current = touch;

  useEffect(() => {
    if (!mc) return;
    const sample = () => {
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
    // Subscribe before the first sample. Subscribing refreshes a
    // snapshot that may have been parked since the last consumer left,
    // and it does not notify anyone — so sampling first would show a
    // stale reading until the next tick.
    const unsubscribe = subscribeMediaClock(mc, sample);
    sample();
    return unsubscribe;
  }, [mc, durationHint]);

  useEffect(() => {
    if (paused || holdVisible) setBottomOnly(false);
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

  // Resuming is as good a sign as pausing that the viewer is back, so it
  // ends bottom-only too and leaves the whole chrome to the idle timer.
  useEffect(() => {
    if (prevPausedRef.current === paused) return;
    prevPausedRef.current = paused;
    setBottomOnly(false);
  }, [paused]);

  const restartSkipWindow = useCallback(() => {
    if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    setSkipWindow(true);
    skipTimerRef.current = setTimeout(() => {
      skipTimerRef.current = null;
      setSkipWindow(false);
      if (scrubbingRef.current) return;
      if (!bottomOnlyRef.current) return;
      setBottomOnly(false);
      setControlsVisible(pausedRef.current);
    }, SKIP_WINDOW_MS);
  }, []);

  const revealControls = useCallback(() => {
    setBottomOnly(false);
    setRevealNonce((n) => n + 1);
  }, []);

  const noteSkip = useCallback(() => {
    if (touchRef.current) {
      setBottomOnly(true);
      setControlsVisible(true);
    } else {
      revealControls();
    }
    restartSkipWindow();
  }, [restartSkipWindow, revealControls]);

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
    if (bottomOnlyRef.current) restartSkipWindow();
  }, [mc, restartSkipWindow]);

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

  useEffect(
    () => () => {
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    },
    [],
  );

  return {
    ...snapshot,
    volume: pendingVolume ?? snapshot.volume,
    displayTime: scrubTime ?? pendingSeek ?? snapshot.currentTime,
    scrubbing,
    controlsVisible,
    bottomOnly,
    bandVisible: skipWindow || scrubbing || bottomOnly,
    revealControls,
    hideControls,
    beginScrub,
    updateScrub,
    endScrub,
    setVolume,
    noteSkip,
    restartSkipWindow,
  };
}
