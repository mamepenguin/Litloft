"use client";

/**
 * State lives in refs, never setState: the host is a video player that
 * would otherwise re-render on every clock tick.
 */

import { useCallback, useEffect, useRef } from "react";
import type { MediaController } from "./mediaController";
import { getMediaClockSnapshot, subscribeMediaClock } from "./mediaClock";
import { getWatchProgress, saveWatchProgress } from "./api";
import { getSavedProgress, saveProgress } from "./recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

const SAVE_INTERVAL = 5;
/** Dead zone at both ends of the timeline where resume is skipped. */
const RESUME_THRESHOLD = 5;
const TEARDOWN_MIN_DELTA = 1;

export interface UsePlaybackProgressOptions {
  mc: MediaController | null;
  fileId: string;
  /** An explicitly requested start position (`?t=`). Outranks stored progress. */
  initialTime?: number | null;
}

export interface UsePlaybackProgressResult {
  /** Completion is an event from the player, never inferred from the clock. */
  notifyEnded: () => void;
  /** Await before autoplay, or playback starts at zero and then jumps. */
  notifyReady: () => Promise<void>;
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

  const lastSavedRef = useRef(0);
  const resumedRef = useRef(false);
  // Blocks periodic saving while the stored position is being read, or
  // a save could clobber the marker being restored.
  const resumePendingRef = useRef(false);
  const resumeNowRef = useRef<(() => Promise<void>) | null>(null);

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

    const restoreStored = (duration: number): Promise<void> => {
      resumePendingRef.current = true;
      const read = hasProfileRef.current
        ? getWatchProgress(fileId).then((p) => p.position)
        : Promise.resolve(getSavedProgress(fileId));
      return read
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

    const resumeOnce = (duration: number): Promise<void> => {
      if (resumedRef.current) return Promise.resolve();
      const requested = initialTimeRef.current;
      if (requested != null && usable(requested)) {
        // An explicit request needs no length: there is no window to
        // check it against, and no round-trip to wait for.
        resumedRef.current = true;
        mc.seek(requested);
        lastSavedRef.current = requested;
        return Promise.resolve();
      }
      // Stored progress needs a length (the window is measured from the
      // end), so a live stream never resumes.
      if (!usable(duration)) return Promise.resolve();
      resumedRef.current = true;
      return restoreStored(duration);
    };

    // Read the controller rather than the clock: this runs from the
    // player's own metadata event, and the clock's last tick can be
    // older than the news the player is bringing.
    resumeNowRef.current = () => {
      let duration = 0;
      try {
        duration = mc.getDuration();
      } catch {
        // Player not ready; the tick fallback will pick it up.
      }
      return resumeOnce(duration);
    };

    const onTick = () => {
      const { currentTime, duration, interrupted } = getMediaClockSnapshot(mc);

      if (!resumedRef.current) void resumeOnce(duration);

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
      resumeNowRef.current = null;
      unsubscribe();
      // Read the controller, not the clock: its last tick can be stale.
      try {
        if (mc.isInterrupted?.()) return;
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

  const notifyReady = useCallback(async () => {
    await resumeNowRef.current?.();
  }, []);

  return { notifyEnded, notifyReady };
}
