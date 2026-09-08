"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Carries a justified grid across a change to its cell set, instead of
 * cutting to the new layout in one frame.
 *
 * **Which changes reach it is decided by the guards below, not by naming
 * the feature that caused them.** A change is carried when the cells
 * still have somewhere to come from: some key survives the change, and
 * the grid is the width it was measured at. A change that empties the
 * listing first has no survivors, and one that moved the container has
 * no measurement that still describes it — both are refused, whatever
 * produced them. Do not record here which product controls land on which
 * side: that answer depends on the width, the folder and how far a
 * filter narrows, and it has been wrong twice.
 *
 * What a change actually moves, measured on the 995-photograph folder at
 * a 1189px grid: nothing above the last line. `flex-wrap` fills lines
 * greedily from the left, so an item appended at the end cannot pull an
 * earlier item onto a different line, and every existing cell measured
 * `dy = 0` across every append. The cells that do change are the ones on
 * the line that *was* last: `.justified-grid-tail` leaves that line and
 * the line stretches to fill the row, so those cells grow and each one
 * after the first slides right. Three moved and four resized in one
 * measured round; one resized and none moved in the next.
 *
 * The scale is uniform **while `max-height` does not bind**. A line's
 * cells share their free space in proportion to `flex-grow`, which is
 * `--jg-ratio`, so every width on the line ends up multiplied by the same
 * factor — and `aspect-ratio` carries the height along by that same
 * factor. Inverting that is a zoom rather than a squash, and the picture
 * is not distorted while it plays; measured `|sx - sy| <= 9.7e-5` over 68
 * inversions.
 *
 * Where the cap binds, the height stops following the width and the two
 * factors come apart by construction — 0.31 against 0.40 in a
 * constructed 332px case. That frame is a squash.
 *
 * It is left alone rather than corrected, and the cost of correcting it
 * is *not* the reason: putting the width factor on both axes would move
 * an uncapped cell off its old height by `h * |sx - sy|`, which the
 * figure above bounds at a twentieth of a pixel. The reason is that the
 * correction is not obviously better than the defect — it replaces a
 * squashed first frame with a capped cell starting at the wrong height —
 * and that nothing has been observed reaching the cap to judge between
 * them. Note what that absence is worth: at the 200px row height the cap
 * needs a lone line of ratios summing under 2.38 followed by a cell of
 * ratio over 3.56, and `JG_MAX_RATIO` is 3, so a wide grid cannot reach
 * it at all. Only the 120px row height is a test of this, and roughly a
 * sixth of this folder is portrait, so it is a pairing that has not come
 * up rather than one the geometry excludes.
 *
 * No clipping is needed while it plays: the inverted cell sits at its own
 * previous rect, which was inside a grid of the same width, and the
 * interpolation between that and the new rect stays between the two.
 */

const CELL_SELECTOR = ".justified-grid-cell";

/** Set by the cell so a cell can be recognised across a re-render. */
const KEY_ATTR = "data-flip-key";

/** Reads the two states in globals.css. */
const FLIP_ATTR = "data-flip";

/**
 * The play, and the delay after which the marks come off.
 *
 * The invariant is `FLIP_SETTLE_MS >= the CSS duration`, in that
 * direction only. `settle` removes `data-flip`, which removes
 * `transition-property` and so cancels a play still running: too short a
 * delay makes every cell jump to its end value part-way through, and
 * nothing about the page says so. Too long costs a stale attribute.
 *
 * Three copies of one number, so the tests read all three ends —
 * `justifiedGrid.test.tsx` compares the stylesheet against
 * `FLIP_DURATION_MS`, and `useJustifiedFlip.test.tsx` runs the clock
 * forward against the timer this actually schedules.
 */
export const FLIP_DURATION_MS = 200;

/** How long the marks stay on. See `FLIP_DURATION_MS`. */
export const FLIP_SETTLE_MS = FLIP_DURATION_MS + 50;

/**
 * Below this a cell is where it was, and a transform that resolves to
 * nothing still costs a composited layer for the length of the play.
 */
const EPSILON_PX = 0.5;
const EPSILON_SCALE = 0.005;

/**
 * How far outside the window a cell is still worth animating.
 *
 * Load-bearing on every change, not a guard against a hypothetical: a
 * page arrives below the fold, so most of what arrives is outside this
 * band and is left alone. Removing it would put an inline `opacity` on
 * every cell in the listing instead — which is the whole folder, not the
 * page.
 *
 * The band is measured against the window, while the listing scrolls
 * inside a `<section>` that is shorter and offset under the header. That
 * is generous in the safe direction: it can only include a cell that
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

    // Nothing to play from.
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
      // A cell that did not exist has no rect to come from, so it is
      // faded in rather than moved.
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
    // for it to interpolate. Same idiom as `useOptimisticFileToggle`, and
    // one read covers every cell.
    //
    // Load-bearing and unreachable from jsdom, which resolves no styles:
    // delete this line and every play stops animating with the whole
    // suite still green. It is one of the survivors listed in
    // `useJustifiedFlip.test.tsx`.
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
