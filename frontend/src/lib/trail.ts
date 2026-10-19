/**
 * How a breadcrumb trail is folded when it names more places than a row can
 * hold. Shared because the archive walks a zip with buttons and cannot use
 * the `Breadcrumb` component.
 */

/** The drive, or the archive file — a trail always says which one it is in. */
const LEAD_KEPT = 1;

/**
 * Folding one item buys nothing: the marker is as wide as a short name, so
 * the reader would lose a name only to learn that a name was lost.
 */
const FOLD_MINIMUM = 2;

export interface FoldedTrail<T> {
  /** Drawn before the marker. */
  before: T[];
  /** Replaced by the marker. Empty when the trail is drawn whole. */
  folded: T[];
  /** Drawn after the marker. */
  after: T[];
}

/**
 * `tailKept` is how many of `items` end the trail: two where the last of them
 * is the leaf, one where the caller draws its own leaf after them.
 *
 * `before` ++ `folded` ++ `after` is always `items`.
 */
export function foldTrail<T>(items: T[], tailKept: number): FoldedTrail<T> {
  const foldEnd = Math.max(LEAD_KEPT, items.length - tailKept);
  const folded = items.slice(LEAD_KEPT, foldEnd);
  if (folded.length < FOLD_MINIMUM) return { before: items, folded: [], after: [] };
  return {
    before: items.slice(0, LEAD_KEPT),
    folded,
    after: items.slice(foldEnd),
  };
}
