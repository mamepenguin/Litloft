"use client";

/**
 * The watched band's data, keyed by media controller: the host player
 * registers the file and the viewer, `MediaControls` subscribes, and
 * whichever arrives second starts the one read.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { MediaController } from "./mediaController";
import { getPlayedSegments } from "./api";
import type { PlayedSegmentItem, WatchedRange } from "@/types";

export const DEFAULT_SEGMENT_SECONDS = 5;

export interface WatchedPiece {
  /** Seconds from the start of the file. */
  start: number;
  end: number;
  level: number;
}

export interface SendToken {
  fileId: string;
  nickname: string;
}

type Listener = () => void;

interface Entry {
  fileId: string | null;
  nickname: string | null;
  readTotals: Map<number, number>;
  sentTotals: Map<number, number>;
  segmentSeconds: number;
  /** The (file, nickname) the in-flight or applied read belongs to. */
  readFor: string | null;
  version: number;
  listeners: Set<Listener>;
  skipListeners: Set<Listener>;
}

const entries = new Map<MediaController, Entry>();

function ensure(mc: MediaController): Entry {
  const existing = entries.get(mc);
  if (existing) return existing;
  const created: Entry = {
    fileId: null,
    nickname: null,
    readTotals: new Map(),
    sentTotals: new Map(),
    segmentSeconds: DEFAULT_SEGMENT_SECONDS,
    readFor: null,
    version: 0,
    listeners: new Set(),
    skipListeners: new Set(),
  };
  entries.set(mc, created);
  return created;
}

function notify(entry: Entry): void {
  for (const listener of [...entry.listeners]) {
    if (entry.listeners.has(listener)) listener();
  }
}

function readKey(fileId: string, nickname: string): string {
  return `${fileId}\u0000${nickname}`;
}

function maybeRead(entry: Entry): void {
  if (entry.fileId === null || entry.nickname === null) return;
  if (entry.listeners.size === 0) return;
  const key = readKey(entry.fileId, entry.nickname);
  if (entry.readFor === key) return;
  entry.readFor = key;
  const fileId = entry.fileId;
  getPlayedSegments(fileId)
    .then((answer) => {
      if (entry.readFor !== key) return;
      entry.readTotals = toTotals(answer.segments);
      entry.segmentSeconds =
        Number.isFinite(answer.segment_seconds) && answer.segment_seconds > 0
          ? answer.segment_seconds
          : DEFAULT_SEGMENT_SECONDS;
      entry.version += 1;
      notify(entry);
    })
    .catch(() => {
      // The band stays empty and is not retried; progress and range
      // sends are unaffected by a failed read.
    });
}

function toTotals(segments: PlayedSegmentItem[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const segment of segments) {
    totals.set(segment.index, segment.played_seconds);
  }
  return totals;
}

/**
 * Split starts and ends the way the backend does, so the band shows the
 * same segments the next page load will read back.
 */
export function splitRanges(
  ranges: WatchedRange[],
  segmentSeconds: number,
): Map<number, number> {
  const totals = new Map<number, number>();
  if (!(segmentSeconds > 0)) return totals;
  for (const range of ranges) {
    const first = Math.floor(range.start / segmentSeconds);
    const last = Math.ceil(range.end / segmentSeconds);
    for (let index = first; index < last; index += 1) {
      const lo = Math.max(range.start, index * segmentSeconds);
      const hi = Math.min(range.end, (index + 1) * segmentSeconds);
      if (hi > lo) totals.set(index, (totals.get(index) ?? 0) + hi - lo);
    }
  }
  return totals;
}

function sumTotals(entry: Entry): Map<number, number> {
  const totals = new Map(entry.readTotals);
  for (const [index, seconds] of entry.sentTotals) {
    totals.set(index, (totals.get(index) ?? 0) + seconds);
  }
  return totals;
}

function dropEntryIfUnused(mc: MediaController, entry: Entry): void {
  if (entry.fileId === null && entry.listeners.size === 0 && entry.skipListeners.size === 0) {
    entries.delete(mc);
  }
}

