"use client";

/**
 * The reading position across a layout change the reader did not scroll for.
 *
 * What is remembered is the element at the top of the visible content and how
 * far into it that top sat, as a share of the element's own height, together
 * with its ancestors up to whatever scrolls. A viewer that re-fits its content
 * (a page drawn at a new width, text rewrapped) then keeps the same point of
 * the same element at the top; content that does not resize comes out as the
 * same pixel offset. Nothing is remembered while the scroller is at its start,
 * where a change of layout cannot move the reader away from it.
 */

interface AnchorStep {
  element: Element;
  /** How far into the element the top of the visible content sat, of its height. */
  fraction: number;
}

interface ReadingAnchor {
  /** The scroller, or `null` when the document is what scrolls. */
  scroller: HTMLElement | null;
  steps: AnchorStep[];
}

/** A viewer may re-fit its content for several frames after the box changes. */
const MAX_FRAMES = 20;

/** The chrome that sits over the content's top edge, which is not the content. */
const CHROME = "header, [data-testid='chrome-buttons'], [data-testid='focus-reveal-strip']";

/** Offsets to probe below the top edge: the chrome can cover the first pixels. */
const PROBE_OFFSETS = [2, 12, 24, 40, 60];

let pending: ReadingAnchor | null = null;
let active: (() => void) | null = null;

function scrollPosition(scroller: HTMLElement | null): number {
  return scroller ? scroller.scrollTop : window.scrollY;
}

/** The top of the visible content: the scroller's box, or the header's height. */
function visibleTop(scroller: HTMLElement | null): number {
  if (scroller) return Math.max(scroller.getBoundingClientRect().top, 0);
  const header = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--app-header-h"),
  );
  return Number.isFinite(header) ? header : 0;
}

function probeAt(x: number, y: number): Element | null {
  if (y < 0 || y > window.innerHeight) return null;
  const element = document.elementFromPoint(x, y);
  return element && !element.closest(CHROME) ? element : null;
}

function probeBelow(x: number, top: number): Element | null {
  for (const offset of PROBE_OFFSETS) {
    const element = probeAt(x, top + offset);
    if (element) return element;
  }
  return null;
}

function nearestScrolled(element: Element): HTMLElement | null {
  for (let el = element.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if (
      /(auto|scroll)/.test(overflow) &&
      el.scrollHeight > el.clientHeight &&
      el.scrollTop > 0
    ) {
      return el;
    }
  }
  return null;
}

function findScroller(): HTMLElement | null {
  for (const y of [
    window.innerHeight / 2,
    window.innerHeight - 48,
    window.innerHeight / 4,
  ]) {
    const element = probeAt(window.innerWidth / 2, y);
    if (!element) continue;
    const scroller = nearestScrolled(element);
    if (scroller) return scroller;
  }
  return null;
}

function capture(): ReadingAnchor | null {
  if (typeof document === "undefined") return null;
  const scroller = window.scrollY > 0 ? null : findScroller();
  if (!scroller && window.scrollY <= 0) return null;
  const top = visibleTop(scroller);
  const frame = scroller?.getBoundingClientRect();
  const x = frame ? frame.left + frame.width / 2 : window.innerWidth / 2;
  const probed = probeBelow(x, top) ?? scroller?.firstElementChild ?? null;
  if (!probed) return null;
  const first = probed === scroller ? scroller.firstElementChild : probed;
  if (!first) return null;

  const steps: AnchorStep[] = [];
  for (
    let node: Element | null = first;
    node && node !== scroller && node !== document.body;
    node = node.parentElement
  ) {
    const rect = node.getBoundingClientRect();
    if (rect.height > 0) {
      steps.push({ element: node, fraction: (top - rect.top) / rect.height });
    }
  }
  return steps.length > 0 ? { scroller, steps } : null;
}

export function rememberReadingAnchor(): void {
  active?.();
  pending = capture();
}

export function forgetReadingAnchor(): void {
  pending = null;
}

/**
 * Puts the place back now, and again on the frames that follow, until the
 * content stops moving or the reader scrolls. The deepest remembered element
 * that still exists is the one the position is taken from. A scroll the
 * reader makes ends the attempts: the place is then theirs, not the layout's.
 */
export function restoreReadingAnchor(): void {
  active?.();
  const anchor = pending;
  pending = null;
  if (!anchor) return;
  const held = anchor;

  let frame = 0;
  let frameId = 0;
  let expected = scrollPosition(held.scroller);

  const stop = () => {
    cancelAnimationFrame(frameId);
    document.removeEventListener("scroll", onScroll, true);
    if (active === stop) active = null;
  };

  function onScroll() {
    if (Math.abs(scrollPosition(held.scroller) - expected) <= 2) return;
    stop();
  }

  const step = () => {
    if (frame >= MAX_FRAMES) {
      stop();
      return;
    }
    frame += 1;
    const kept = held.steps.find((entry) => {
      if (!entry.element.isConnected) return false;
      return entry.element.getBoundingClientRect().height > 0;
    });
    if (!kept) {
      stop();
      return;
    }
    const rect = kept.element.getBoundingClientRect();
    const delta = rect.top + kept.fraction * rect.height - visibleTop(held.scroller);
    if (Math.abs(delta) >= 1) {
      if (held.scroller) held.scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
      expected = scrollPosition(held.scroller);
    }
    frameId = requestAnimationFrame(step);
  };

  document.addEventListener("scroll", onScroll, true);
  active = stop;
  step();
}
