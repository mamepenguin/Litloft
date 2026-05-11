"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Tracks whether the viewport is below the mobile breakpoint
 * (Tailwind's `md`, 768px).
 *
 * Initial SSR / first-paint render returns `false` because `window`
 * is unavailable; the value is corrected on mount, so callers should
 * treat the first paint as "desktop and may need a re-layout."
 *
 * Listeners are attached on mount and detached on unmount — each
 * caller owns its own subscription. This is cheap (a single resize
 * listener per consumer) and avoids prop-drilling viewport state
 * through trees that already track other UI state locally.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(getIsMobile);
  useEffect(() => {
    function handleResize() {
      setIsMobile(getIsMobile());
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}
