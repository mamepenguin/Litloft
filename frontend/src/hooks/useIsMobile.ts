"use client";

import { useSyncExternalStore } from "react";

export const MOBILE_BREAKPOINT = 768;

export function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const isMobileNow = () => window.innerWidth < MOBILE_BREAKPOINT;
const serverIsMobile = () => false;

/**
 * The server render and hydration answer `false`, then the real width takes
 * over in the commit that follows, so callers should treat the first paint
 * of a server-rendered page as "desktop and may need a re-layout."
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeToResize, isMobileNow, serverIsMobile);
}
