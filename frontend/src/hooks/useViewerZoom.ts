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
}: Options) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>(FIT);
  const [settledScale, setSettledScale] = useState(1);
  const viewRef = useRef<View>(FIT);
  const pointers = useRef(new Map<number, Point>());
  const press = useRef<Press | null>(null);
  const pinch = useRef<Pinch | null>(null);
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
    pointers.current.clear();
    press.current = null;
    pinch.current = null;
    settle(FIT);
  }, [resetKey, settle]);

  useEffect(() => {
    const frameEl = frameRef.current;
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
  }, [measure, localPoint, setView]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const p = localPoint(e.clientX, e.clientY);
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size === 1) {
        press.current = {
          x: e.clientX,
          y: e.clientY,
          t: Date.now(),
          pointerType: e.pointerType,
          zoomedAtStart: isZoomed(viewRef.current),
          pinched: false,
        };
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = {
          distance: distance(a, b),
          mid: midpoint(a, b),
          view: viewRef.current,
        };
        if (press.current) press.current.pinched = true;
      }
    },
    [localPoint],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const previous = pointers.current.get(e.pointerId);
      if (!previous) return;
      const p = localPoint(e.clientX, e.clientY);
      pointers.current.set(e.pointerId, p);

      const start = pinch.current;
      if (start && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
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

      if (pointers.current.size !== 1 || !isZoomed(viewRef.current)) return;
      // A hovering mouse moves with no button down.
      if (e.pointerType === "mouse" && e.buttons === 0) return;
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
    [localPoint, measure, setView],
  );

  const endPointer = useCallback(
    (pointerId: number) => {
      pointers.current.delete(pointerId);
      if (pointers.current.size === 1 && pinch.current) {
        // One finger left of a pinch: it pans from here, not from where the
        // pinch began.
        pinch.current = null;
      }
      if (pointers.current.size > 0) return false;
      const wasPinch = press.current?.pinched ?? false;
      if (wasPinch || pinch.current) {
        pinch.current = null;
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
      const s = press.current;
      const single = endPointer(e.pointerId);
      if (pointers.current.size > 0) return;
      press.current = null;
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
      if (pointers.current.size === 0) press.current = null;
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
    frameRef,
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
