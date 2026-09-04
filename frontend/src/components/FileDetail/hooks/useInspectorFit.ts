"use client";

import { useCallback, useEffect, useRef } from "react";

import { INSPECTOR_BESIDE_MIN_REM } from "@/lib/layoutSizes";

/**
 * Whether the inspector can sit beside the canvas or has to cover it.
 *
 * **Measured, not a breakpoint**, and this is the axis `DESIGN.md` §8.5
 * means by "measure against the container": the shell renders full-width
 * on one route and inside the 2-pane right pane on another, where an
 * inline sidebar and a 280px tree have already taken up to 520px that
 * the viewport says nothing about. A viewport rule put a 296px video on
 * screen at 1200px — wider than the window where the same rule was
 * correct.
 *
 * It is the second of the two axes the design separates, and the pair
 * has to stay separate:
 *
 * - **Viewport** decides whether the inspector *starts* open
 *   (`inspectorOpenStore`, 1120px). A stored choice outranks it.
 * - **Container** decides whether it can be *beside* rather than over.
 *   Nothing outranks it: it is a fact about the space, not a preference.
 *
 * Published as an attribute rather than held in state, the way
 * `data-media-width` is. The placement is decided entirely in CSS, so a
 * window drag costs no React work and the inspector does not re-mount
 * when it changes form — which matters, because its tab panels hold a
 * transcript's scroll position and its subscription to the playback
 * clock.
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
