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
 * it (vaul 1.1.2).
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
 * It is also the unit the derived snap is bounded by, below.
 */
export const SHEET_PEEK_PX = 56;

/**
 * `Drawer.Content`'s own height, as a fraction of the viewport.
 *
 * Tailwind cannot read a constant, so the class list still spells
 * `h-[90vh]`; `inspectorThresholdParity.test.ts` reads that class out of
 * the component and checks it against this.
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
 * The snap `half` falls back to when there is no player to measure.
 *
 * A Markdown note, a PDF, an image: nothing on the page has a bottom
 * edge the sheet is trying to stay under, so `half` keeps the fixed
 * fraction it had before the derivation existed.
 */
export const SHEET_SNAP_HALF_FALLBACK = 0.5;

export interface HalfSnapInput {
  /** `window.innerHeight`, which is the viewport vaul derives from. */
  viewportHeight: number;
  /** The player wrapper's `getBoundingClientRect().bottom`. */
  playerBottom: number;
}

/**
 * The snap that lands the sheet's top edge on the player's bottom edge.
 *
 * **The mechanism, not a number.** vaul translates the drawer down by
 * `vh × (1 − snap)`, and the drawer is anchored to the bottom edge, so
 * what is left on screen is the drawer's own height less that translate
 * — the subtraction `SHEET_VISIBLE_HEIGHT` performs in CSS. Asking for
 * the sheet's top edge to sit at the player's bottom is asking for that
 * remainder to be exactly the room under the player, which solves for
 * the snap in one step:
 *
 *     drawerHeight − vh × (1 − snap) = vh − playerBottom
 *
 * Read the drawer's height out of `SHEET_DRAWER_VH` rather than writing
 * the difference as a constant: an offset term is the same expression
 * with the drawer's height already substituted into it, and it goes
 * silently wrong the moment that height moves.
 *
 * The room is bounded at both ends by states the sheet already has.
 * Below `SHEET_PEEK_PX` a raised sheet would be shorter than the resting
 * strip it replaced; at `full`'s own room the two expanded states stop
 * being distinguishable and a drag between them would move nothing, so
 * `half` stops one row short of it. A player taller than the screen and
 * a player barely taller than its own controls both exist, and both land
 * outside those bounds.
 *
 * @returns the snap, or `null` when there is nothing to derive from —
 * a viewport with no height, a rect that never laid out, or a screen too
 * short for the two bounds to leave anything between them. The caller
 * falls back to `SHEET_SNAP_HALF_FALLBACK`.
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

  const drawerPx = SHEET_DRAWER_VH * viewportHeight;
  const snapForRoom = (room: number) => 1 - (drawerPx - room) / viewportHeight;

  const fullRoom = drawerPx - viewportHeight * (1 - SHEET_SNAP_FULL);
  const smallestRoom = SHEET_PEEK_PX;
  const largestRoom = fullRoom - SHEET_PEEK_PX;
  if (largestRoom < smallestRoom) return null;

  const room = Math.min(
    Math.max(viewportHeight - playerBottom, smallestRoom),
    largestRoom,
  );
  return snapForRoom(room);
}
