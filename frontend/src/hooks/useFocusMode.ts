"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { MOBILE_BREAKPOINT } from "@/hooks/useIsMobile";
import { driveUnavailableStore } from "@/lib/driveUnavailableStore";
import { focusModeStore } from "@/lib/focusModeStore";
import { rememberReadingAnchor } from "@/lib/readingAnchor";

/**
 * `/files/{id}` (any query), or a `/drive/{drive}/…` URL that has a file open
 * in its right pane. Read from the router, so it is known on the first render
 * and has no gap while one file host hands over to the next.
 */
export function isFilePageUrl(
  pathname: string | null,
  fileId: string | null,
): boolean {
  if (!pathname) return false;
  if (/^\/files\/[^/]+\/?$/.test(pathname)) return true;
  return pathname.startsWith("/drive/") && !!fileId;
}

/**
 * The URL alone cannot tell that the drive's page stood in for the file page,
 * so the screen that replaces it is asked as well.
 */
export function useIsFilePageUrl(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const unavailable = useSyncExternalStore(
    driveUnavailableStore.subscribe,
    driveUnavailableStore.get,
    () => false,
  );
  return !unavailable && isFilePageUrl(pathname, searchParams.get("file"));
}

/**
 * Both reveal paths are offered on a device that has both kinds of pointer,
 * so each is asked for on its own: `usePointerMode` answers the primary one
 * and would hide one of them.
 */
export function useAnyPointer(): { fine: boolean; coarse: boolean } {
  const [pointers, setPointers] = useState({ fine: false, coarse: false });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const fine = window.matchMedia("(any-pointer: fine)");
    const coarse = window.matchMedia("(any-pointer: coarse)");
    const sync = () => setPointers({ fine: fine.matches, coarse: coarse.matches });
    sync();
    fine.addEventListener?.("change", sync);
    coarse.addEventListener?.("change", sync);
    return () => {
      fine.removeEventListener?.("change", sync);
      coarse.removeEventListener?.("change", sync);
    };
  }, []);
  return pointers;
}

/** At `MOBILE_BREAKPOINT` and wider the focus layout has room to apply. */
export function useIsWideViewport(): boolean {
  const [wide, setWide] = useState(
    () =>
      typeof window !== "undefined" &&
      window.innerWidth >= MOBILE_BREAKPOINT,
  );
  useEffect(() => {
    const handle = () => setWide(window.innerWidth >= MOBILE_BREAKPOINT);
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return wide;
}

export function useFocusState(): boolean {
  return useSyncExternalStore(
    focusModeStore.subscribe,
    focusModeStore.get,
    () => false,
  );
}

/** The state, the URL and the viewport together: only this changes the screen. */
export function useFocusLayout(): boolean {
  const state = useFocusState();
  const filePage = useIsFilePageUrl();
  const wide = useIsWideViewport();
  return state && filePage && wide;
}

/**
 * Both ways the reader turns it on or off come through here: the chrome is
 * about to take or give back the space around the content, and the reader's
 * place in that content has to survive it.
 *
 * Below 768px the state moves and the layout does not, so an anchor taken
 * there would be spent by whatever resize applies the layout later, on a
 * position the reader has long since left.
 */
export function toggleFocusMode(layoutChanges = true): void {
  if (layoutChanges) rememberReadingAnchor();
  focusModeStore.toggle();
}
