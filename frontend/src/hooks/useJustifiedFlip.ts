"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Which changes are carried is decided by the guards below, not by naming
 * the feature that caused them: a change is carried when some key survives
 * it and the grid is the width it was measured at.
 *
 * The scale is uniform **while `max-height` does not bind**. Where the cap
 * binds, the height stops following the width and the first frame is a
 * squash. It is left alone rather than corrected: the correction replaces
 * a squashed first frame with a capped cell starting at the wrong height.
 */

const CELL_SELECTOR = ".justified-grid-cell";

const KEY_ATTR = "data-flip-key";

/** Reads the two states in globals.css. */
const FLIP_ATTR = "data-flip";

/**
 * The invariant is `FLIP_SETTLE_MS >= the CSS duration`, in that
 * direction only. `settle` removes `data-flip`, which removes
 * `transition-property` and so cancels a play still running: too short a
 * delay makes every cell jump to its end value part-way through, and
 * nothing about the page says so.
 */
export const FLIP_DURATION_MS = 200;

export const FLIP_SETTLE_MS = FLIP_DURATION_MS + 50;

/**
 * Below this a cell is where it was, and a transform that resolves to
 * nothing still costs a composited layer for the length of the play.
 */
const EPSILON_PX = 0.5;
const EPSILON_SCALE = 0.005;

/**
 * Load-bearing: a page arrives below the fold, so most of what arrives is
 * outside this band and is left alone. Removing it would put an inline
 * `opacity` on every cell in the listing.
 *
 * The band is measured against the window, not the scrolling `<section>`.
 * That is generous in the safe direction: it can only include a cell that
 * cannot be seen, never exclude one that can.
 */
const VIEWPORT_MARGIN_PX = 400;

/** Grid-relative, so a scroll between two commits cannot enter the delta. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Snapshot {
  keys: string[];
  /** Rounded: a fractional wobble in the container is not a resize. */
  width: number;
  rects: Map<string, Rect>;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Asked here rather than left to the global `prefers-reduced-motion`
 * rule in globals.css. That rule shortens the transition to 0.01ms,
 * which still paints the inverted frame first; this skips writing the
 * transform at all.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useJustifiedFlip(gridRef: RefObject<HTMLElement | null>): void {
  const previous = useRef<Snapshot | null>(null);
  const inFlight = useRef(new Set<HTMLElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    for (const cell of inFlight.current) {
      cell.removeAttribute(FLIP_ATTR);
      cell.style.transform = "";
      cell.style.opacity = "";
    }
    inFlight.current.clear();
  }, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const cells = Array.from(grid.querySelectorAll<HTMLElement>(CELL_SELECTOR));
    const keys = cells.map((cell) => cell.getAttribute(KEY_ATTR) ?? "");
    const before = previous.current;

    // The cell set is the whole subject. Selecting a file or opening the
    // context menu re-renders this tree without touching it, and reading
    // every cell's box on those would force a layout for nothing.
    if (before && sameOrder(before.keys, keys)) return;

    // A cell still playing measures where it appears, not where the
    // layout put it. Clearing first is what makes the reading below a
    // reading of the layout.
    settle();

    const gridRect = grid.getBoundingClientRect();
    const width = Math.round(gridRect.width);
    const rects = new Map<string, Rect>();
    const measured: { cell: HTMLElement; key: string; rect: Rect; onScreen: boolean }[] = [];

    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const box = cell.getBoundingClientRect();
      const rect = {
        x: box.left - gridRect.left,
        y: box.top - gridRect.top,
        w: box.width,
        h: box.height,
      };
      if (keys[i]) rects.set(keys[i], rect);
      measured.push({
        cell,
        key: keys[i],
        rect,
        onScreen:
          box.bottom > -VIEWPORT_MARGIN_PX &&
          box.top < window.innerHeight + VIEWPORT_MARGIN_PX,
      });
    }

    const store = () => {
      previous.current = { keys, width, rects };
    };

    if (!before) return store();
    // A width change is a resize, and a resize is a drag, not a discrete
    // state change: following it would animate every frame of it. The
    // same guard is what keeps a stale measurement — the grid reflowed
    // with no commit in between — from being played as if it were one.
    if (before.width !== width) return store();
    if (prefersReducedMotion()) return store();
    // No cell in common is a different listing rather than a change to
    // this one, so every cell would be "new" and the whole grid would
    // fade in on a folder change.
    if (!measured.some((m) => m.key !== "" && before.rects.has(m.key))) return store();

    const inverted: { cell: HTMLElement; transform: string }[] = [];
    const entering: HTMLElement[] = [];

    for (const m of measured) {
      if (!m.onScreen) continue;
      const first = m.key === "" ? undefined : before.rects.get(m.key);
      if (!first) {
        entering.push(m.cell);
        continue;
      }
      const dx = first.x - m.rect.x;
      const dy = first.y - m.rect.y;
      const sx = m.rect.w > 0 ? first.w / m.rect.w : 1;
      const sy = m.rect.h > 0 ? first.h / m.rect.h : 1;
      if (
        Math.abs(dx) < EPSILON_PX &&
        Math.abs(dy) < EPSILON_PX &&
        Math.abs(sx - 1) < EPSILON_SCALE &&
        Math.abs(sy - 1) < EPSILON_SCALE
      ) {
        continue;
      }
      inverted.push({
        cell: m.cell,
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      });
    }

    store();
    if (inverted.length === 0 && entering.length === 0) return;

    for (const { cell, transform } of inverted) {
      cell.setAttribute(FLIP_ATTR, "invert");
      cell.style.transform = transform;
      inFlight.current.add(cell);
    }
    for (const cell of entering) {
      cell.setAttribute(FLIP_ATTR, "invert");
      cell.style.opacity = "0";
      inFlight.current.add(cell);
    }

    // The start of a transition has to be a style the browser has
    // resolved, or setting the end value in the same pass is not a change
    // for it to interpolate. One read covers every cell.
    void grid.offsetWidth;

    for (const cell of inFlight.current) {
      cell.setAttribute(FLIP_ATTR, "play");
      cell.style.transform = "";
      cell.style.opacity = "";
    }
    timer.current = setTimeout(settle, FLIP_SETTLE_MS);
  });

  useEffect(() => settle, [settle]);
}
