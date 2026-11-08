"use client";

import { useEffect, useRef } from "react";

import { useScrollContainer } from "@/lib/scrollContainer";

/**
 * The sentinel to render after a list. `onNear` runs when it comes within
 * 400px of the scrolling area; nothing is observed while `enabled` is false.
 */
export function useNearEnd(enabled: boolean, onNear: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrollContainer = useScrollContainer();

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onNear();
      },
      { root: scrollContainer?.current ?? null, rootMargin: "0px 0px 400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, onNear, scrollContainer]);

  return ref;
}
