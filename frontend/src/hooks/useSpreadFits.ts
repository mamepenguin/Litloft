"use client";

import { useEffect, useState } from "react";

/**
 * The rule is the frame's own shape rather than a width in pixels: a
 * pixel threshold says the wrong thing on a short window and needs a new
 * number for every device that turns up.
 *
 * It is an approximation: the exact rule is `width / height >= 2a` for
 * pages of aspect `a`, but the archive has no page dimensions at all.
 * Between `1` and `2a` the pages do pair and are drawn smaller than they
 * would be alone.
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
