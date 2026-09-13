import {
  SHEET_PULL_DISMISS_VELOCITY,
  sheetDismissDistancePx,
} from "@/lib/sheetPullGesture";

export const SHEET_DISMISS_MIN_MS = 160;
export const SHEET_DISMISS_MAX_MS = 320;

/** Leaves at three times its average speed: `y1 / x1`. */
export const SHEET_DISMISS_EASING = "cubic-bezier(0.2, 0.6, 0.4, 1)";
const EASING_START_SLOPE = 3;

/**
 * Timed so the sheet starts at the speed the finger left at, rather than
 * stopping and setting off again.
 *
 * @param velocity px/ms, positive downward.
 */
export function sheetDismissDurationMs(
  distance: number,
  velocity: number,
): number {
  if (distance <= 0) return SHEET_DISMISS_MIN_MS;
  if (!(velocity > 0)) return SHEET_DISMISS_MAX_MS;
  const matched = (EASING_START_SLOPE * distance) / velocity;
  return Math.round(
    Math.min(SHEET_DISMISS_MAX_MS, Math.max(SHEET_DISMISS_MIN_MS, matched)),
  );
}

/**
 * The knob's own drag is vaul's, which with snap points only ever settles
 * on the nearest one when released slowly: however far below `half` the
 * finger let go, `half` is nearer than nothing.
 */
export function knobReleaseDismisses({
  sheetTop,
  halfTop,
  viewportHeight,
  velocity,
}: {
  sheetTop: number;
  halfTop: number;
  viewportHeight: number;
  velocity: number;
}): boolean {
  const below = sheetTop - halfTop;
  if (below <= 0) return false;
  if (below >= sheetDismissDistancePx(viewportHeight - halfTop)) return true;
  return velocity >= SHEET_PULL_DISMISS_VELOCITY;
}

/**
 * Short enough that a finger which stopped moving before lifting reads as
 * stopped — which is the gesture that must *not* be mistaken for a flick.
 *
 * **Measured against the moment the finger left, not against the last
 * move.** A finger that stops emits no further move event, so a window
 * applied only while moving never advances past the pause.
 */
export const SHEET_VELOCITY_WINDOW_MS = 120;

export interface VelocitySample {
  at: number;
  y: number;
}

/** px/ms, positive downward. */
export function releaseVelocity(
  samples: readonly VelocitySample[],
  releasedAt: number,
): number {
  const recent = samples.filter(
    (sample) => releasedAt - sample.at <= SHEET_VELOCITY_WINDOW_MS,
  );
  if (recent.length === 0) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = last.at - first.at;
  return elapsed > 0 ? (last.y - first.y) / elapsed : 0;
}
