"use client";

import { useEffect, type RefObject } from "react";

import type { SurfaceGeometry } from "@/lib/nativeBridge";
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

interface Saved {
  value: string;
  priority: string;
}

type Marks = Map<HTMLElement, Saved>;

function mark(node: HTMLElement, property: string, value: string, marks: Marks): void {
  if (marks.has(node)) return;
  marks.set(node, {
    value: node.style.getPropertyValue(property),
    priority: node.style.getPropertyPriority(property),
  });
  node.style.setProperty(property, value, "important");
}

function unmark(node: HTMLElement, property: string, marks: Marks): void {
  const saved = marks.get(node);
  marks.delete(node);
  if (!saved?.value) node.style.removeProperty(property);
  else node.style.setProperty(property, saved.value, saved.priority);
}

/**
 * The shell draws the video beneath everything the page paints, so the page has
 * to leave the frame's rectangle bare. In flow, the frame's ancestors are the
 * only things painting there, so clearing their backgrounds is enough. Out of
 * flow — the frame covering the viewport in fullscreen — anything else on the
 * page would paint over the video, so everything off the frame's path is
 * hidden as well. Each element keeps whatever it had inline, to put back.
 */
function openHole(frame: Element, outOfFlow: boolean, cleared: Marks, hidden: Marks): void {
  const path = new Set<HTMLElement>();
  for (let node = frame.parentElement; node; node = node.parentElement) {
    path.add(node);
    mark(node, "background-color", "transparent", cleared);
  }
  for (const node of [...cleared.keys()]) {
    if (!path.has(node)) unmark(node, "background-color", cleared);
  }

  for (const ancestor of path) {
    for (const child of ancestor.children) {
      if (!(child instanceof HTMLElement) || child === frame || path.has(child)) continue;
      if (outOfFlow) mark(child, "visibility", "hidden", hidden);
    }
  }
  for (const node of [...hidden.keys()]) {
    if (!outOfFlow || !node.parentElement || !path.has(node.parentElement)) {
      unmark(node, "visibility", hidden);
    }
  }
}

function closeHole(cleared: Marks, hidden: Marks): void {
  for (const node of [...cleared.keys()]) unmark(node, "background-color", cleared);
  for (const node of [...hidden.keys()]) unmark(node, "visibility", hidden);
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
    const cleared: Marks = new Map();
    const hidden: Marks = new Map();
    let sent: SurfaceGeometry | null = null;
    let sentAny = false;
    let frameCount = 0;
    let structure: SurfaceStructure | null = null;
    let lastKey: string | null = null;
    let handle = 0;

    const tick = () => {
      handle = requestAnimationFrame(tick);
      frameCount += 1;

      const frame = frameRef.current;
      let geometry: SurfaceGeometry | null = null;
      if (frame && frame.isConnected) {
        const moved =
          !structure ||
          frameCount % STRUCTURE_EVERY_FRAMES === 0 ||
          layoutKey(frame, structure) !== lastKey;
        if (moved) {
          structure = measureSurface(frame);
          lastKey = layoutKey(frame, structure);
        }
        openHole(frame, structure!.measurement.fixed, cleared, hidden);
        const { width, height } = structure!.measurement.frame;
        if (width > 0 && height > 0) geometry = computeSurfaceGeometry(structure!.measurement);
      } else {
        closeHole(cleared, hidden);
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
      closeHole(cleared, hidden);
    };
  }, [channel, frameRef]);
}
