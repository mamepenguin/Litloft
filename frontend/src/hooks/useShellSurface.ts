"use client";

import { useEffect, type RefObject } from "react";

import { reportPageBackground, type SurfaceGeometry } from "@/lib/nativeBridge";
import type { MediaChannel } from "@/lib/nativeMedia";
import {
  computeSurfaceGeometry,
  layoutKey,
  measureSurface,
  sameGeometry,
  type SurfaceStructure,
} from "@/lib/shellSurface";

/** How often the page's structure is looked at again when nothing resized. */
const STRUCTURE_EVERY_FRAMES = 30;

interface Cleared {
  value: string;
  priority: string;
}

/**
 * The shell shows the video behind the page, so the frame's ancestors must not
 * paint over it. Each keeps whatever inline background it had, to put back.
 */
function clearAncestors(frame: Element, cleared: Map<HTMLElement, Cleared>): void {
  const now = new Set<HTMLElement>();
  for (let node = frame.parentElement; node; node = node.parentElement) {
    now.add(node);
    if (cleared.has(node)) continue;
    cleared.set(node, {
      value: node.style.getPropertyValue("background-color"),
      priority: node.style.getPropertyPriority("background-color"),
    });
    node.style.setProperty("background-color", "transparent", "important");
  }
  for (const node of [...cleared.keys()]) {
    if (!now.has(node)) restore(node, cleared);
  }
}

function restore(node: HTMLElement, cleared: Map<HTMLElement, Cleared>): void {
  const saved = cleared.get(node);
  cleared.delete(node);
  if (!saved?.value) node.style.removeProperty("background-color");
  else node.style.setProperty("background-color", saved.value, saved.priority);
}

function pageBackground(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim();
}

/**
 * Tells the shell where the page draws the video, whenever that changes, and
 * keeps the page see-through there. Scrolling alone changes nothing sent.
 */
export function useShellSurface(
  frameRef: RefObject<HTMLElement | null>,
  channel: MediaChannel | null,
): void {
  useEffect(() => {
    if (!channel) return;
    const cleared = new Map<HTMLElement, Cleared>();
    let sent: SurfaceGeometry | null = null;
    let sentAny = false;
    let background = "";
    let frameCount = 0;
    let structure: SurfaceStructure | null = null;
    let lastKey: string | null = null;
    let handle = 0;

    const tick = () => {
      handle = requestAnimationFrame(tick);
      frameCount += 1;

      const colour = pageBackground();
      if (colour && colour !== background) {
        background = colour;
        reportPageBackground(colour);
      }

      const frame = frameRef.current;
      let geometry: SurfaceGeometry | null = null;
      if (frame && frame.isConnected) {
        clearAncestors(frame, cleared);
        const moved =
          !structure ||
          frameCount % STRUCTURE_EVERY_FRAMES === 0 ||
          layoutKey(frame, structure) !== lastKey;
        if (moved) {
          structure = measureSurface(frame);
          lastKey = layoutKey(frame, structure);
        }
        const { width, height } = structure!.measurement.frame;
        if (width > 0 && height > 0) geometry = computeSurfaceGeometry(structure!.measurement);
      } else {
        for (const node of [...cleared.keys()]) restore(node, cleared);
        structure = null;
      }

      if (!sentAny || !sameGeometry(geometry, sent)) {
        sentAny = true;
        sent = geometry;
        channel.setSurface(geometry);
      }
    };
    handle = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(handle);
      for (const node of [...cleared.keys()]) restore(node, cleared);
    };
  }, [channel, frameRef]);
}
