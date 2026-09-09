/**
 * The mobile Bottom Sheet's geometry, in the units vaul is handed.
 *
 * Split out of `MobileInspectorSheet` because none of it is React: the
 * layout suite under `e2e-layout/` computes a snap in Node and then
 * measures what Chromium does with it, and a module that pulled in vaul
 * and `next-intl` to do that would be measuring its own imports.
 *
 * Everything here is a fraction of `window.innerHeight`, which is the
 * only viewport vaul knows: `snapPointsOffset` is a pure function of
 * that and the snap point, and the drawer's own box is not an input to
 * it (vaul 1.1.2). The drawer's height is expressed against the same
 * number, by `sheetDrawerHeightPx` below — see `useViewportHeight` for
 * why a CSS viewport unit is a different quantity.
 */

/**
 * The resting height of the sheet, in px.
 *
 * 56px is a row: the file's name and the controls that act on it. It is
 * the whole reason the sheet rests rather than closes — on a phone the
 * per-file actions used to be somewhere in a column the reader had to
 * find, and now they are in the same place on every file.
 *
 * `DESIGN.md` §Layering states it, and the parity test binds the two.
 * It is also the unit the derived snap's upper bound is expressed in,
 * below.
 */
export const SHEET_PEEK_PX = 56;

/**
 * `Drawer.Content`'s own height, as a fraction of the viewport.
 *
 * **Not the same quantity as `SHEET_SNAP_FULL`**, which happens to carry
 * the same digits. This is how tall the drawer is; that is how far up
 * one of its snap points brings it. Deriving either from the other would
 * couple two numbers that are free to move apart.
 */
export const SHEET_DRAWER_VH = 0.9;

/** The snap vaul is handed for `full`. */
export const SHEET_SNAP_FULL = 0.9;

/**
 * The snap `half` falls back to when there is nothing to derive.
 *
 * A Markdown note, a PDF, an image: nothing on the page has a bottom
 * edge the sheet is trying to stay under, so `half` keeps the fixed
 * fraction it had before the derivation existed. A page whose player
 * leaves less room than this is the same answer for the same reason —
 * see `halfSnapUnderPlayer`.
 */
export const SHEET_SNAP_HALF_FALLBACK = 0.5;

/**
 * `Drawer.Content`'s height in px, for a viewport of this height.
 *
 * **The component's height comes from here, not from a `vh` class.**
 * The drawer's height is one of the two terms in the derivation below,
 * and the other is `window.innerHeight`; a CSS viewport unit would size
 * the box against a viewport vaul has never heard of. On a phone with
 * the URL bar showing, `100vh` — the *large* viewport — is taller than
 * `innerHeight` by the height of that bar, and the sheet's top edge
 * lands that far above where the arithmetic put it, over the player it
 * exists to leave whole.
 *
 * So the number is computed in JS from the viewport vaul reads and
 * written on the element, and `MobileInspectorSheet.test.tsx` holds the
 * drawer to it and to carrying no viewport unit of its own.
 */
export function sheetDrawerHeightPx(viewportHeight: number): number {
  return SHEET_DRAWER_VH * viewportHeight;
}

/**
 * The room a snap leaves on screen, in px.
 *
 * The subtraction `SHEET_VISIBLE_HEIGHT` performs in CSS: vaul
 * translates the drawer down by `vh × (1 − snap)` and the drawer is
 * anchored to the bottom edge, so what is left is its own height less
 * that translate.
 */
function roomAtSnap(viewportHeight: number, snap: number): number {
  return sheetDrawerHeightPx(viewportHeight) - viewportHeight * (1 - snap);
}

export interface HalfSnapInput {
  /** `window.innerHeight`, which is the viewport vaul derives from. */
  viewportHeight: number;
  /** The player wrapper's `getBoundingClientRect().bottom`. */
  playerBottom: number;
}

/**
 * The snap that lands the sheet's top edge on the player's bottom edge.
 *
 * **The mechanism, not a number.** Asking for the sheet's top edge to
 * sit at the player's bottom is asking for the room a snap leaves on
 * screen — `roomAtSnap` above — to be exactly the room under the
 * player, which solves for the snap in one step:
 *
 *     drawerHeight − vh × (1 − snap) = vh − playerBottom
 *
 * Read the drawer's height out of `sheetDrawerHeightPx` rather than
 * writing the difference as a constant: an offset term is the same
 * expression with the drawer's height already substituted into it, and
 * it goes silently wrong the moment that height moves.
 *
 * **The derivation only applies while it gives the reader more room
 * than the fixed fraction it replaced.** Below that there is nothing to
 * buy: a sheet raised to less than `half` used to show has taken the
 * page away to protect a player that has already taken the screen. A
 * phone held sideways is where this happens — the stylesheet caps a
 * framed player at the scrollport's own height there, so the room under
 * it is a handful of pixels — and the answer is the same fixed fraction
 * a page with no player gets, not a sheet one row tall.
 *
 * The upper bound is `full`'s own room less a row. Past it the two
 * expanded states stop being distinguishable and a drag between them
 * would move nothing, so `half` stops one row short. An audio bar,
 * which is short at every viewport, is the shape that gets there.
 *
 * @returns the snap, or `null` when there is nothing to derive — a
 * viewport with no height, a rect that never laid out, a player that
 * leaves less room than the fallback would, or a screen too short for the
 * two bounds to leave anything between them. The caller falls back to
 * `SHEET_SNAP_HALF_FALLBACK`, so the result is never below it.
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
