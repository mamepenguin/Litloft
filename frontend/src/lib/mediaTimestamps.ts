/**
 * Finds playback timestamps written in free text, so a description can
 * offer the jumps its author meant by writing them.
 *
 * The accepted grammar is exactly what ``formatDuration`` emits —
 * ``M:SS`` and ``H:MM:SS``. Reading and writing from one vocabulary is
 * the point: a form the app can produce but not read back, or the
 * reverse, is a drift that no single change would reveal.
 *
 * Nothing here is persisted. This is a rendering concern, and callers
 * must keep it one; see the spec for why parsing a field the user edits
 * at will must not replace anything durable.
 */

/** A stretch of the source that carries no timestamp. */
export interface TextSegment {
  kind: "text";
  text: string;
}

/** A timestamp, with the position it names. */
export interface TimestampSegment {
  kind: "timestamp";
  /** The source text, exactly as written — `01:07` stays `01:07`. */
  text: string;
  seconds: number;
}

export type MediaTextSegment = TextSegment | TimestampSegment;

/**
 * ``H:MM:SS`` first, so `1:02:03` is read whole rather than as `1:02`
 * followed by a stray `:03`. Both arms fix the seconds at two digits,
 * which is what keeps ratios and verse numbers (`16:9`, `1:1`) out.
 */
const CANDIDATE = /(\d{1,2}):([0-5]\d):([0-5]\d)|(\d{1,2}):([0-5]\d)/g;

/** Digits and colons continue a number; a match may not touch one. */
function isBoundary(char: string | undefined): boolean {
  return char === undefined || !(char === ":" || (char >= "0" && char <= "9"));
}

export function parseMediaTimestamps(
  text: string,
  durationSeconds: number | null,
): MediaTextSegment[] {
  // A bound can only reject what it can compare against. An unknown or
  // nonsensical duration is not evidence that a timestamp is out of
  // range, so it withholds judgement rather than inventing one.
  const limit =
    durationSeconds !== null &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
      ? durationSeconds
      : null;

  const segments: MediaTextSegment[] = [];
  let runStart = 0;

  CANDIDATE.lastIndex = 0;
  for (
    let match = CANDIDATE.exec(text);
    match !== null;
    match = CANDIDATE.exec(text)
  ) {
    const [raw, h, hm, hs, m, ms] = match;
    const start = match.index;
    const end = start + raw.length;

    // Resuming past the whole candidate is safe, not just cheap: a
    // candidate is made only of digits and colons, so any shorter match
    // hiding inside it would begin against one of those and fail this
    // same test. `191:23` has no reading; it is not `91:23`.
    if (!isBoundary(text[start - 1]) || !isBoundary(text[end])) continue;

    const seconds =
      h !== undefined
        ? Number(h) * 3600 + Number(hm) * 60 + Number(hs)
        : Number(m) * 60 + Number(ms);

    if (limit !== null && seconds > limit) continue;

    if (start > runStart) {
      segments.push({ kind: "text", text: text.slice(runStart, start) });
    }
    segments.push({ kind: "timestamp", text: raw, seconds });
    runStart = end;
  }

  if (runStart < text.length) {
    segments.push({ kind: "text", text: text.slice(runStart) });
  }
  return segments;
}
