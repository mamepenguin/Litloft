"use client";

import { useEffect, useState } from "react";

/**
 * Whether the frame can hold two pages side by side.
 *
 * The rule is the frame's own shape, not a width in pixels: two tall
 * pages placed side by side make a wide one, so the frame has to be at
 * least as wide as it is tall to hold them without drawing each page
 * smaller than it would be alone. A pixel threshold would say the wrong
 * thing on a short window, and would need a second number for every
 * device that turned up.
 *
 * It reads the viewport rather than a container because both full-screen
 * viewers *are* the viewport — `fixed inset-0`, with nothing between
 * them and the window. There is no container here whose width could
 * differ from it.
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
