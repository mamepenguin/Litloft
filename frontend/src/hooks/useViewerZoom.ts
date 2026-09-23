"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  FIT,
  clampView,
  isZoomed,
  settleView,
  zoomAbout,
  type Point,
  type Rect,
  type Size,
  type View,
} from "@/lib/viewerZoom";

const SWIPE_MIN_PX = 50;
const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 300;
const EDGE_RATIO = 0.25;
/** A wheel stops being a gesture this long after its last event. */
const WHEEL_SETTLE_MS = 150;
const WHEEL_ZOOM_RATE = 0.01;
export const KEY_ZOOM_STEP = 1.25;

interface Options {
  /** Changes whenever the picture changes: the view goes back to fit. */
  resetKey: unknown;
  readingDirection: "ltr" | "rtl";
  navigatePrev: () => void;
  navigateNext: () => void;
  toggleControls: () => void;
  /** Off where a mouse drag selects text instead. */
  mouseDragPans?: boolean;
}

interface Press {
  x: number;
  y: number;
  t: number;
  pointerType: string;
  zoomedAtStart: boolean;
  pinched: boolean;
}

interface Pinch {
  distance: number;
  mid: Point;
  view: View;
}

/**
 * Everything a gesture in progress remembers, in one object, so that a change
 * of picture discards all of it at once.
 */
interface Gesture {
  pointers: Map<number, Point>;
  press: Press | null;
  pinch: Pinch | null;
  /** A WebKit trackpad pinch. */
  trackpad: { view: View; origin: Point } | null;
}

