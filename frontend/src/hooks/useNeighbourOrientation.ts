"use client";

import { useEffect, useState } from "react";

import type { Orientation } from "@/lib/spreadPaging";

/**
 * An archive entry carries no stored dimensions, so the only way to know
 * whether the next page is tall is to fetch it.
 *
 * No index beyond the immediate next is ever requested, and at most one
 * answer is ever applied: the cleanup cancels the answer, not the fetch.
 *
 * `unknown` until it answers, which the paging rules read as "do not
 * pair yet" rather than as a guess either way.
 */
export function useNeighbourOrientation(url: string | null): Orientation {
  const [orientation, setOrientation] = useState<Orientation>("unknown");

  useEffect(() => {
    setOrientation("unknown");
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setOrientation(
        img.naturalWidth > img.naturalHeight ? "landscape" : "portrait",
      );
    };
    // A page that will not load has no shape to report, and `unknown`
    // keeps it out of a pair rather than pairing it blind.
    img.onerror = () => {
      if (!cancelled) setOrientation("unknown");
    };
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  return orientation;
}
