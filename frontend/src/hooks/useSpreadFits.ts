"use client";

import { useEffect, useState } from "react";

/**
 * Whether the frame can hold two pages side by side.
 *
 * The rule is the frame's own shape rather than a width in pixels: a
 * pixel threshold says the wrong thing on a short window and needs a new
 * number for every device that turns up.
 *
 * **It is an approximation, and the exact rule is not available here.**
 * Two pages of aspect `a` side by side make a block of aspect `2a`, so
 * "without drawing either page smaller than it would be alone" is
 * `width / height >= 2a` — 1.41 for A4, not 1. Spec §13(c) writes that
 * out. This hook cannot evaluate it: the archive has no page dimensions
 * at all, which is the whole reason `useNeighbourOrientation` exists,
 * and one shared rule is worth more than two that disagree.
 *
 * So `1` is a floor under `2a` for anything narrower than 2:1, which is
 * every page shape a book uses. Between `1` and `2a` — a 1000x900 window
 * with A4 pages, say — the pages do pair and are drawn about a fifth
 * smaller than they would be alone. That is the known cost of the
 * approximation, not a claim that it does not exist.
 *
 * It reads the viewport rather than a container because both full-screen
 * viewers *are* the viewport — `fixed inset-0`, with nothing between
 * them and the window.
 */
export function useSpreadFits(): boolean {
  const [fits, setFits] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => setFits(window.innerWidth >= window.innerHeight);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  return fits;
}
