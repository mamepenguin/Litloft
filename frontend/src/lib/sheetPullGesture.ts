/**
 * Who owns one touch gesture inside the mobile Bottom Sheet — the
 * scroller, or the sheet.
 *
 * ## Why an owner at all
 *
 * vaul asks "may I drag now?" on every pointer move, and answers yes
 * whenever the scroller happens to be at its top (`shouldDrag`, vaul
 * 1.1.2). So a fling that coasts to the top becomes a sheet drag on the
 * frame it arrives, and reading with a finger still down turns into
 * closing the sheet. Asking per frame is the defect: the question belongs
 * to the *gesture*, and a gesture is one continuous contact.
 *
 * So the owner is latched from what was true when the finger landed, and
 * the sheet only ever takes a gesture the scroller had no use for:
 *
 * - nothing to scroll, or at the top, and then moving down → the sheet;
 * - nothing to scroll, or at the top, and then moving up → the scroller,
 *   and it keeps it;
 * - below the top → the scroller, which may hand the gesture over, but
 *   only after the finger has pushed `SHEET_PULL_HANDOFF_PX` past the top.
 *
 * That last clause is what separates "scrolled to the top and kept
 * pushing" from "flicked hard and the momentum reached the top": the
 * flick's finger leaves within a few pixels of arriving, so it never
 * spends the push.
 *
 * ## What this module is not
 *
 * It is arithmetic over numbers a caller measured. It does not read the
 * DOM, does not know a `TouchEvent`, and cannot stop a browser from
 * scrolling — `useSheetPullToCollapse` does all three. Split out because
 * jsdom can run this and cannot run the other half: it lays nothing out,
 * so a test there can hand in `scrollTop` values but never produce one.
 */

/**
 * How far from the top still counts as the top.
 *
 * Not `=== 0`: a scroller on a device pixel ratio other than 1 reports a
 * fractional `scrollTop`, and an exact comparison refuses the gesture the
 * reader thinks they are making.
 */
export const SHEET_PULL_TOP_EPS_PX = 2;

/**
 * How far the finger must move before its direction is read.
 *
 * Under this the gesture is still undecided, so a touch that lands and
 * jitters neither scrolls nor drags.
 */
export const SHEET_PULL_DIRECTION_EPS_PX = 4;

/**
 * How far past the top the finger must push before the scroller hands the
 * gesture to the sheet.
 *
 * The whole distinction between a deliberate push and a spent fling, so
 * it is the one threshold here that is not about comfort.
 */
export const SHEET_PULL_HANDOFF_PX = 48;

/** How far the sheet must have travelled to collapse when released. */
export const SHEET_PULL_DISMISS_PX = 72;

/**
 * How fast the finger must be leaving, downward, to collapse the sheet at
 * a distance that would otherwise spring back. px/ms.
 */
export const SHEET_PULL_DISMISS_VELOCITY = 0.5;

/** Who a gesture belongs to, or that it has not said yet. */
export type SheetPullOwner = "undecided" | "scroller" | "sheet";

export interface SheetPullState {
  owner: SheetPullOwner;
  /**
   * How far down the sheet is drawn, in px. Zero unless the sheet owns
   * the gesture, and never negative — the sheet does not rise from its
   * content, because rising is what the knob is for.
   */
  pull: number;
  /**
   * The finger's displacement at the moment the sheet took the gesture,
   * so the sheet starts from where it was handed over rather than from
   * where the finger first touched. `null` until then.
   */
  origin: number | null;
  /**
   * Downward movement the scroller did **not** consume while sitting at
   * its top, toward `SHEET_PULL_HANDOFF_PX`. Reset whenever the scroller
   * moves again: that push was answered by scrolling.
   */
  pushedPastTop: number;
  /** The displacement this state was last advanced with. */
  lastDy: number;
  /** The scroller's offset this state was last advanced with. */
  lastScrollTop: number;
}

export interface SheetPullBegin {
  /** The scroller's offset when the finger landed. */
  scrollTop: number;
  /** `scrollHeight - clientHeight`: zero when there is nothing to scroll. */
  maxScroll: number;
}

export interface SheetPullMove {
  /** Displacement from where the finger landed. Positive is downward. */
  dy: number;
  /** The scroller's offset now. */
  scrollTop: number;
}

/** The state a gesture starts in, decided by what the scroller can do. */
export function beginSheetPull({
  scrollTop,
  maxScroll,
}: SheetPullBegin): SheetPullState {
  // Two ways a gesture can be the sheet's to take: the scroller has
  // nowhere to go at all, or it is at its top. Both still wait for a
  // direction — the sheet only wants the downward ones, and taking every
  // touch in a sheet that does not scroll means refusing the browser an
  // upward or sideways one it could have answered. A horizontally
  // scrollable descendant (the tab strip is `overflow-x-auto`) is the
  // shape that costs.
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

/** The state after one move of the finger. */
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
  // Moving up, or the scroller is not at its top: whatever was pushed is
  // not owed any more.
  //
  // `< 0` and not `<= 0`: a frame in which the finger did not move is
  // neither of those two things, and it is an ordinary frame — Chromium
  // coalesces moves and rounds `clientY`, so a slow push at the top
  // delivers same-position frames. Clearing on one made the reader start
  // the push over.
  if (delta < 0 || scrollTop > SHEET_PULL_TOP_EPS_PX) {
    return { ...state, ...moved, pushedPastTop: 0 };
  }
  /**
   * The part of this move the scroller answered by scrolling.
   *
   * Without the subtraction the whole of a move that *arrives* at the top
   * counts as a push past it, and one sample is enough to clear the
   * handoff: a browser reports touches every frame, so a fling delivers
   * hundreds of pixels of scroll in one of them. Which is the flick this
   * rule exists to refuse.
   */
  const consumed = Math.max(0, state.lastScrollTop - scrollTop);
  const pushedPastTop = state.pushedPastTop + Math.max(0, delta - consumed);
  if (pushedPastTop < SHEET_PULL_HANDOFF_PX) {
    return { ...state, ...moved, pushedPastTop };
  }
  return { ...state, ...moved, owner: "sheet", origin: dy, pull: 0 };
}

/**
 * What releasing the finger does.
 *
 * @param velocity The finger's vertical speed as it left, px/ms, positive
 *   downward.
 */
export function releaseSheetPull(
  state: SheetPullState,
  velocity: number,
): "dismiss" | "settle" {
  if (state.owner !== "sheet" || state.pull <= 0) return "settle";
  if (state.pull >= SHEET_PULL_DISMISS_PX) return "dismiss";
  return velocity >= SHEET_PULL_DISMISS_VELOCITY ? "dismiss" : "settle";
}