function newGesture(): Gesture {
  return { pointers: new Map(), press: null, pinch: null, trackpad: null };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The frame owns every pointer on the picture. At fit it pages and toggles the
 * chrome as the viewers always have; zoomed, one finger pans and nothing
 * pages. A mouse drag never pages, so it is free for panning and, where the
 * picture has text, for selecting it.
 */
export function useViewerZoom({
  resetKey,
  readingDirection,
  navigatePrev,
  navigateNext,
  toggleControls,
  mouseDragPans = true,
}: Options) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  // State as well as a ref: a viewer can mount closed, and the listeners below
  // have to be attached when its frame appears, not when the hook first runs.
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const attachFrame = useCallback((el: HTMLDivElement | null) => {
    frameRef.current = el;
    setFrameEl(el);
  }, []);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>(FIT);
  const [settledScale, setSettledScale] = useState(1);
  const viewRef = useRef<View>(FIT);
  const gesture = useRef<Gesture>(newGesture());
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const settle = useCallback(
    (next: View) => {
      setView(next);
      setSettledScale(next.scale);
    },
    [setView],
  );

  const measure = useCallback((): { frame: Size; content: Rect } | null => {
    const frameEl = frameRef.current;
    if (!frameEl) return null;
    const box = frameEl.getBoundingClientRect();
    const frame = { width: box.width, height: box.height };
    const current = viewRef.current;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    contentRef.current
      ?.querySelectorAll("img, canvas")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        // Back to fit coordinates: the box is measured through the transform.
        left = Math.min(left, (r.left - box.left - current.x) / current.scale);
        top = Math.min(top, (r.top - box.top - current.y) / current.scale);
        right = Math.max(right, (r.right - box.left - current.x) / current.scale);
        bottom = Math.max(
          bottom,
          (r.bottom - box.top - current.y) / current.scale,
        );
      });
    // A split page is drawn at twice the frame's width; only the part inside
    // the frame is the picture being looked at.
    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(frame.width, right);
    bottom = Math.min(frame.height, bottom);
    const content =
      right > left && bottom > top
        ? { x: left, y: top, width: right - left, height: bottom - top }
        : { x: 0, y: 0, ...frame };
    return { frame, content };
  }, []);

  const localPoint = useCallback((clientX: number, clientY: number): Point => {
    const box = frameRef.current?.getBoundingClientRect();
    return box
      ? { x: clientX - box.left, y: clientY - box.top }
      : { x: clientX, y: clientY };
  }, []);

  const zoomBy = useCallback(
    (factor: number, origin?: Point) => {
      const m = measure();
      if (!m) return;
      const at = origin ?? { x: m.frame.width / 2, y: m.frame.height / 2 };
      settle(settleView(zoomAbout(viewRef.current, factor, at), m.frame, m.content));
    },
    [measure, settle],
  );

  const reset = useCallback(() => settle(FIT), [settle]);

  useEffect(() => {
    gesture.current = newGesture();
    settle(FIT);
  }, [resetKey, settle]);

  useEffect(() => {
    if (!frameEl) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const m = measure();
        if (!m) return;
        const next = zoomAbout(
          viewRef.current,
          Math.exp(-e.deltaY * WHEEL_ZOOM_RATE),
          localPoint(e.clientX, e.clientY),
        );
        setView(settleView(next, m.frame, m.content));
      } else if (isZoomed(viewRef.current)) {
        e.preventDefault();
        const m = measure();
        if (!m) return;
        const current = viewRef.current;
        setView(
          clampView(
            { ...current, x: current.x - e.deltaX, y: current.y - e.deltaY },
            m.frame,
            m.content,
          ),
        );
      } else {
        return;
      }
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(
        () => setSettledScale(viewRef.current.scale),
        WHEEL_SETTLE_MS,
      );
    };
    frameEl.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      frameEl.removeEventListener("wheel", onWheel);
      clearTimeout(wheelTimer.current);
    };
  }, [frameEl, measure, localPoint, setView]);

  // Desktop Safari reports a trackpad pinch as WebKit gesture events, not as
  // a ctrl wheel. iOS Safari sends them too, alongside the touches the
  // pointer handlers already pinch with, so they are ignored while a pointer
  // is down.
  useEffect(() => {
    if (!frameEl) return;
    const onStart = (e: Event) => {
      e.preventDefault();
      if (gesture.current.pointers.size > 0) return;
      const g = e as Event & { clientX: number; clientY: number };
      gesture.current.trackpad = {
        view: viewRef.current,
        origin: localPoint(g.clientX, g.clientY),
      };
    };
    const onChange = (e: Event) => {
      e.preventDefault();
      const start = gesture.current.trackpad;
      if (!start || gesture.current.pointers.size > 0) return;
      const m = measure();
      if (!m) return;
      const scale = (e as Event & { scale: number }).scale;
      const next = zoomAbout(start.view, scale, start.origin);
      setView(isZoomed(next) ? clampView(next, m.frame, m.content) : next);
    };
    const onEnd = (e: Event) => {
      e.preventDefault();
      if (!gesture.current.trackpad) return;
      gesture.current.trackpad = null;
      const m = measure();
      settle(m ? settleView(viewRef.current, m.frame, m.content) : FIT);
    };
    frameEl.addEventListener("gesturestart", onStart);
    frameEl.addEventListener("gesturechange", onChange);
    frameEl.addEventListener("gestureend", onEnd);
    return () => {
      frameEl.removeEventListener("gesturestart", onStart);
      frameEl.removeEventListener("gesturechange", onChange);
      frameEl.removeEventListener("gestureend", onEnd);
    };
  }, [frameEl, measure, localPoint, setView, settle]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const p = localPoint(e.clientX, e.clientY);
      gesture.current.pointers.set(e.pointerId, p);
      if (gesture.current.pointers.size === 1) {
        gesture.current.press = {
          x: e.clientX,
          y: e.clientY,
          t: Date.now(),
          pointerType: e.pointerType,
          zoomedAtStart: isZoomed(viewRef.current),
          pinched: false,
        };
      } else if (gesture.current.pointers.size === 2) {
        const [a, b] = [...gesture.current.pointers.values()];
        gesture.current.pinch = {
          distance: distance(a, b),
          mid: midpoint(a, b),
          view: viewRef.current,
        };
        if (gesture.current.press) gesture.current.press.pinched = true;
      }
    },
    [localPoint],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const previous = gesture.current.pointers.get(e.pointerId);
      if (!previous) return;
      const p = localPoint(e.clientX, e.clientY);
      gesture.current.pointers.set(e.pointerId, p);

      const start = gesture.current.pinch;
      if (start && gesture.current.pointers.size >= 2) {
        const [a, b] = [...gesture.current.pointers.values()];
        if (start.distance === 0) return;
        const mid = midpoint(a, b);
        const scaled = zoomAbout(start.view, distance(a, b) / start.distance, start.mid);
        setView({
          ...scaled,
          x: scaled.x + mid.x - start.mid.x,
          y: scaled.y + mid.y - start.mid.y,
        });
        return;
      }

      if (gesture.current.pointers.size !== 1 || !isZoomed(viewRef.current)) return;
      // A hovering mouse moves with no button down.
      if (e.pointerType === "mouse" && (e.buttons === 0 || !mouseDragPans)) {
        return;
      }
      const m = measure();
      if (!m) return;
      const current = viewRef.current;
      setView(
        clampView(
          {
            ...current,
            x: current.x + p.x - previous.x,
            y: current.y + p.y - previous.y,
          },
          m.frame,
          m.content,
        ),
      );
    },
    [localPoint, measure, setView, mouseDragPans],
  );

  const endPointer = useCallback(
    (pointerId: number) => {
      gesture.current.pointers.delete(pointerId);
      if (gesture.current.pointers.size === 1 && gesture.current.pinch) {
        // One finger left of a pinch: it pans from here, not from where the
        // pinch began.
        gesture.current.pinch = null;
      }
      if (gesture.current.pointers.size > 0) return false;
      const wasPinch = gesture.current.press?.pinched ?? false;
      if (wasPinch || gesture.current.pinch) {
        gesture.current.pinch = null;
        const m = measure();
        settle(m ? settleView(viewRef.current, m.frame, m.content) : FIT);
      } else if (isZoomed(viewRef.current)) {
        setSettledScale(viewRef.current.scale);
      }
      return !wasPinch;
    },
    [measure, settle],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = gesture.current.press;
      const single = endPointer(e.pointerId);
      if (gesture.current.pointers.size > 0) return;
      gesture.current.press = null;
      if (!s || !single) return;

      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const tap =
        Date.now() - s.t < TAP_MAX_MS &&
        adx < TAP_MAX_MOVE_PX &&
        ady < TAP_MAX_MOVE_PX;

      if (s.zoomedAtStart) {
        if (tap) toggleControls();
        return;
      }

      if (s.pointerType !== "mouse" && adx > SWIPE_MIN_PX && adx > ady) {
        if (dx > 0) {
          navigateNext();
        } else {
          navigatePrev();
        }
        return;
      }

      if (!tap) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const rx = e.clientX - rect.left;
      const w = rect.width;
      if (rx < w * EDGE_RATIO) {
        readingDirection === "ltr" ? navigatePrev() : navigateNext();
      } else if (rx > w * (1 - EDGE_RATIO)) {
        readingDirection === "ltr" ? navigateNext() : navigatePrev();
      } else {
        toggleControls();
      }
    },
    [endPointer, readingDirection, navigatePrev, navigateNext, toggleControls],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      endPointer(e.pointerId);
      if (gesture.current.pointers.size === 0) gesture.current.press = null;
    },
    [endPointer],
  );

  const zoomed = isZoomed(view);
  const contentStyle: CSSProperties | undefined =
    view === FIT
      ? undefined
      : {
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "0 0",
        };

  return {
    frameRef: attachFrame,
    contentRef,
    view,
    zoomed,
    settledScale,
    zoomBy,
    reset,
    contentStyle,
    frameHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
