/**
 * vaul asks "may I drag now?" on every pointer move, and answers yes
 * whenever the scroller happens to be at its top, so a fling that coasts to
 * the top becomes a sheet drag. So the owner is latched from what was true
 * when the finger landed, and the sheet only ever takes a gesture the
 * scroller had no use for.
 */

/**
 * Not `=== 0`: a scroller on a device pixel ratio other than 1 reports a
 * fractional `scrollTop`.
 */
export const SHEET_PULL_TOP_EPS_PX = 2;

export const SHEET_PULL_DIRECTION_EPS_PX = 4;

export const SHEET_PULL_HANDOFF_PX = 48;

export function sheetDismissDistancePx(visibleHeight: number): number {
  return Math.max(0, visibleHeight) / 3;
}

/**
 * How fast the finger must be leaving, downward, to collapse the sheet at
 * a distance that would otherwise spring back. px/ms.
 */
export const SHEET_PULL_DISMISS_VELOCITY = 0.5;

export type SheetPullOwner = "undecided" | "scroller" | "sheet";

export interface SheetPullState {
  owner: SheetPullOwner;
  /** How far down the sheet is drawn, in px. Never negative. */
  pull: number;
  /** The finger's displacement when the sheet took the gesture. */
  origin: number | null;
  /**
   * Downward movement the scroller did **not** consume while sitting at
   * its top, toward `SHEET_PULL_HANDOFF_PX`. Reset whenever the scroller
   * moves again: that push was answered by scrolling.
   */
  pushedPastTop: number;
  lastDy: number;
  lastScrollTop: number;
}

export interface SheetPullBegin {
  scrollTop: number;
  maxScroll: number;
}

export interface SheetPullMove {
  /** Displacement from where the finger landed. Positive is downward. */
  dy: number;
  scrollTop: number;
}

export function beginSheetPull({
  scrollTop,
  maxScroll,
}: SheetPullBegin): SheetPullState {
  const takeable = maxScroll <= 0 || scrollTop <= SHEET_PULL_TOP_EPS_PX;
  return {
    owner: takeable ? "undecided" : "scroller",
    pull: 0,
    origin: null,
    pushedPastTop: 0,
    lastDy: 0,
    lastScrollTop: scrollTop,
  };
}

export function advanceSheetPull(
  state: SheetPullState,
  { dy, scrollTop }: SheetPullMove,
): SheetPullState {
  const moved = { lastDy: dy, lastScrollTop: scrollTop };

  if (state.owner === "sheet") {
    const origin = state.origin ?? 0;
    return { ...state, ...moved, pull: Math.max(0, dy - origin) };
  }

  if (state.owner === "undecided") {
    if (dy >= SHEET_PULL_DIRECTION_EPS_PX) {
      // Taken from the landing point, not from here, so the sheet sits
      // under the finger rather than a few pixels behind it.
      return { ...state, ...moved, owner: "sheet", origin: 0, pull: dy };
    }
    if (dy <= -SHEET_PULL_DIRECTION_EPS_PX) {
      return { ...state, ...moved, owner: "scroller" };
    }
    return { ...state, ...moved };
  }

  const delta = dy - state.lastDy;
  // `< 0` and not `<= 0`: Chromium coalesces moves and rounds `clientY`,
  // so a slow push at the top delivers same-position frames.
  if (delta < 0 || scrollTop > SHEET_PULL_TOP_EPS_PX) {
    return { ...state, ...moved, pushedPastTop: 0 };
  }
  // Otherwise a fling that arrives at the top counts as a push past it.
  const consumed = Math.max(0, state.lastScrollTop - scrollTop);
  const pushedPastTop = state.pushedPastTop + Math.max(0, delta - consumed);
  if (pushedPastTop < SHEET_PULL_HANDOFF_PX) {
    return { ...state, ...moved, pushedPastTop };
  }
  return { ...state, ...moved, owner: "sheet", origin: dy, pull: 0 };
}

/**
 * @param velocity The finger's vertical speed as it left, px/ms, positive
 *   downward.
 * @param dismissPx From `sheetDismissDistancePx`.
 */
export function releaseSheetPull(
  state: SheetPullState,
  velocity: number,
  dismissPx: number,
): "dismiss" | "settle" {
  if (state.owner !== "sheet" || state.pull <= 0) return "settle";
  if (state.pull >= dismissPx) return "dismiss";
  return velocity >= SHEET_PULL_DISMISS_VELOCITY ? "dismiss" : "settle";
}
