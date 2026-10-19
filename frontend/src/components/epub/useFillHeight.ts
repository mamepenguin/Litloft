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
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const canvas = el?.closest("main");
    if (!el || !canvas) return;
    const measure = () => {
      const canvasTop = canvas.getBoundingClientRect().top - canvas.scrollTop;
      const padding = parseFloat(getComputedStyle(canvas).paddingBottom) || 0;
      const top = el.getBoundingClientRect().top - canvasTop;
      const last = canvas.lastElementChild;
      const contentEnd = last ? last.getBoundingClientRect().bottom - canvasTop : top;
      // Everything in the canvas except this element, as laid out now.
      const others = contentEnd + padding - el.offsetHeight;
      const fit = canvas.clientHeight - others;
      const room = canvas.clientHeight - padding - top;
      // Never taller than the room, even when that is under the minimum
      // (a phone on its side).
      const next = Math.min(
        Math.floor(room),
        Math.max(MIN_HEIGHT_PX, Math.floor(room * MIN_SHARE_OF_ROOM), Math.floor(fit)),
      );
      setHeight((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    for (const child of Array.from(canvas.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}
