/**
 * Where you are in a folder of pages, and what turning one does.
 *
 * A landscape page in spread mode is shown as two halves, turned one at
 * a time, so a page turn moves either the half or the index. Both
 * full-screen viewers do this, and both derived the same seven values
 * from the same six inputs in their own copy of the arithmetic.
 *
 * Kept as pure functions with the state passed in, rather than as a hook
 * that owns it: one viewer holds this state in a hook of its own and the
 * other in the component, and a viewer that only needs to *render* the
 * position should not have to own it to ask about it.
 */

export type ReadingDirection = "ltr" | "rtl";

export interface SpreadState {
  index: number;
  count: number;
  splitMode: boolean;
  readingDirection: ReadingDirection;
  /** Whether the current page is wide enough to be shown as two. */
  isCurrentLandscape: boolean;
  showRightHalf: boolean;
}

/** Where a turn lands: an index, and which half of it. */
export interface SpreadPosition {
  index: number;
  showRightHalf: boolean;
}

/** A spread is only *active* on a landscape page with the mode on. */
export function isSpreadActive(s: SpreadState): boolean {
  return s.splitMode && s.isCurrentLandscape;
}

/**
 * Which half you are on, in reading order rather than in screen order.
 * Right-to-left reading starts on the right half.
 */
export function isOnFirstHalf(s: SpreadState): boolean {
  return s.readingDirection === "ltr" ? !s.showRightHalf : s.showRightHalf;
}

/** `A` / `B` beside the page number, or nothing when there is no spread. */
export function halfLabel(s: SpreadState): "A" | "B" | null {
  if (!isSpreadActive(s)) return null;
  return isOnFirstHalf(s) ? "A" : "B";
}

export function canPageBack(s: SpreadState): boolean {
  return s.index > 0 || (isSpreadActive(s) && !isOnFirstHalf(s));
}

export function canPageForward(s: SpreadState): boolean {
  return s.index < s.count - 1 || (isSpreadActive(s) && isOnFirstHalf(s));
}

/**
 * The position one turn forward, or `null` at the end.
 *
 * Within a spread the turn moves the half. Across pages it lands on the
 * *first* half of the next page — which is the right half when reading
 * right-to-left.
 */
export function pageForward(s: SpreadState): SpreadPosition | null {
  if (isSpreadActive(s) && isOnFirstHalf(s)) {
    return { index: s.index, showRightHalf: s.readingDirection === "ltr" };
  }
  if (s.index < s.count - 1) {
    return { index: s.index + 1, showRightHalf: s.readingDirection === "rtl" };
  }
  return null;
}

/**
 * The position one turn back, or `null` at the start.
 *
 * Landing on the previous page lands on its *last* half, which is why
 * this one consults `splitMode` and not `isSpreadActive`: whether the
 * page you are arriving at has two halves is not something the page you
 * are leaving can answer. It is corrected once that page reports its own
 * proportions.
 */
export function pageBack(s: SpreadState): SpreadPosition | null {
  if (isSpreadActive(s) && !isOnFirstHalf(s)) {
    return { index: s.index, showRightHalf: s.readingDirection === "rtl" };
  }
  if (s.index > 0) {
    return {
      index: s.index - 1,
      showRightHalf: s.splitMode && s.readingDirection === "ltr",
    };
  }
  return null;
}
