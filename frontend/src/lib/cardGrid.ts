"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Columns come from the container's width, not viewport breakpoints (the
 * grid sits beside a tree pane). Not a container query: `container-type`
 * around a `<video>` breaks rendering on iOS Safari.
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

export const MIN_CARD_COLUMNS = 2;

/**
 * Template for a grid that has not been measured yet (server render).
 * `calc(50% - …)` rather than `100%` keeps the two-column floor before
 * hydration.
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

export function rowsFor(columns: number): number {
  return columns <= MIN_CARD_COLUMNS ? 2 : 1;
}

export function cardGridTemplate(columns: number): string {
  return columns > 0
    ? `repeat(${columns}, minmax(0, 1fr))`
    : cardGridColumns;
}

/** Measured in the callback ref, during commit, so the first paint is right. */
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
    // A zero width means "not laid out yet", not "no room".
    if (host.clientWidth === 0) return;
    // `clientWidth` includes padding; the tracks are laid inside it.
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
      measure();
    },
    [measure],
  );

  return { ref: attach, columns };
}
