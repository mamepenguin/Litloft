"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const CELL_SELECTOR = ".justified-grid-cell";

/**
 * Read by globals.css and by `useJustifiedFlip`. Written here rather than
 * rendered by the cell, so a re-render of the cell (selection, cut, drag)
 * cannot drop it between two decisions.
 */
export const HELD_ATTR = "data-held";

const FOCUS_TARGET = "[data-file-thumb]";

/**
 * The last line is laid out unstretched, because `.justified-grid-tail`
 * absorbs its slack. An append moves the tail off it and the line grows to
 * fill the row, so while more pages may follow it is kept out of sight:
 * `visibility: hidden` keeps its box, so nothing above it moves.
 */
export function useJustifiedHold(
  gridRef: RefObject<HTMLElement | null>,
  moreMayFollow: boolean,
): void {
  const lastSignature = useRef<string | null>(null);
  const observed = useRef<HTMLElement | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const moreRef = useRef(moreMayFollow);
  moreRef.current = moreMayFollow;

  useLayoutEffect(() => {
    const grid = gridRef.current;

    if (observed.current !== grid) {
      resizeObserver.current?.disconnect();
      resizeObserver.current = null;
      observed.current = grid;
      lastSignature.current = null;
      if (grid && typeof ResizeObserver !== "undefined") {
        let width = Math.round(grid.getBoundingClientRect().width);
        const ro = new ResizeObserver(() => {
          const next = Math.round(grid.getBoundingClientRect().width);
          if (next === width) return;
          width = next;
          applyHold(grid, moreRef.current);
        });
        ro.observe(grid);
        resizeObserver.current = ro;
      }
    }
    if (!grid) return;

    // Line membership depends on order and on each cell's ratio, not only on
    // which cells there are; a revalidation can bring back the same ids with
    // new dimensions.
    const signature = `${moreMayFollow ? 1 : 0}|${cellSignature(grid)}`;
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    applyHold(grid, moreMayFollow);
  });

  useEffect(
    () => () => {
      resizeObserver.current?.disconnect();
      resizeObserver.current = null;
    },
    [],
  );
}

function cellSignature(grid: HTMLElement): string {
  const cells = grid.querySelectorAll<HTMLElement>(CELL_SELECTOR);
  let out = "";
  for (const cell of cells) {
    out += `${cell.getAttribute("data-flip-key") ?? ""}:${cell.style.getPropertyValue("--jg-ratio")},`;
  }
  return out;
}

function applyHold(grid: HTMLElement, moreMayFollow: boolean): void {
  const cells = Array.from(grid.querySelectorAll<HTMLElement>(CELL_SELECTOR));
  const held = new Set<HTMLElement>();

  if (moreMayFollow && cells.length > 0) {
    // `offsetTop`, not `getBoundingClientRect`: a FLIP still in flight
    // moves the painted box, not the layout box the line is made of.
    const lastTop = cells[cells.length - 1].offsetTop;
    if (cells[0].offsetTop !== lastTop) {
      for (let i = cells.length - 1; i >= 0 && cells[i].offsetTop === lastTop; i -= 1) {
        held.add(cells[i]);
      }
    }
  }

  const active = document.activeElement;
  let focusLost: number | null = null;

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (held.has(cell)) {
      if (!cell.hasAttribute(HELD_ATTR)) cell.setAttribute(HELD_ATTR, "");
      if (active && cell.contains(active)) focusLost = i;
    } else if (cell.hasAttribute(HELD_ATTR)) {
      cell.removeAttribute(HELD_ATTR);
    }
  }

  // `visibility: hidden` stops an element taking focus but leaves focus on
  // one that already has it, where Enter would still open the file.
  if (focusLost !== null) {
    for (let i = focusLost - 1; i >= 0; i -= 1) {
      if (held.has(cells[i])) continue;
      const target = cells[i].querySelector<HTMLElement>(FOCUS_TARGET);
      if (target) {
        target.focus({ preventScroll: true });
        return;
      }
    }
  }
}
