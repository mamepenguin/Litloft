"use client";

/**
 * Describes where the page draws a video, for the iOS shell that shows it
 * behind the page. The description does not change while the page scrolls:
 * the shell follows scrolling itself, from its own scroll offsets, because
 * reporting every scroll arrives a frame or two late.
 */

import type { SurfaceGeometry } from "./nativeBridge";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A sticky ancestor that actually sticks against the element that scrolls. */
export interface StickyMeasurement {
  /** The sticky element's `top`. */
  cssTop: number;
  /** How far below the sticky element's top the frame sits. */
  frameOffset: number;
  /** How far the sticky element reaches below the frame's bottom. */
  belowFrame: number;
  /** The viewport bottom of the block that holds the sticky element. */
  blockBottom: number;
  /** The frame's viewport top with the sticky element not stuck. */
  naturalTop: number;
}

export interface SurfaceMeasurement {
  frame: Box;
  scrollY: number;
  fixed: boolean;
  /** `box` is where the scrolling element is now; `documentTop` is where it is
   * in the document, which is what identifies it to the shell. */
  scroller: { box: Box; documentTop: number; scrollTop: number } | null;
  sticky: StickyMeasurement | null;
}

export function computeSurfaceGeometry(m: SurfaceMeasurement): SurfaceGeometry {
  const base = { x: m.frame.x, width: m.frame.width, height: m.frame.height };
  if (m.fixed) {
    return { ...base, anchor: "fixed", top: m.frame.y, scroller: null, stickTop: null, stickLimit: null };
  }

  const viewportTop = m.sticky ? m.sticky.naturalTop : m.frame.y;
  // Converts a viewport y into the coordinates the anchor scrolls in.
  const origin = m.scroller ? m.scroller.scrollTop - m.scroller.box.y : m.scrollY;
  // Counted from the top of whatever scrolls, as `top` is.
  const stickTop = m.sticky ? m.sticky.cssTop + m.sticky.frameOffset : null;
  const stickLimit = m.sticky ? m.sticky.blockBottom + origin - m.sticky.belowFrame : null;

  return {
    ...base,
    anchor: m.scroller ? "scroller" : "document",
    top: viewportTop + origin,
    scroller: m.scroller ? { ...m.scroller.box, y: m.scroller.documentTop } : null,
    stickTop,
    stickLimit,
  };
}

/** Half-pixel noise from layout is not a change worth sending. */
export function sameGeometry(a: SurfaceGeometry | null, b: SurfaceGeometry | null): boolean {
  return JSON.stringify(a, roundNumbers) === JSON.stringify(b, roundNumbers);
}

function roundNumbers(_key: string, value: unknown): unknown {
  return typeof value === "number" ? Math.round(value * 2) / 2 : value;
}

function box(rect: DOMRect): Box {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * The same box in the document's coordinates. The shell identifies the
 * scrolling element by this box, and a viewport box would only match while the
 * document sits where it did when the page measured it.
 */
function documentBox(rect: DOMRect): Box {
  return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
}

function isRoot(element: Element | null): boolean {
  return element === null || element === document.body || element === document.documentElement;
}

/** The element whose own scrolling moves the frame, or null for the document. */
function scrollerOf(frame: Element): HTMLElement | null {
  for (let node = frame.parentElement; node && !isRoot(node); node = node.parentElement) {
    const style = getComputedStyle(node);
    const scrolls = /(auto|scroll)/.test(style.overflowY || style.overflow);
    if (scrolls && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

function isFixed(frame: Element): boolean {
  for (let node: Element | null = frame; node && !isRoot(node); node = node.parentElement) {
    if (getComputedStyle(node).position === "fixed") return true;
  }
  return false;
}

/**
 * Whether an element clips what overflows it, which is what sticky sticks
 * against. Written as its own function because jsdom answers `""` where a
 * browser answers `"visible"`, so a test against the DOM cannot tell the two
 * apart.
 */
export function clipsOverflow(style: { overflow: string; overflowX: string; overflowY: string }): boolean {
  const clips = (value: string) => value !== "" && value !== "visible";
  return clips(style.overflow) || clips(style.overflowY) || clips(style.overflowX);
}

/** Sticky sticks against its nearest clipping ancestor, which may not scroll. */
function clipperOf(element: Element): Element | null {
  for (let node = element.parentElement; node && !isRoot(node); node = node.parentElement) {
    if (clipsOverflow(getComputedStyle(node))) return node;
  }
  return null;
}

function stickyOf(frame: Element, scroller: HTMLElement | null): HTMLElement | null {
  for (let node: Element | null = frame; node && !isRoot(node); node = node.parentElement) {
    if (getComputedStyle(node).position !== "sticky") continue;
    const clipper = clipperOf(node);
    const sticksAgainstScroller = scroller ? clipper === scroller : isRoot(clipper);
    return sticksAgainstScroller && node instanceof HTMLElement ? node : null;
  }
  return null;
}

function measureSticky(frame: Element, sticky: HTMLElement): StickyMeasurement {
  const frameRect = frame.getBoundingClientRect();
  const stickyRect = sticky.getBoundingClientRect();
  const block = sticky.parentElement?.getBoundingClientRect() ?? stickyRect;
  const cssTop = parseFloat(getComputedStyle(sticky).top) || 0;

  // Unstuck for a moment: where the frame belongs in the flow.
  const saved = sticky.style.getPropertyValue("position");
  const priority = sticky.style.getPropertyPriority("position");
  sticky.style.setProperty("position", "static", "important");
  const naturalTop = frame.getBoundingClientRect().y;
  sticky.style.setProperty("position", saved, priority);
  if (!saved) sticky.style.removeProperty("position");

  return {
    cssTop,
    frameOffset: frameRect.y - stickyRect.y,
    belowFrame: stickyRect.bottom - frameRect.bottom,
    blockBottom: block.bottom,
    naturalTop,
  };
}

export interface SurfaceStructure {
  measurement: SurfaceMeasurement;
  scroller: HTMLElement | null;
  sticky: HTMLElement | null;
}

export function measureSurface(frame: Element): SurfaceStructure {
  const fixed = isFixed(frame);
  const scroller = fixed ? null : scrollerOf(frame);
  const sticky = fixed ? null : stickyOf(frame, scroller);
  return {
    scroller,
    sticky,
    measurement: {
      frame: box(frame.getBoundingClientRect()),
      scrollY: window.scrollY,
      fixed,
        scroller: scroller
        ? {
            box: box(scroller.getBoundingClientRect()),
            documentTop: documentBox(scroller.getBoundingClientRect()).y,
            scrollTop: scroller.scrollTop,
          }
        : null,
      sticky: sticky ? measureSticky(frame, sticky) : null,
    },
  };
}

/**
 * A cheap reading that stays put while the page only scrolls, for noticing
 * that the layout moved. A stuck frame moves with scrolling, so only its size
 * counts.
 */
export function layoutKey(frame: Element, structure: SurfaceStructure): string {
  const rect = frame.getBoundingClientRect();
  // Fullscreen takes the frame out of flow without moving or resizing it.
  const size = `${getComputedStyle(frame).position}:${rect.x}:${rect.width}x${rect.height}`;
  if (structure.sticky) return size;
  if (structure.measurement.fixed) return `${size}@${rect.y}`;
  const origin = structure.scroller
    ? structure.scroller.scrollTop - structure.scroller.getBoundingClientRect().y
    : window.scrollY;
  return `${size}@${Math.round((rect.y + origin) * 2) / 2}`;
}
