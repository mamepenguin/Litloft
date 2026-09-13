"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Physical, not logical. The tree has no RTL form, and the classes these
 * map to are physical too.
 */
export type AnchoredSide = "left" | "right";

/**
 * Spelled out rather than built: a class assembled at runtime is not in
 * the text Tailwind scans, so the rule is never emitted.
 *
 * `sm:`-scoped spellings are **not** here. Merging them in would put a
 * caller one character away from giving an always-anchored panel no
 * vertical placement at all below the breakpoint.
 */
export const ANCHORED_VERTICAL = {
  1: { px: 4, down: "top-full mt-1", up: "bottom-full mb-1" },
  2: { px: 8, down: "top-full mt-2", up: "bottom-full mb-2" },
} as const;

export const ANCHORED_ORIGIN = {
  "down-left": "origin-top-left",
  "down-right": "origin-top-right",
  "up-left": "origin-bottom-left",
  "up-right": "origin-bottom-right",
} as const;

export interface AnchoredDirectionOptions {
  /**
   * The **positioned wrapper** the panel is `absolute` inside — the
   * `relative` box, not the button in it. The walk starts at this element's
   * parent, so a frame *between* the wrapper and the button would be missed
   * if the button were passed.
   */
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  open: boolean;
  /**
   * The gap is part of the room the panel needs: without it a panel whose
   * height lands in the last few pixels of the space below is kept
   * downward and its final pixels sit past the edge.
   */
  gapPx: number;
  preferSide?: AnchoredSide;
}

export interface AnchoredDirection {
  openUp: boolean;
  side: AnchoredSide;
}

interface Frame {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Not the same as the first ancestor with an `overflow` value. An overflow
 * box clips a positioned descendant only while it is still in that
 * descendant's containing-block chain, and the chain leaves the DOM
 * parentage twice:
 *
 *   - at a `fixed` ancestor. It is laid out against the viewport, so
 *     nothing above it clips the subtree.
 *   - at an `absolute` ancestor, and then only as far as *its* own
 *     containing block: the nearest positioned ancestor. Static boxes in
 *     between are not in the chain and do not clip.
 *
 * Not implemented: an ancestor with `transform` / `filter` / `contain`,
 * which becomes the containing block of even a `fixed` descendant. vaul's
 * drawer is one; what saves a panel inside it is that the sheet's own
 * scroller is found first.
 */
function clippingFrame(wrapper: HTMLElement): Frame | null {
  // Set while the walk is between an `absolute` ancestor and that
  // ancestor's containing block, where only a positioned box counts.
  let inAbsoluteDetour = false;
  for (let el = wrapper.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY, position } = getComputedStyle(el);
    // Positive test rather than `!== "static"`: an unset `position` reads
    // as `""` outside a browser, and the whole point of the flag is that a
    // *static* box inside the detour cannot clip.
    const positioned =
      position === "relative" ||
      position === "absolute" ||
      position === "fixed" ||
      position === "sticky";
    if (
      (positioned || !inAbsoluteDetour) &&
      /auto|scroll|hidden/.test(overflowX + overflowY)
    ) {
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }
    if (position === "fixed") return null;
    // Only a positioned box moves the flag: it is the one that ends a
    // detour, or starts one. A static ancestor leaves it alone, which is
    // what keeps the detour running across the statics inside it.
    if (positioned) inAbsoluteDetour = position === "absolute";
  }
  return null;
}

/**
 * `window.innerHeight` is the layout viewport, which an on-screen keyboard
 * does not move; `visualViewport` is what is left visible. Its offsets are
 * expressed against the layout viewport's origin — the same origin a client
 * rect is — so the visible band is `[offsetTop, offsetTop + height]` and
 * not `[0, height]`.
 */
function viewportFrame(): Frame {
  const vv = typeof window === "undefined" ? undefined : window.visualViewport;
  if (!vv) {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  }
  return {
    left: vv.offsetLeft,
    top: vv.offsetTop,
    right: vv.offsetLeft + vv.width,
    bottom: vv.offsetTop + vv.height,
  };
}

/**
 * The decision is made from the **rendered box**, not from a breakpoint and
 * not from a row count: a menu's height is its content's to change. It is
 * re-derived while the panel is open, because the things it reads move.
 *
 * A panel that is not anchored has no direction to pick. The test for that
 * is the panel's own computed `position`; asking a media query which form
 * is on screen would be a guess at the same fact.
 *
 * Neither answer is cleared when the panel closes: `FileActions` raises an
 * error toast off the same trigger *after* its menu has gone, and a reset
 * would put the message in the corner the menu was not allowed to use.
 */
export function useAnchoredDirection({
  triggerRef,
  panelRef,
  open,
  gapPx,
  preferSide = "right",
}: AnchoredDirectionOptions): AnchoredDirection {
  const [openUp, setOpenUp] = useState(false);
  const [side, setSide] = useState<AnchoredSide>(preferSide);

  useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const wrapper = triggerRef.current;
      const panel = panelRef.current;
      if (!wrapper || !panel) return;

      if (getComputedStyle(panel).position === "fixed") return;

      const triggerRect = wrapper.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      // The room a panel has is what is *both* unclipped and on screen, so
      // the two frames are intersected rather than chosen between: an
      // on-screen keyboard shrinks what is visible without moving any
      // element's box.
      const clip = clippingFrame(wrapper);
      const visible = viewportFrame();
      const frame = clip
        ? {
            left: Math.max(clip.left, visible.left),
            top: Math.max(clip.top, visible.top),
            right: Math.min(clip.right, visible.right),
            bottom: Math.min(clip.bottom, visible.bottom),
          }
        : visible;

      // `triggerRect` is the wrapper's, which the panel — being absolute,
      // out of flow — does not move, and the panel's size is the same
      // whichever corner it is drawn in. So neither reading depends on the
      // answer it feeds.
      //
      // Each axis flips only when the other side is the better of the
      // two, so a trigger with room for neither keeps the direction the
      // panel reads as everywhere else.
      const spaceBelow = frame.bottom - triggerRect.bottom;
      const spaceAbove = triggerRect.top - frame.top;
      setOpenUp(
        panelRect.height + gapPx > spaceBelow && spaceAbove > spaceBelow,
      );

      // The panel's own rendered width rather than a constant stating it,
      // so there is no second number to disagree with the `w-*` /
      // `min-w-*` it is actually drawn at.
      const roomFromRight = triggerRect.right - frame.left;
      const roomFromLeft = frame.right - triggerRect.left;
      const [preferred, other] =
        preferSide === "right"
          ? [roomFromRight, roomFromLeft]
          : [roomFromLeft, roomFromRight];
      const flip = panelRect.width > preferred && other > preferred;
      setSide(
        flip ? (preferSide === "right" ? "left" : "right") : preferSide,
      );
    };

    measure();

    // The panel's own size changes when an `AddonSlot` resolves a dynamic
    // `import()` after the first paint. The visible band changes when an
    // on-screen keyboard comes or goes, and panning a zoomed page moves it
    // without resizing it, so `scroll` is a second subscription rather
    // than a duplicate. `window`'s own `resize` is the fallback for where
    // `visualViewport` does not exist rather than a third subscription.
    const panel = panelRef.current;
    const observer =
      panel && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (panel) observer?.observe(panel);

    const vv = window.visualViewport;
    const viewport: Pick<
      EventTarget,
      "addEventListener" | "removeEventListener"
    > = vv ?? window;
    viewport.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      viewport.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [open, gapPx, preferSide, triggerRef, panelRef]);

  return { openUp, side };
}
