"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type AnchoredSide = "left" | "right";

/**
 * Spelled out rather than built: a class assembled at runtime is not in
 * the text Tailwind scans, so the rule is never emitted.
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
 * Follows the containing-block chain, not the DOM parentage: nothing above
 * a `fixed` ancestor clips, and static boxes between an `absolute` ancestor
 * and its containing block do not clip either. `transform` / `filter` /
 * `contain` ancestors are not handled.
 */
function clippingFrame(wrapper: HTMLElement): Frame | null {
  let inAbsoluteDetour = false;
  for (let el = wrapper.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY, position } = getComputedStyle(el);
    // Not `!== "static"`: an unset `position` reads as `""` outside a browser.
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
    if (positioned) inAbsoluteDetour = position === "absolute";
  }
  return null;
}

/**
 * `visualViewport`, not `innerHeight`, so an on-screen keyboard counts. Its
 * band is `[offsetTop, offsetTop + height]`, not `[0, height]`.
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
 * Decided from the rendered box and re-derived while open. Not reset on
 * close: an error toast raised off the same trigger after the menu has
 * gone reuses the direction.
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

      // Each axis flips only when the other side is better, so a trigger
      // with room for neither keeps the default direction.
      const spaceBelow = frame.bottom - triggerRect.bottom;
      const spaceAbove = triggerRect.top - frame.top;
      setOpenUp(
        panelRect.height + gapPx > spaceBelow && spaceAbove > spaceBelow,
      );

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

    // The panel resizes when an addon row loads late; `visualViewport`
    // `scroll` catches panning a zoomed page, which does not resize it.
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
