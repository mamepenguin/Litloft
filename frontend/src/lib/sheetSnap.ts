/**
 * Everything here is a fraction of `window.innerHeight`, which is the
 * only viewport vaul knows: `snapPointsOffset` is a pure function of
 * that and the snap point, and the drawer's own box is not an input to
 * it (vaul 1.1.2).
 */

/** 56px is a row: the file's name and the controls that act on it. */
export const SHEET_PEEK_PX = 56;

/**
 * **Not the same quantity as `SHEET_SNAP_FULL`**, which happens to carry
 * the same digits. This is how tall the drawer is; that is how far up
 * one of its snap points brings it. Deriving either from the other would
 * couple two numbers that are free to move apart.
 */
export const SHEET_DRAWER_VH = 0.9;

export const SHEET_SNAP_FULL = 0.9;

export const SHEET_SNAP_HALF_FALLBACK = 0.5;

/**
 * **The component's height comes from here, not from a `vh` class.**
 * On a phone with the URL bar showing, `100vh` — the *large* viewport — is
 * taller than `innerHeight` by the height of that bar, and the sheet's top
 * edge lands that far above where the arithmetic put it.
 */
export function sheetDrawerHeightPx(viewportHeight: number): number {
  return SHEET_DRAWER_VH * viewportHeight;
}

/**
 * vaul translates the drawer down by `vh × (1 − snap)` and the drawer is
 * anchored to the bottom edge, so what is left is its own height less
 * that translate.
 */
function roomAtSnap(viewportHeight: number, snap: number): number {
  return sheetDrawerHeightPx(viewportHeight) - viewportHeight * (1 - snap);
}

export function sheetTopAtSnap(viewportHeight: number, snap: number): number {
  return viewportHeight - roomAtSnap(viewportHeight, snap);
}

export interface HalfSnapInput {
  /** `window.innerHeight`, which is the viewport vaul derives from. */
  viewportHeight: number;
  playerBottom: number;
}

/**
 * The snap that lands the sheet's top edge on the player's bottom edge:
 *
 *     drawerHeight − vh × (1 − snap) = vh − playerBottom
 *
 * Read the drawer's height out of `sheetDrawerHeightPx` rather than
 * writing the difference as a constant: an offset term goes silently
 * wrong the moment that height moves.
 *
 * The upper bound is `full`'s own room less a row. Past it the two
 * expanded states stop being distinguishable and a drag between them
 * would move nothing.
 *
 * @returns the snap, or `null` when there is nothing to derive. The caller
 * falls back to `SHEET_SNAP_HALF_FALLBACK`, so the result is never below it.
 */
export function halfSnapUnderPlayer({
  viewportHeight,
  playerBottom,
}: HalfSnapInput): number | null {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return null;
  // A bottom edge at or above the viewport's top is not a player that
  // has been measured. It is a rect that never laid out — jsdom, a
  // subtree that has not painted — and the room it implies is the whole
  // window, which would clamp to a sheet covering the very player it was
  // supposed to leave alone. Nothing to derive; fall back.
  if (!Number.isFinite(playerBottom) || playerBottom <= 0) return null;

  const smallestRoom = roomAtSnap(viewportHeight, SHEET_SNAP_HALF_FALLBACK);
  const largestRoom =
    roomAtSnap(viewportHeight, SHEET_SNAP_FULL) - SHEET_PEEK_PX;
  // The two bounds cross on a window too short to hold both. Not a
  // phone, but it is what `viewportHeight` reads as while a tab is being
  // restored or a window dragged to nothing.
  if (largestRoom < smallestRoom) return null;

  const room = viewportHeight - playerBottom;
  if (room < smallestRoom) return null;

  return (
    1 -
    (sheetDrawerHeightPx(viewportHeight) - Math.min(room, largestRoom)) /
      viewportHeight
  );
}
