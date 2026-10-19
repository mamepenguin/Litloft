import type { MatchMeta, MatchTimestamp } from "@/types";

export interface MatchTimestampPill {
  /**
   * The segment's raw start, unrounded. De-duplication floors it and so
   * does rendering; a caller that builds a `?t=` link must floor it too.
   */
  seconds: number;
  kind: "transcript" | "clip";
}

export interface CollectedMatchTimestamps {
  /** At most `MAX_TIMESTAMP_PILLS`, ascending. */
  shown: MatchTimestampPill[];
  /** How many distinct moments did not fit. 0 when they all did. */
  overflow: number;
}

export const MAX_TIMESTAMP_PILLS = 3;

/**
 * `formatDuration` floors to whole seconds, so two segments that differ
 * by less than a second render the same string. De-duplicating on the
 * floored value is therefore de-duplicating on what the reader sees:
 * 799.2s and 799.8s are both "13:19" and must not both get a pill.
 */
function dedupeKey(seconds: number): number {
  return Math.floor(seconds);
}

export function collectMatchTimestamps(
  meta: MatchMeta | undefined,
): CollectedMatchTimestamps {
  if (!meta) return { shown: [], overflow: 0 };

  const all: MatchTimestampPill[] = [];
  // `Number.isFinite` rather than `typeof … === "number"`: it rejects NaN
  // and Infinity, and `formatDuration(Infinity)` renders "Infinity:NaN:NaN".
  const collect = (
    segments: MatchTimestamp[] | undefined,
    kind: MatchTimestampPill["kind"],
  ) => {
    for (const segment of segments ?? []) {
      const start = segment.time_range?.[0];
      if (Number.isFinite(start) && start >= 0) {
        all.push({ seconds: start, kind });
      }
    }
  };
  collect(meta.transcript, "transcript");
  collect(meta.clip, "clip");

  all.sort((a, b) => a.seconds - b.seconds);

  const distinct: MatchTimestampPill[] = [];
  const seen = new Set<number>();
  for (const pill of all) {
    const key = dedupeKey(pill.seconds);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(pill);
  }

  return {
    shown: distinct.slice(0, MAX_TIMESTAMP_PILLS),
    overflow: Math.max(0, distinct.length - MAX_TIMESTAMP_PILLS),
  };
}
