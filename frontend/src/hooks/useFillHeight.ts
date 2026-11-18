"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

const MIN_HEIGHT_PX = 320;
/** Below this share of the room, the content under the book scrolls instead. */
const MIN_SHARE_OF_ROOM = 0.6;

/**
 * A height that lets the element and everything else in the scrolling canvas
 * fit without scrolling; when what follows it is long, the element keeps 60%
 * of the room from its top to the canvas's end and the rest scrolls. Measured
 * because the rows around it and the resting sheet on a phone have no CSS
 * length the element could subtract.
 *
 * The canvas's child list is observed as well as its size: the find bar is
 * inserted after a viewer has mounted, which moves the element's top under it.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const canvas = el?.closest("main");
    if (!el || !canvas) return;

    /**
     * The padding between the element and the canvas, below it. A bleeding
     * viewer's host has none; an archive's keeps the canvas's 16px, and a
     * fill that ignored it would push the canvas 16px into scrolling.
     */
    let trailing = 0;
    for (
      let parent = el.parentElement;
      parent && parent !== canvas;
      parent = parent.parentElement
    ) {
      trailing += Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0;
    }

    const measure = () => {
      const canvasTop = canvas.getBoundingClientRect().top - canvas.scrollTop;
      const padding = parseFloat(getComputedStyle(canvas).paddingBottom) || 0;
      const contentBottom = canvas.clientHeight - padding - trailing;
      const top = el.getBoundingClientRect().top - canvasTop;
      const last = canvas.lastElementChild;
      const contentEnd = last ? last.getBoundingClientRect().bottom - canvasTop : top;
      // Everything in the canvas except this element, as laid out now. The
      // ancestors' trailing padding is in `contentEnd` but not in
      // `contentBottom`, so it comes off here or it is counted twice.
      const others = contentEnd - el.offsetHeight - trailing;
      const fit = contentBottom - others;
      const room = contentBottom - top;
      // Never taller than the room, even when that is under the minimum
      // (a phone on its side).
      const next = Math.min(
        Math.floor(room),
        Math.max(MIN_HEIGHT_PX, Math.floor(room * MIN_SHARE_OF_ROOM), Math.floor(fit)),
      );
      setHeight((current) => (current === next ? current : next));
    };

    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(canvas);
    const observed = new Set<Element>();
    const observeChildren = () => {
      for (const child of Array.from(canvas.children)) {
        if (observed.has(child)) continue;
        observed.add(child);
        observer?.observe(child);
      }
    };
    observeChildren();
    const mutations =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeChildren();
            measure();
          });
    mutations?.observe(canvas, { childList: true });
    return () => {
      mutations?.disconnect();
      observer?.disconnect();
    };
  }, [ref]);

  return height;
}
