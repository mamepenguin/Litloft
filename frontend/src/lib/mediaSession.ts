"use client";

/**
 * Media Session wiring — the OS-level playback surface (lock screen,
 * notification shade, media keys, car display).
 *
 * This used to take an `HTMLMediaElement`, which meant `.loft` files
 * could not have it at all: a YouTube IFrame player is not a DOM media
 * element. Native media had Media Session and no custom control bar
 * while `.loft` had the bar and no Media Session — the asymmetry ran in
 * both directions. Talking to a `MediaController` removes it.
 *
 * Position reporting rides the shared playback clock rather than DOM
 * events, for the same reason: `timeupdate` does not exist for every
 * backend, and polling per feature is what the clock exists to stop.
 *
 * Spec: docs/superpowers/specs/2026-08-11-playback-clock-foundation.md §4.3
 */

import type { MediaController } from "./mediaController";
import { getMediaClockSnapshot, subscribeMediaClock } from "./mediaClock";

export interface MediaSessionMetadataInput {
  title: string;
  artist?: string;
  album?: string;
  artwork?: readonly MediaImage[];
}

export interface MediaSessionHandlers {
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
}

const SEEK_OFFSET = 10;

export function setupMediaSession(
  mc: MediaController,
  metadata: MediaSessionMetadataInput,
  handlers: MediaSessionHandlers = {},
): () => void {
  if (typeof navigator === "undefined" || typeof window === "undefined") return () => {};
  const ms = navigator.mediaSession;
  const Metadata = window.MediaMetadata;
  if (!ms || typeof Metadata !== "function") return () => {};

  ms.metadata = new Metadata({
    title: metadata.title,
    artist: metadata.artist ?? "",
    album: metadata.album ?? "",
    artwork: metadata.artwork ? [...metadata.artwork] : [],
  });

  const registered: MediaSessionAction[] = [];
  const register = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(action, handler);
      registered.push(action);
    } catch {
      // Action not supported in this browser — fine.
    }
  };

  register("play", () => {
    mc.play();
  });
  register("pause", () => {
    mc.pause();
  });
  // Clamping is the controller's job — it is the only thing that knows
  // what the backend will accept — so these pass the requested position
  // through rather than bounding it a second time.
  register("seekbackward", (details) => {
    mc.seek(mc.getCurrentTime() - (details.seekOffset ?? SEEK_OFFSET));
  });
  register("seekforward", (details) => {
    mc.seek(mc.getCurrentTime() + (details.seekOffset ?? SEEK_OFFSET));
  });
  register("seekto", (details) => {
    if (details.seekTime == null) return;
    mc.seek(details.seekTime);
  });
  if (handlers.onNextTrack) {
    const next = handlers.onNextTrack;
    register("nexttrack", () => next());
  }
  if (handlers.onPreviousTrack) {
    const prev = handlers.onPreviousTrack;
    register("previoustrack", () => prev());
  }

  /**
   * Feed the OS the scrubber position. Without this the lock screen
   * shows transport buttons but a dead progress bar.
   *
   * `setPositionState` throws on anything it considers incoherent — a
   * non-finite duration, a position past the end, a non-positive rate —
   * so every field is checked first and the call is still wrapped. The
   * duration guard is the same one the rest of the playback contract
   * uses: when the length is unknowable, say nothing rather than
   * invent a timeline.
   */
  const updatePosition = () => {
    const { currentTime, duration, interrupted } = getMediaClockSnapshot(mc);
    // During an ad the clock belongs to the ad, not the file. Leaving
    // the last good reading up beats publishing the interruption's
    // timeline as though it were the video's.
    if (interrupted) return;
    if (typeof ms.setPositionState !== "function") return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const rate = mc.getPlaybackRate();
    try {
      ms.setPositionState({
        duration,
        position: Math.min(Math.max(currentTime, 0), duration),
        playbackRate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      });
    } catch {
      // Browsers disagree about what they will accept here.
    }
  };

  const sync = () => {
    ms.playbackState = getMediaClockSnapshot(mc).paused ? "paused" : "playing";
    updatePosition();
  };

  const unsubscribe = subscribeMediaClock(mc, sync);
  sync();

  return () => {
    unsubscribe();
    for (const action of registered) {
      try {
        ms.setActionHandler(action, null);
      } catch {
        // ignore
      }
    }
    ms.metadata = null;
    ms.playbackState = "none";
  };
}
