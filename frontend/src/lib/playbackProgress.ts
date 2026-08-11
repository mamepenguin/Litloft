"use client";

/**
 * Watch-progress persistence, once, for every playback backend.
 *
 * This used to live in three players — VideoPlayer, AudioPlayer and the
 * Media Import YouTube embed — and the three copies had already drifted:
 * audio never saved on teardown, audio's resume window was 3 seconds
 * against everyone else's 5, and the native path could hand the server a
 * NaN duration. Phase A had to write the same completion rule into all
 * three, which is the point at which one implementation stops being
 * optional.
 *
 * The hook holds every piece of state in a ref and never calls setState.
 * Its host is a video player: routing bookkeeping through React state
 * would re-render the whole player four times a second to maintain a
 * number nobody displays.
 *
 * Spec: docs/superpowers/specs/2026-08-11-playback-clock-foundation.md §4.2
 */

import { useCallback, useEffect, useRef } from "react";
import type { MediaController } from "./mediaController";
import { getMediaClockSnapshot, subscribeMediaClock } from "./mediaClock";
import { getWatchProgress, saveWatchProgress } from "./api";
import { getSavedProgress, saveProgress } from "./recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

/** Seconds of playback between periodic writes. */
const SAVE_INTERVAL = 5;
/**
 * Dead zone at both ends of the timeline. Below it there is nothing
 * worth restoring; above it the viewer already finished and would be
 * dropped straight back at the end.
 */
const RESUME_THRESHOLD = 5;
/**
 * Minimum drift before the teardown write is worth making. Without it,
 * leaving right after a periodic save repeats it.
 */
const TEARDOWN_MIN_DELTA = 1;

export interface UsePlaybackProgressOptions {
  mc: MediaController | null;
  fileId: string;
  /**
   * An explicitly requested start position — the intelligence addon's
   * timestamped citations (`?t=`). Outranks stored progress: the viewer
   * asked for this moment, so silently snapping back to where they last
   * left off would be a bug.
   */
  initialTime?: number | null;
}

export interface UsePlaybackProgressResult {
  /**
   * Call from the player's own end-of-media event — `ended` on a native
   * element, state 0 from the YouTube IFrame player.
   *
   * Completion is an event, not a clock reading. Inferring it from
   * "position reached duration and playback stopped" is exactly the
   * fabricated completed state the playback contract refuses, so the
   * players keep detecting the end and this hook decides what to write.
   */
  notifyEnded: () => void;
}

