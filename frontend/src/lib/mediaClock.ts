"use client";

/**
 * A single shared playback clock over `MediaController`.
 *
 * Why this exists: several unrelated surfaces need to know where
 * playback currently is — the control bar, the floating mini player,
 * the transcript's active-cue highlight, chapter position, and Media
 * Session's `setPositionState`. `MediaController` is a pull-shaped
 * contract (getters, no events), and turning it into a push contract
 * would put an implementation burden on every backend including
 * third-party Loft providers. So we poll — but exactly once per
 * controller, here, instead of once per consumer wherever they happen
 * to live.
 *
 * Before this module the same polling was written out four times, and
 * one of those copies was private to the control bar, which is why the
 * transcript highlight could not be made to work for YouTube at all.
 *
 * Spec: docs/superpowers/specs/2026-08-11-playback-clock-foundation.md
 */

import { useCallback, useSyncExternalStore } from "react";
import type { MediaController } from "./mediaController";

export interface MediaClockSnapshot {
  currentTime: number;
  /** 0 when the backend has no usable length yet, or never will. */
  duration: number;
  paused: boolean;
  interrupted: boolean;
}

/**
 * Two rates rather than start/stop. A paused player can start playing
 * again without telling us — a keyboard shortcut, an ad ending, an
 * autoplay kicking in — so the heartbeat continues and only speeds up
 * when something is actually moving.
 */
export const MEDIA_CLOCK_ACTIVE_MS = 250;
export const MEDIA_CLOCK_IDLE_MS = 1000;

const EMPTY_SNAPSHOT: MediaClockSnapshot = Object.freeze({
  currentTime: 0,
  duration: 0,
  paused: true,
  interrupted: false,
});

interface ClockEntry {
  listeners: Set<() => void>;
  snapshot: MediaClockSnapshot;
  timer: ReturnType<typeof setInterval> | null;
  /** Interval currently in force, so we only restart when it changes. */
  rateMs: number;
}

/**
 * Keyed by controller instance, not by file id: two controllers for the
 * same file are two independent clocks, and one tearing down must not
 * stop the other. Weak so an entry disappears with the controller that
 * owns it — which only works if the timer is cleared on the last
 * unsubscribe, since a live timer strongly references its entry.
 */
const entries = new WeakMap<MediaController, ClockEntry>();

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** 0 means "no usable length", matching the control bar's convention. */
function usableDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function readSnapshot(mc: MediaController): MediaClockSnapshot {
  return {
    currentTime: finite(mc.getCurrentTime()),
    // Raw, deliberately. A `durationHint` from file metadata is a
    // property of the file rather than of the controller, and only some
    // consumers have one — they layer it on themselves.
    duration: usableDuration(mc.getDuration()),
    paused: mc.isPaused(),
    interrupted: mc.isInterrupted?.() ?? false,
  };
}

function sameSnapshot(a: MediaClockSnapshot, b: MediaClockSnapshot): boolean {
  return (
    a.currentTime === b.currentTime &&
    a.duration === b.duration &&
    a.paused === b.paused &&
    a.interrupted === b.interrupted
  );
}

function ensureEntry(mc: MediaController): ClockEntry {
  const existing = entries.get(mc);
  if (existing) return existing;
  let snapshot: MediaClockSnapshot;
  try {
    snapshot = readSnapshot(mc);
  } catch {
    // A controller can be built before its player is ready. Start from
    // the zero snapshot; the first successful tick corrects it.
    snapshot = EMPTY_SNAPSHOT;
  }
  const created: ClockEntry = {
    listeners: new Set(),
    snapshot,
    timer: null,
    rateMs: MEDIA_CLOCK_ACTIVE_MS,
  };
  entries.set(mc, created);
  return created;
}

function startTimer(mc: MediaController, entry: ClockEntry, rateMs: number) {
  if (entry.timer !== null) clearInterval(entry.timer);
  entry.rateMs = rateMs;
  entry.timer = setInterval(() => tick(mc, entry), rateMs);
}

