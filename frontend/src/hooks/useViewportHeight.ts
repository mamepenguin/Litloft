"use client";

import { useEffect, useState } from "react";

/**
 * `window.innerHeight`, kept current.
 *
 * **One basis, read in one place.** vaul's snap arithmetic is a pure
 * function of `window.innerHeight` and the snap point, so anything that
 * has to line up with a snap has to be expressed against that same
 * number. A CSS viewport unit is a *different* quantity on a phone:
 * `vh` is the large viewport, which does not shrink while a URL bar is
 * showing, and `svh` is the small one, which does not grow when it
 * retracts. A box sized in either and a snap solved from `innerHeight`
 * are two definitions of one edge, and they disagree by the height of
 * the browser's own chrome.
 *
 * The three channels are the three ways that number moves: a window
 * `resize`, a rotation, and the visual viewport — the last is the one a
 * URL bar collapsing reports first on iOS, and `innerHeight` is already
 * the new value by the time the listener runs, so the event is the
 * notification and not the source.
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
