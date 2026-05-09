"use client";

import { useEffect, useRef } from "react";

/**
 * Expands every ancestor (and the leaf) of `currentFolderPath` exactly
 * once, on first mount. Subsequent changes to `currentFolderPath` do
 * NOT trigger further expansion — the tree is the user's hand-built
 * map after that point.
 *
 * Drop-in replacement for the previous "expand on every navigation"
 * effect (hako `dIUr0KGPRCGiAPTtkG-LO`). Kept as an isolated hook so
 * the body can be swapped to a no-op to enter the strict-separation
 * mode (Craft-style: localStorage-only) without touching FolderTreePane.
 */
export function useInitialReveal(
  currentFolderPath: string | undefined,
  expand: (path: string) => void,
): void {
  const expandRef = useRef(expand);
  expandRef.current = expand;

  useEffect(() => {
    if (!currentFolderPath) return;
    const parts = currentFolderPath.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      expandRef.current(parts.slice(0, i).join("/"));
    }
    // Mount-only: intentionally exclude `currentFolderPath` from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
