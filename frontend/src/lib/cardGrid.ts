"use client";

import { useCallback, useRef, useState } from "react";

/**
 * The column count is derived from the container's own width, never from
 * viewport breakpoints: these grids render beside a 280px tree pane, so
 * the viewport is not the width they actually have.
 *
 * A container query would be the other option, but the file cards can
 * mount a `<video>` for hover preview and `container-type` around a
 * media element breaks rendering on iOS Safari.
 *
 * The count is measured anyway because it is also a *number*: the drive
 * home's rows render exactly as many cards as fit, and that needs the
 * integer, not a track listing.
 */
export const CARD_MIN_WIDTH = "16rem";

/** `CARD_MIN_WIDTH` resolved against the 16px root font size. */
export const CARD_MIN_PX = 256;

/**
 * Shared rather than per-grid: `columnsFor` divides by
 * `CARD_MIN_PX + CARD_GAP_PX`, so a grid with a wider gap would be told
 * it fits a column it does not.
 */
export const CARD_GAP_PX = 12;

/**
 * Never fewer than two columns. A phone showing one card per row turns a
 * folder into a scroll of full-width tiles that says less per screen
 * than the list view does.
 */
export const MIN_CARD_COLUMNS = 2;

/**
 * Template for a grid that has not been measured yet — no
 * `ResizeObserver`, or a server render, where the ref never runs.
 *
 * `calc(50% - <half the gap>)` rather than `100%`: the percentage
 * resolves against the grid container's inline content size, so the
 * track floor is never more than half the container and `auto-fill`
 * cannot land on one column. With `100%` here, a server-rendered 375px
 * page would paint a single column before hydration — the shape the
 * floor exists to remove, back for one frame.
 */
export const cardGridColumns =
  `repeat(auto-fill, minmax(min(${CARD_MIN_WIDTH}, ` +
  `calc(50% - ${CARD_GAP_PX / 2}px)), 1fr))`;

export function columnsFor(width: number): number {
  const fits = Math.floor(
    (width + CARD_GAP_PX) / (CARD_MIN_PX + CARD_GAP_PX),
  );
  return Math.max(MIN_CARD_COLUMNS, fits);
}

/**
 * How many rows a one-screen shelf gets. At the floor the cards are half
 * the width they were designed for, so a second row buys back the count
 * the row lost; past it one row already shows four or more.
 */
export function rowsFor(columns: number): number {
  return columns <= MIN_CARD_COLUMNS ? 2 : 1;
}

export function cardGridTemplate(columns: number): string {
  return columns > 0
    ? `repeat(${columns}, minmax(0, 1fr))`
    : cardGridColumns;
}

/**
 * The measurement runs inside the callback ref, during commit, so React
 * flushes the resulting render before the browser paints and the floor
 * is in place on the first frame.
 */
export function useCardColumns(): {
  ref: (node: HTMLElement | null) => void;
  columns: number;
} {
  const hostRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [columns, setColumns] = useState(0);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    // A zero width is "not laid out yet", not "no room" — true of a
    // `display:none` subtree and of a grid with no children. Reporting
    // the floor there would claim a measurement that never happened.
    if (host.clientWidth === 0) return;
    // The content box, not the padding box. `clientWidth` includes
    // padding, and the tracks are laid inside it, so a grid with `p-2`
    // would be told it fits a column that has nowhere to go.
    const style = getComputedStyle(host);
    const inner =
      host.clientWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0);
    if (inner <= 0) return;
    setColumns(columnsFor(inner));
  }, []);

  const attach = useCallback(
    (node: HTMLElement | null) => {
      const previous = hostRef.current;
      if (previous && observerRef.current) {
        observerRef.current.unobserve(previous);
      }
      hostRef.current = node;
      if (!node) {
        observerRef.current?.disconnect();
        observerRef.current = null;
        return;
      }

      if (typeof ResizeObserver !== "undefined") {
        if (!observerRef.current) {
          observerRef.current = new ResizeObserver(measure);
        }
        observerRef.current.observe(node);
      }
      // The observer reports a first size on its own, but only where one
      // exists — a pane that never resizes again would otherwise never
      // be measured at all.
      measure();
    },
    [measure],
  );

  return { ref: attach, columns };
}
