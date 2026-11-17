"use client";

/**
 * The reading position across a layout change the reader did not scroll for:
 * the content at the top of what scrolls stays at the same offset from the
 * top of that scroller. Nothing is remembered while the scroller is at its
 * start, where a change of layout cannot move the reader away from it.
 */

interface ReadingAnchor {
  /** The scroller, or `null` when the document is what scrolls. */
  scroller: HTMLElement | null;
  /** The element at the top of the visible content. */
  element: Element;
  /**
   * The element's ancestor that is the scroller's own child. A viewer that
   * re-renders the row under the top (a page whose text layer is rebuilt at a
   * new width) replaces `element`, and the position is then kept at the level
   * of what still exists.
   */
  holder: Element | null;
  offset: number;
  holderOffset: number;
}

/** A viewer may re-fit its content for several frames after the box changes. */
const MAX_FRAMES = 20;

let pending: ReadingAnchor | null = null;
let active: (() => void) | null = null;

function scrollPosition(scroller: HTMLElement | null): number {
  return scroller ? scroller.scrollTop : window.scrollY;
}

function offsetIn(scroller: HTMLElement | null, element: Element): number {
  const top = scroller ? scroller.getBoundingClientRect().top : 0;
  return element.getBoundingClientRect().top - top;
}

/** The height of the box above the content, so the probe lands in it. */
function contentTop(): number {
  const header = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--app-header-h"),
  );
  return Number.isFinite(header) ? header : 0;
}

function nearestScroller(element: Element): HTMLElement | null {
  for (let el = element.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if (/(auto|scroll)/.test(overflow) && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return null;
}

function holderOf(scroller: HTMLElement | null, element: Element): Element | null {
  if (!scroller) return null;
  let holder: Element | null = element;
  while (holder && holder.parentElement !== scroller) {
    holder = holder.parentElement;
  }
  return holder;
}

function capture(): ReadingAnchor | null {
  if (typeof document === "undefined") return null;
  const middle = document.elementFromPoint(
    window.innerWidth / 2,
    window.innerHeight / 2,
  );
  if (!middle) return null;
  const scroller = nearestScroller(middle);
  if (scroller) {
    if (scroller.scrollTop <= 0) return null;
  } else if (window.scrollY <= 0) {
    return null;
  }
  const frame = scroller?.getBoundingClientRect();
  const x = frame ? frame.left + frame.width / 2 : window.innerWidth / 2;
  const top = frame ? Math.max(frame.top, 0) : contentTop();
  const first = document.elementFromPoint(x, top + 2);
  const element =
    first && (!scroller || scroller.contains(first)) ? first : middle;
  const holder = holderOf(scroller, element);
  return {
    scroller,
    element,
    holder,
    offset: offsetIn(scroller, element),
    holderOffset: holder ? offsetIn(scroller, holder) : 0,
  };
}

export function rememberReadingAnchor(): void {
  active?.();
  pending = capture();
}

/**
 * Puts the place back now, and again on the frames that follow, until the
 * content stops moving or the reader scrolls. A scroll the reader makes ends
 * the attempts: the place is then theirs, not the layout's.
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
    const target = held.element.isConnected
      ? { element: held.element, offset: held.offset }
      : held.holder?.isConnected
        ? { element: held.holder, offset: held.holderOffset }
        : null;
    if (!target) {
      stop();
      return;
    }
    const delta = offsetIn(held.scroller, target.element) - target.offset;
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
