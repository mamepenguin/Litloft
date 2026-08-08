"use client";

import { useEffect, useState } from "react";

const COARSE_QUERY = "(pointer: coarse)";
const FINE_QUERY = "(pointer: fine)";

/**
 * `"unknown"` is a real answer, not a placeholder: an environment
 * without matchMedia answers neither query, and guessing an input mode
 * there would arm gestures nobody can perform.
 */
export type PointerMode = "fine" | "coarse" | "unknown";

function readMode(): PointerMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "unknown";
  }
  // Coarse wins on a device claiming both. A hybrid reports its
  // *primary* input here, and a finger is the one that needs the
  // larger targets and the gestures.
  if (window.matchMedia(COARSE_QUERY).matches) return "coarse";
  if (window.matchMedia(FINE_QUERY).matches) return "fine";
  return "unknown";
}

/**
 * The primary input device, resolved after mount.
 *
 * Deliberately starts `"unknown"` and only resolves in an effect. The
 * server has no matchMedia at all, so reading it during render would
 * produce markup that disagrees with the client's first paint.
 */
export function usePointerMode(): PointerMode {
  const [mode, setMode] = useState<PointerMode>("unknown");

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const sync = () => setMode(readMode());
    sync();

    // A tablet paired with a keyboard case can switch modes mid-session.
    const queries = [window.matchMedia(COARSE_QUERY), window.matchMedia(FINE_QUERY)];
    queries.forEach((query) => query.addEventListener?.("change", sync));
    return () => queries.forEach((query) => query.removeEventListener?.("change", sync));
  }, []);

  return mode;
}
