export interface PlayedRange {
  start: number;
  end: number;
}

/** A stretch shorter than this is a glance or a search for a scene, not viewing. */
export const MIN_COUNTED_SECONDS = 10;
/** Tolerance for a player's position wobbling or being published late. */
const SLACK_SECONDS = 1;
export const MAX_PENDING_RANGES = 256;
export const PLAYED_RANGES_SEND_INTERVAL_MS = 15_000;

export interface PlayedRangeSample {
  hasProfile: boolean;
  /** Playing, not interrupted, a usable duration, resume not pending, rate readable. */
  eligible: boolean;
  position: number;
  rate: number;
  wallMs: number;
}

interface Stretch {
  start: number;
  end: number;
  /** Where the part not yet turned into a range begins. */
  sentUpTo: number;
  counted: boolean;
}

export interface PlayedRangeCapture {
  observe(sample: PlayedRangeSample): void;
  /** A send moment. `final` is the effect's teardown: nothing is held after it. */
  flush(hasProfile: boolean, final?: boolean): void;
}

export function createPlayedRangeCapture(
  fileId: string,
  send: (fileId: string, ranges: PlayedRange[]) => Promise<number>,
): PlayedRangeCapture {
  let active = true;
  let tracking = false;
  let refPosition = 0;
  let refWallMs = 0;
  let stretch: Stretch | null = null;
  let pending: PlayedRange[] = [];

  const cut = (s: Stretch) => {
    if (s.counted && s.end > s.sentUpTo) {
      pending.push({ start: s.sentUpTo, end: s.end });
      s.sentUpTo = s.end;
    }
  };

  const close = () => {
    if (stretch) cut(stretch);
    stretch = null;
  };

  const open = (position: number) => {
    stretch = { start: position, end: position, sentUpTo: position, counted: false };
  };

  const extend = (s: Stretch, position: number) => {
    s.end = Math.max(s.end, position);
    if (s.end - s.start >= MIN_COUNTED_SECONDS) s.counted = true;
  };

  const observe = (sample: PlayedRangeSample) => {
    if (!active) return;
    if (!sample.hasProfile) {
      tracking = false;
      stretch = null;
      return;
    }
    if (!sample.eligible) {
      tracking = false;
      return;
    }
    const { position, wallMs } = sample;
    if (!tracking) {
      tracking = true;
      refPosition = position;
      refWallMs = wallMs;
      if (stretch && Math.abs(position - stretch.end) <= SLACK_SECONDS) {
        extend(stretch, position);
      } else {
        close();
        open(position);
      }
      return;
    }
    const delta = position - refPosition;
    const allowance =
      (Math.max(0, wallMs - refWallMs) / 1000) * sample.rate + SLACK_SECONDS;
    if (delta > 0 && delta <= allowance) {
      if (stretch) extend(stretch, position);
      else open(position);
      refPosition = position;
      refWallMs = wallMs;
    } else if (delta <= 0 && delta >= -SLACK_SECONDS) {
      // Unchanged: the reference keeps its wall time, so a player that
      // publishes its position on a slow timer still reads as played.
    } else {
      close();
      open(position);
      refPosition = position;
      refWallMs = wallMs;
    }
  };

  const flush = (hasProfile: boolean, final = false) => {
    if (!active) return;
    if (stretch) cut(stretch);
    if (final) {
      active = false;
      stretch = null;
    }
    if (!hasProfile) {
      pending = [];
      return;
    }
    if (pending.length > MAX_PENDING_RANGES) {
      pending = pending.slice(pending.length - MAX_PENDING_RANGES);
    }
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    // After teardown nothing flushes again, so a retried batch is dropped.
    const retry = () => {
      pending = [...batch, ...pending];
    };
    let request: Promise<number>;
    try {
      request = send(fileId, batch);
    } catch {
      retry();
      return;
    }
    request.then(
      (status) => {
        // A 4xx cannot succeed on resend, so it is dropped like a success.
        if (status >= 500) retry();
      },
      retry,
    );
  };

  return { observe, flush };
}

/** Resolves with the response status; rejects only on a network failure. */
export async function sendPlayedRanges(
  fileId: string,
  ranges: PlayedRange[],
): Promise<number> {
  const res = await fetch(`/api/files/${fileId}/played-ranges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    // The send at pagehide or unmount has to outlive the page.
    keepalive: true,
    body: JSON.stringify({ ranges }),
  });
  return res.status;
}
