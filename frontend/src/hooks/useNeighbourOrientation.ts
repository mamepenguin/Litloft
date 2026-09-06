"use client";

import { useEffect, useState } from "react";

import type { Orientation } from "@/lib/spreadPaging";

/**
 * The shape of one image that is not on screen yet.
 *
 * An archive entry carries no stored dimensions — the core reads image
 * sizes when it scans a drive, and the pages inside a zip are never
 * scanned — so the only way to know whether the next page is tall is to
 * fetch it.
 *
 * **No index beyond the immediate next is ever requested, and at most
 * one answer is ever applied.** Not "exactly one request is ever in
 * flight": the cleanup cancels the answer, not the fetch, so a reader
 * turning ten pages in two seconds has up to ten in flight — one per
 * page they are about to see, which the viewer's own prefetch wants
 * anyway. The bound that matters is on how far ahead this looks, and
 * that is one.
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