function stopTimer(entry: ClockEntry) {
  if (entry.timer === null) return;
  clearInterval(entry.timer);
  entry.timer = null;
}

function tick(mc: MediaController, entry: ClockEntry) {
  let next: MediaClockSnapshot;
  try {
    next = readSnapshot(mc);
  } catch {
    // The YouTube player throws while it swaps media. Hold the last
    // good reading rather than blanking every consumer, and skip the
    // notification: a consumer sampling extra fields in its listener
    // would hit the same throw.
    return;
  }

  // The reference must stay identical while nothing moves, or
  // useSyncExternalStore re-renders forever.
  if (!sameSnapshot(entry.snapshot, next)) entry.snapshot = next;

  const desiredRate = next.paused ? MEDIA_CLOCK_IDLE_MS : MEDIA_CLOCK_ACTIVE_MS;
  if (desiredRate !== entry.rateMs) startTimer(mc, entry, desiredRate);

  // Every successful tick, not only the ones that changed something:
  // this is what lets a consumer needing fields the shared snapshot
  // excludes (volume, captions, buffered) sample them on the same
  // cadence without starting a second interval. Consumers that only
  // want the snapshot are insulated by its stable reference.
  //
  // A listener may subscribe or unsubscribe another synchronously, so
  // fix the audience up front and re-check it on the way through. The
  // copy keeps a subscriber that arrived mid-tick from being handed a
  // tick its effect had not finished setting up for; the membership
  // check keeps one that left mid-tick from being called after its
  // teardown. Iterating the live Set gives only the second property.
  for (const listener of [...entry.listeners]) {
    if (entry.listeners.has(listener)) listener();
  }
}

export function subscribeMediaClock(
  mc: MediaController,
  listener: () => void,
): () => void {
  const entry = ensureEntry(mc);
  entry.listeners.add(listener);
  if (entry.timer === null) {
    // Refresh before choosing a rate. The parked snapshot can be
    // arbitrarily old — nothing has been watching — so trusting its
    // `paused` could start a playing video on the idle heartbeat and
    // leave it there for a second. Safe to do here because subscribe
    // runs in an effect, and React re-reads the snapshot after
    // subscribing precisely to catch a store that moved in between.
    try {
      const fresh = readSnapshot(mc);
      if (!sameSnapshot(entry.snapshot, fresh)) entry.snapshot = fresh;
    } catch {
      // Keep the parked reading; the first successful tick corrects it.
    }
    startTimer(
      mc,
      entry,
      entry.snapshot.paused ? MEDIA_CLOCK_IDLE_MS : MEDIA_CLOCK_ACTIVE_MS,
    );
  }
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) stopTimer(entry);
  };
}

/**
 * The snapshot as of the last tick — deliberately *not* a fresh read.
 *
 * `useSyncExternalStore` calls this several times per render and throws
 * if two calls disagree, so it cannot read a moving player on demand.
 * The consequence is that the value only advances while something is
 * subscribed: a standalone call on an idle controller returns whatever
 * was last observed, which for a controller nobody ever subscribed to
 * is the reading taken when its entry was created. Pair reads with
 * `subscribeMediaClock` (or `useMediaClock`, which does it for you).
 */
export function getMediaClockSnapshot(
  mc: MediaController,
): MediaClockSnapshot {
  return ensureEntry(mc).snapshot;
}

export function useMediaClock(
  mc: MediaController | null,
): MediaClockSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      mc ? subscribeMediaClock(mc, onStoreChange) : () => {},
    [mc],
  );
  const getSnapshot = useCallback(
    () => (mc ? getMediaClockSnapshot(mc) : EMPTY_SNAPSHOT),
    [mc],
  );
  // Required even though every caller is a client component: without it
  // useSyncExternalStore throws during any server render or prerender.
  const getServerSnapshot = useCallback(() => EMPTY_SNAPSHOT, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
