"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Can the tree and the content sit side by side?
 *
 * The one place that number lives. Two components ask it — the layout,
 * which decides whether to draw the tree, and the toolbar's toggle, which
 * has to report the same answer or it will say "on" over a tree that is
 * not there.
 *
 * It is **not** the sidebar's 1200px. That one asks whether the *sidebar*
 * and the content fit together; this one asks about the tree. Two
 * questions, two numbers, and one of them cannot answer the other.
 */
export const TREE_BESIDE_QUERY = "(min-width: 768px)"; // Tailwind `md`

export function useTreeBeside(): boolean {
  // `useSyncExternalStore`, not `useState` + `useEffect`. A passive effect
  // runs after paint, so on a phone the first painted frame would be the
  // wide answer — a full-viewport tree over the folder, which is the exact
  // screen this rule exists to prevent — and anything deriving its initial
  // state from that frame would latch the wrong value for the session.
  //
  // jsdom omits `matchMedia`, and this hook is reached from every screen
  // with a toolbar. Answering "beside" there puts those screens where the
  // stylesheet would have put them at `md`; a test that cares about the
  // narrow case stubs it.
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
