"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, useRef } from "react";

import { notifyNavigationCommit } from "@/lib/viewTransitions";

function Signal() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const url = query ? `${pathname}?${query}` : pathname;
  const reported = useRef<string | null>(null);

  // A layout effect, not an effect: a view transition captures the
  // destination as soon as its update callback settles, and this is what
  // settles it. After paint would be too late.
  useLayoutEffect(() => {
    if (reported.current === url) return;
    reported.current = url;
    notifyNavigationCommit(url);
  }, [url]);

  return null;
}

/**
 * `useSearchParams` client-side renders everything up to the nearest
 * boundary, and a production build of a prerendered route fails without
 * one.
 */
export function NavigationCommitSignal() {
  return (
    <Suspense fallback={null}>
      <Signal />
    </Suspense>
  );
}
