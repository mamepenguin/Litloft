"use client";

import { useEffect, useState } from "react";

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
  // True on the server and on the first client frame: the tree is drawn
  // by CSS width at `md`, so starting wide and narrowing matches what the
  // stylesheet would have painted anyway.
  const [beside, setBeside] = useState(true);
  useEffect(() => {
    // jsdom omits `matchMedia`, and this hook is now reached from every
    // screen that draws a toolbar. Keeping the default rather than
    // throwing puts those screens where the stylesheet would have put
    // them at `md`; a test that cares about the narrow case stubs it.
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(TREE_BESIDE_QUERY);
    const sync = () => setBeside(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return beside;
}