function usable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function usePlaybackProgress({
  mc,
  fileId,
  initialTime,
}: UsePlaybackProgressOptions): UsePlaybackProgressResult {
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;

  /** Last position written, so the interval gate has something to measure. */
  const lastSavedRef = useRef(0);
  /** Latched once resume has been decided, so it happens exactly once. */
  const resumedRef = useRef(false);
  /**
   * True while the stored position is being read.
   *
   * Periodic saving has to stand still until that settles. The read is a
   * network round-trip, and if playback crosses SAVE_INTERVAL before it
   * lands, the periodic save writes the position the viewer resumed
   * *from* — clobbering the very marker being restored. The old players
   * had no such window because they resumed inside a lifecycle event,
   * before any polling began.
   */
  const resumePendingRef = useRef(false);

  // Read through refs inside the subscription so a change of profile or
  // requested start does not tear the clock subscription down and
  // restart resume.
  const hasProfileRef = useRef(hasProfile);
  hasProfileRef.current = hasProfile;
  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;

  const write = useCallback((position: number, duration: number) => {
    lastSavedRef.current = position;
    if (hasProfileRef.current) {
      saveWatchProgress(fileId, position, duration).catch(() => {
        // Fire-and-forget: never block or fail playback over a marker.
      });
    } else {
      saveProgress(fileId, position, duration);
    }
  }, [fileId]);

  const notifyEnded = useCallback(() => {
    if (!mc) return;
    let currentTime: number;
    let duration: number;
    let interrupted: boolean;
    try {
      currentTime = mc.getCurrentTime();
      duration = mc.getDuration();
      interrupted = mc.isInterrupted?.() ?? false;
    } catch {
      // Player already tearing down.
      return;
    }
    // YouTube's ENDED fires for a pre-roll too, and no state flag tells
    // the two apart. Writing here unguarded stamps the ad's length onto
    // the video as a finished watch.
    if (interrupted) return;
    // Without a trustworthy length there is no way to express
    // "completed", so leave the last periodic save standing.
    if (!usable(duration)) return;
    write(usable(currentTime) ? currentTime : duration, duration);
  }, [mc, write]);

  useEffect(() => {
    if (!mc) return;

    lastSavedRef.current = 0;
    resumedRef.current = false;
    resumePendingRef.current = false;
    let cancelled = false;

    const restoreStored = (duration: number) => {
      resumePendingRef.current = true;
      const read = hasProfileRef.current
        ? getWatchProgress(fileId).then((p) => p.position)
        : Promise.resolve(getSavedProgress(fileId));
      read
        .then((saved) => {
          if (cancelled) return;
          if (saved <= RESUME_THRESHOLD) return;
          if (saved >= duration - RESUME_THRESHOLD) return;
          mc.seek(saved);
          // Seed the interval gate, or the next tick writes back a
          // position the viewer never played.
          lastSavedRef.current = saved;
        })
        .catch(() => {
          // Fire-and-forget: a resume we cannot read must not stop
          // playback, and must not stop periodic saving either.
        })
        .finally(() => {
          resumePendingRef.current = false;
        });
    };

    const resumeOnce = (duration: number) => {
      const requested = initialTimeRef.current;
      if (requested != null && usable(requested)) {
        // An explicit request needs no length: there is no window to
        // check it against, and no round-trip to wait for.
        resumedRef.current = true;
        mc.seek(requested);
        lastSavedRef.current = requested;
        return;
      }
      // Restoring stored progress does need one — the upper bound of the
      // resume window is measured from the end. Media that never reports
      // a usable duration, a live stream, therefore never resumes, which
      // is correct: there is no position to be at.
      if (!usable(duration)) return;
      resumedRef.current = true;
      restoreStored(duration);
    };

    const onTick = () => {
      const { currentTime, duration, interrupted } = getMediaClockSnapshot(mc);

      if (!resumedRef.current) resumeOnce(duration);

      // During an interruption the clock belongs to whatever is
      // interrupting, so persisting it would overwrite the resume point
      // with an ad offset.
      if (interrupted) return;
      // Never race the restore: see resumePendingRef.
      if (resumePendingRef.current) return;
      if (!usable(currentTime) || !usable(duration)) return;
      if (Math.abs(currentTime - lastSavedRef.current) < SAVE_INTERVAL) return;
      write(currentTime, duration);
    };

    const unsubscribe = subscribeMediaClock(mc, onTick);
    onTick();

    return () => {
      cancelled = true;
      unsubscribe();
      // Leaving between periodic saves would otherwise discard up to
      // SAVE_INTERVAL seconds. Read the controller directly rather than
      // the clock: its last tick can be up to a second old on a paused
      // player, and this is the reading that has to be right.
      try {
        if (mc.isInterrupted?.()) return;
        // Leaving before the restore landed: writing here would replace
        // the stored position with the one playback happened to be at
        // while waiting for it.
        if (resumePendingRef.current) return;
        const currentTime = mc.getCurrentTime();
        const duration = mc.getDuration();
        if (!usable(currentTime) || !usable(duration)) return;
        if (
          Math.abs(currentTime - lastSavedRef.current) < TEARDOWN_MIN_DELTA
        ) {
          return;
        }
        write(currentTime, duration);
      } catch {
        // Player already gone; nothing to record.
      }
    };
  }, [mc, fileId, write]);

  return { notifyEnded };
}
