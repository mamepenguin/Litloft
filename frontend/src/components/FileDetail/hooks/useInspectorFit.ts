"use client";

import { useCallback, useEffect, useRef } from "react";

import { INSPECTOR_BESIDE_MIN_REM } from "@/lib/layoutSizes";

/**
 * **Measured, not a breakpoint**: the shell renders full-width on one route
 * and inside the 2-pane right pane on another.
 *
 * Measured on the row that holds both, never on the canvas: the canvas
 * is what changes width when the inspector opens, so measuring it would
 * make the answer depend on the answer.
 */
export function useInspectorFit(): (node: HTMLElement | null) => void {
  const hostRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    // A zero width is "not laid out yet", not "no room" — true of a
    // `display:none` subtree, and of the first frame. Cleared rather
    // than left standing, because a stale "overlay" outlives the width
    // that justified it, and absent already reads as "assume there is
    // room", which is the safe way to be wrong about an unknown.
    if (host.clientWidth === 0) {
      delete host.dataset.inspectorFit;
      return;
    }
    const rootFontSize =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
      16;
    const fits = host.clientWidth >= INSPECTOR_BESIDE_MIN_REM * rootFontSize;
    host.dataset.inspectorFit = fits ? "beside" : "overlay";
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observerRef.current = observer;
    if (hostRef.current) observer.observe(hostRef.current);
    measure();
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [measure]);

  // A callback ref rather than a dependency: the row exists from the
  // first commit, but the effect and the ref land in an order that is
  // not fixed, and whichever runs second finds the other done.
  return useCallback(
    (node: HTMLElement | null) => {
      const previous = hostRef.current;
      if (previous && observerRef.current) {
        observerRef.current.unobserve(previous);
      }
      hostRef.current = node;
      if (!node) return;
      observerRef.current?.observe(node);
      // The observer reports a first size on its own, but only where one
      // exists — a pane that never resizes again would otherwise leave
      // the attribute unset, and absent has to mean something.
      measure();
    },
    [measure],
  );
}
