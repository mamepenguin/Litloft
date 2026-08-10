const STORAGE_KEY = "recently-played";
const MAX_ENTRIES = 50;

export interface RecentEntry {
  fileId: string;
  timestamp: number;
  progress?: number;
  /**
   * Total media length in seconds, recorded alongside `progress`.
   *
   * Without it a stored position cannot be told apart from a finished
   * one, so the browser-local fallback could not express "completed"
   * the way server-backed WatchHistory does. Optional because entries
   * written before this field existed have no duration — those degrade
   * to "in progress", which is what they were treated as before.
   */
  duration?: number;
}

export interface SavedPlayback {
  position: number;
  /** 0 when unknown — callers must treat that as "not completed". */
  duration: number;
}

export function getRecentlyPlayed(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        typeof e === "object" && e !== null && typeof e.fileId === "string",
    );
  } catch {
    return [];
  }
}

function saveEntries(entries: RecentEntry[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {
    // localStorage unavailable
  }
}

export function addRecentlyPlayed(fileId: string): void {
  const entries = getRecentlyPlayed().filter((e) => e.fileId !== fileId);
  entries.unshift({ fileId, timestamp: Date.now() });
  saveEntries(entries);
}

export function getRecentFileIds(): string[] {
  return getRecentlyPlayed().map((e) => e.fileId);
}

export function getSavedProgress(fileId: string): number {
  const entry = getRecentlyPlayed().find((e) => e.fileId === fileId);
  return entry?.progress ?? 0;
}

export function getSavedPlayback(fileId: string): SavedPlayback {
  const entry = getRecentlyPlayed().find((e) => e.fileId === fileId);
  return {
    position: entry?.progress ?? 0,
    duration: entry?.duration ?? 0,
  };
}

export function saveProgress(
  fileId: string,
  time: number,
  duration?: number,
): void {
  // NaN / Infinity reach here from media elements that have not probed
  // their length yet. Storing one would survive JSON round-trips as
  // null and read back as "duration 0", which is the same as unknown —
  // so drop it here and keep whatever was already recorded.
  const usable =
    duration != null && Number.isFinite(duration) && duration > 0
      ? duration
      : null;
  const entries = getRecentlyPlayed().map((e) =>
    e.fileId === fileId
      ? {
          ...e,
          progress: time,
          // Omitting the argument leaves whatever duration is already
          // stored, so a caller that only knows the position cannot
          // erase the length recorded by one that did.
          ...(usable != null ? { duration: usable } : {}),
        }
      : e,
  );
  saveEntries(entries);
}

/**
 * Drop the stored playback markers for a file.
 *
 * Reaching the end of a video is NOT this: completion is a state we
 * keep (spec `2026-08-10-media-import-watch-surface.md` §4.2), and the
 * players record the final position instead. Only an explicit user
 * action — removing an item from recent history — belongs here.
 */
export function clearProgress(fileId: string): void {
  const entries = getRecentlyPlayed().map((e) =>
    e.fileId === fileId ? { ...e, progress: undefined, duration: undefined } : e,
  );
  saveEntries(entries);
}
