/**
 * How fast a released swipe must be travelling, in px/ms, to mark its row
 * done short of the distance that would.
 */
export const SWIPE_FLICK_VELOCITY = 0.11;

/** The shortest leftward travel that still counts as a flick, in px. */
export const SWIPE_FLICK_MIN_PX = 32;

export interface SwipeRelease {
  /** Pointer-up x minus pointer-down x. */
  dx: number;
  /** Pointer-up y minus pointer-down y. */
  dy: number;
  /** The row's width at pointer-down. */
  width: number;
  /** `performance.now()` at pointer-up minus at pointer-down. */
  elapsedMs: number;
  /** A leftward swipe started during the press. */
  swiping: boolean;
  /** The long-press fired during the press. */
  longPressed: boolean;
  /** The press was handed to vertical scrolling. */
  scrolled: boolean;
}

export function swipeCompletes({
  dx,
  dy,
  width,
  elapsedMs,
  swiping,
  longPressed,
  scrolled,
}: SwipeRelease): boolean {
  if (longPressed || scrolled) return false;
  if (!(dx < 0) || !(Math.abs(dx) > Math.abs(dy))) return false;
  if (Math.abs(dx) >= width / 3) return true;
  if (!swiping || Math.abs(dx) < SWIPE_FLICK_MIN_PX || elapsedMs <= 0) {
    return false;
  }
  return Math.abs(dx) / elapsedMs > SWIPE_FLICK_VELOCITY;
}
