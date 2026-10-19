"use client";

import { useEffect, useState } from "react";

/**
 * vaul's snap arithmetic is a pure function of `window.innerHeight`, so
 * anything that has to line up with a snap has to be expressed against that
 * same number. A CSS viewport unit (`vh`, `svh`) disagrees with it by the
 * height of the browser's own chrome.
 *
 * The visual viewport is the one a URL bar collapsing reports first on iOS.
 *
 * Returns `0` before the first client render, which every caller has to
 * treat as "nothing measured yet" rather than as a very short window.
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );

  useEffect(() => {
    const read = () => setHeight(window.innerHeight);
    read();

    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, []);

  return height;
}
