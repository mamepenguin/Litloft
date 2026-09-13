"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * It is **not** the sidebar's 1200px. That one asks whether the *sidebar*
 * and the content fit together; this one asks about the tree.
 */
export const TREE_BESIDE_QUERY = "(min-width: 768px)"; // Tailwind `md`

export function useTreeBeside(): boolean {
  // `useSyncExternalStore`, not `useState` + `useEffect`. A passive effect
  // runs after paint, so on a phone the first painted frame would be the
  // wide answer — a full-viewport tree over the folder, which is the exact
  // screen this rule exists to prevent — and anything deriving its initial
  // state from that frame would latch the wrong value for the session.
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const mql = window.matchMedia(TREE_BESIDE_QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia(TREE_BESIDE_QUERY).matches
        : true,
    // The server has no viewport. `md` is the wider branch and the one the
    // stylesheet paints without JavaScript.
    () => true,
  );
}
