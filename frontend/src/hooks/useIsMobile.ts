"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Initial SSR / first-paint render returns `false` because `window`
 * is unavailable; the value is corrected on mount, so callers should
 * treat the first paint as "desktop and may need a re-layout."
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
