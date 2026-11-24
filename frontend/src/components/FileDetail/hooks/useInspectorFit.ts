"use client";

import { useCallback, useEffect, useRef } from "react";

import type { InspectorForm } from "@/lib/inspectorFormStore";
import { INSPECTOR_BESIDE_MIN_REM } from "@/lib/layoutSizes";

interface UseInspectorFitOptions {
  isMobile: boolean;
  /** A video, an audio file or a `.loft`: the only kinds that stack. */
  isPlayerFile: boolean;
  /**
   * The form the row measured, or `null` where it has no width to decide
   * from.
   */
  onMeasure?: (form: Exclude<InspectorForm, "absent"> | null) => void;
  /**
   * The left pane while it is still open and a yield is possible. Its width
   * is part of the row the form is decided from, because it is about to
   * give that width back.
   */
  paneToYield?: () => HTMLElement | null;
  /** The row is too narrow to hold the pane and the inspector together. */
  onYield?: () => void;
}

interface InspectorFit {
  attach: (node: HTMLElement | null) => void;
  /**
   * Decides the yield now, with the inputs as they are. The form is
   * published only when the pane does step aside, so a page that never
   * yields keeps waiting for its first measured frame.
   */
  evaluateYield: () => void;
}

/**
 * **Measured, not a breakpoint**: the shell renders full-width on one route
 * and inside the 2-pane right pane on another.
 *
 * Measured on the row that holds both, never on the canvas: the canvas
 * is what changes width when the inspector opens, so measuring it would
 * make the answer depend on the answer.
 */
export function useInspectorFit({
  isMobile,
  isPlayerFile,
  onMeasure,
  paneToYield,
  onYield,
}: UseInspectorFitOptions): InspectorFit {
  const hostRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const frameRef = useRef<number | null>(null);
  const onMeasureRef = useRef(onMeasure);
  onMeasureRef.current = onMeasure;
  const paneToYieldRef = useRef(paneToYield);
  paneToYieldRef.current = paneToYield;
  const onYieldRef = useRef(onYield);
  onYieldRef.current = onYield;

  const run = useCallback(
    (mode: "publish" | "yield") => {
      const host = hostRef.current;
      if (!host) return;
      // The stacked player's height budget is half of this, and it cannot be
      // derived from anything else on the page.
      if (host.clientHeight > 0) {
        host.style.setProperty("--fit-row-h", `${host.clientHeight}px`);
      } else {
        host.style.removeProperty("--fit-row-h");
      }
      // A zero width is "not laid out yet", not "no room" — true of a
      // `display:none` subtree, and of the first frame. Cleared rather
      // than left standing, because a stale "overlay" outlives the width
      // that justified it, and absent already reads as "assume there is
      // room", which is the safe way to be wrong about an unknown.
      if (host.clientWidth === 0) {
        if (mode === "publish") {
          delete host.dataset.inspectorFit;
          onMeasureRef.current?.(null);
        }
        return;
      }
      const pane = paneToYieldRef.current?.() ?? null;
      const paneWidth = pane?.offsetWidth ?? 0;
      const rootFontSize =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        16;
      const threshold = INSPECTOR_BESIDE_MIN_REM * rootFontSize;
      // The pane's width is part of the row because it is about to give it
      // back; read once, before it collapses.
      const fits = host.clientWidth + paneWidth >= threshold;
      const narrow = host.clientWidth < threshold;
      // On a phone nothing depends on the form — the inspector is the sheet
      // — so the attribute keeps its two old values there.
      const form: Exclude<InspectorForm, "absent"> = isMobile
        ? fits
          ? "beside"
          : "overlay"
        : isPlayerFile && !fits
          ? "stacked"
          : fits
            ? "beside"
            : "overlay";
      const yields = paneWidth > 0 && narrow;
      if (mode === "publish" || yields) {
        // Published first: the content the form places is rendered by it,
        // and the attribute is what the stylesheet reads for the same row,
        // so no observer sees the two out of step.
        onMeasureRef.current?.(form);
        if (host.dataset.inspectorFit !== form) host.dataset.inspectorFit = form;
      }
      if (yields) onYieldRef.current?.();
    },
    [isMobile, isPlayerFile],
  );

  /** A player file off a phone defers its content to the first measured frame. */
  const defersToFirstFrame = isPlayerFile && !isMobile;

  const measureFirst = useCallback(() => {
    if (!defersToFirstFrame) {
      run("publish");
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      run("publish");
    });
  }, [defersToFirstFrame, run]);

  useEffect(() => {
    measureFirst();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => run("publish"));
    observerRef.current = observer;
    if (hostRef.current) observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [run, measureFirst]);

  // A callback ref rather than a dependency: the row exists from the
  // first commit, but the effect and the ref land in an order that is
  // not fixed, and whichever runs second finds the other done.
  const attach = useCallback(
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
      measureFirst();
    },
    [measureFirst],
  );

  const evaluateYield = useCallback(() => run("yield"), [run]);

  return { attach, evaluateYield };
}
