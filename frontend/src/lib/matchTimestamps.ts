import type { MatchMeta, MatchTimestamp } from "@/types";

/**
 * The timestamp pills under a search result — one rule, shared by both
 * core surfaces that draw them (`MergedResultItem` in the Cmd+K popup and
 * `MatchOverlay` on the results page), so the two cannot drift apart.
 *
 * The rule has two halves. A cap, because a row is a row. And
 * de-duplication, because a transcript hit and a scene hit landing in the
 * same second are two segments with different `time_range`s and one
 * moment to the reader: without it a file shows
 * `13:19 13:19 14:49 14:49 14:49` — five pills naming two moments.
 */

/** Whole-second start of one moment, plus where it came from. */
export interface MatchTimestampPill {
  /**
   * The segment's raw start, unrounded. De-duplication floors it and so
   * does rendering; a caller that builds a `?t=` link must floor it too.
   */
  seconds: number;
  /**
   * Which channel produced it. Only used to keep React keys unique when
   * a transcript hit and a scene hit share a second; the two draw
   * identically, because to the reader they are the same moment.
   */
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
  // and Infinity by construction rather than by the coincidence that
  // `NaN >= 0` is false, and it rejects a string the types say cannot be
  // there. `formatDuration(Infinity)` renders the string
  // "Infinity:NaN:NaN"; a pill is not the place to find that out.
  // `time_range` is optional-chained because a segment that reached the
  // badge without one must not take a pill with it.
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