export const watchedRangesStore = {
  /**
   * The host's half: the file and the viewer the controller is playing
   * for. A change of either starts over, so nothing from the previous
   * file or viewer is ever drawn.
   */
  register(mc: MediaController, fileId: string, nickname: string | null): void {
    const entry = ensure(mc);
    if (entry.fileId === fileId && entry.nickname === nickname) {
      maybeRead(entry);
      return;
    }
    entry.fileId = fileId;
    entry.nickname = nickname;
    entry.readTotals = new Map();
    entry.sentTotals = new Map();
    entry.segmentSeconds = DEFAULT_SEGMENT_SECONDS;
    entry.readFor = null;
    entry.version += 1;
    notify(entry);
    maybeRead(entry);
  },

  unregister(mc: MediaController): void {
    const entry = entries.get(mc);
    if (!entry) return;
    entry.fileId = null;
    entry.nickname = null;
    entry.readTotals = new Map();
    entry.sentTotals = new Map();
    entry.segmentSeconds = DEFAULT_SEGMENT_SECONDS;
    entry.readFor = null;
    entry.version += 1;
    notify(entry);
    dropEntryIfUnused(mc, entry);
  },

  subscribe(mc: MediaController, listener: Listener): () => void {
    const entry = ensure(mc);
    entry.listeners.add(listener);
    maybeRead(entry);
    return () => {
      entry.listeners.delete(listener);
      dropEntryIfUnused(mc, entry);
    };
  },

  version(mc: MediaController): number {
    return entries.get(mc)?.version ?? 0;
  },

  pieces(mc: MediaController, duration: number): WatchedPiece[] {
    const entry = entries.get(mc);
    if (!entry || !(duration > 0)) return [];
    const segmentSeconds = entry.segmentSeconds;
    if (!(segmentSeconds > 0)) return [];
    const totals = sumTotals(entry);
    const indexes = [...totals.keys()].sort((a, b) => a - b);
    const pieces: WatchedPiece[] = [];
    for (const index of indexes) {
      const start = index * segmentSeconds;
      if (start >= duration) continue;
      const end = Math.min(start + segmentSeconds, duration);
      const length = end - start;
      const level = Math.min(3, Math.max(1, Math.round(totals.get(index)! / length)));
      const last = pieces[pieces.length - 1];
      if (last && last.level === level && last.end === start) last.end = end;
      else pieces.push({ start, end, level });
    }
    return pieces;
  },

  /** Snapshot for a send about to start, so a late 2xx can be matched. */
  beginSend(mc: MediaController, fileId: string): SendToken | null {
    const entry = entries.get(mc);
    if (!entry || entry.nickname === null) return null;
    return { fileId, nickname: entry.nickname };
  },

  commitSend(mc: MediaController, token: SendToken | null, ranges: WatchedRange[]): void {
    if (!token) return;
    const entry = entries.get(mc);
    if (!entry) return;
    if (entry.fileId !== token.fileId || entry.nickname !== token.nickname) return;
    for (const [index, seconds] of splitRanges(ranges, entry.segmentSeconds)) {
      entry.sentTotals.set(index, (entry.sentTotals.get(index) ?? 0) + seconds);
    }
    entry.version += 1;
    notify(entry);
  },

  reportSkip(mc: MediaController): void {
    const entry = entries.get(mc);
    if (!entry) return;
    for (const listener of [...entry.skipListeners]) {
      if (entry.skipListeners.has(listener)) listener();
    }
  },

  subscribeSkip(mc: MediaController, listener: Listener): () => void {
    const entry = ensure(mc);
    entry.skipListeners.add(listener);
    return () => {
      entry.skipListeners.delete(listener);
      dropEntryIfUnused(mc, entry);
    };
  },
};

const EMPTY_PIECES: WatchedPiece[] = [];
const serverVersion = () => 0;

export function useWatchedPieces(
  mc: MediaController | null,
  duration: number,
): WatchedPiece[] {
  const subscribe = useCallback(
    (onChange: () => void) =>
      mc ? watchedRangesStore.subscribe(mc, onChange) : () => {},
    [mc],
  );
  const getVersion = useCallback(
    () => (mc ? watchedRangesStore.version(mc) : 0),
    [mc],
  );
  useSyncExternalStore(subscribe, getVersion, serverVersion);
  return mc && duration > 0 ? watchedRangesStore.pieces(mc, duration) : EMPTY_PIECES;
}
