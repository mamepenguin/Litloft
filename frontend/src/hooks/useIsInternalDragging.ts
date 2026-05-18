"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Returns `true` while any `useDragAndDrop` instance in the page has an
 * internal (move-file / move-folder) drag in progress. Used by the tree
 * pane and the right pane to show drop targets even when the drag
 * originated from the sibling pane.
 *
 * `flushSync` is used for the start listener so that the tree pane's
 * drop-target props are committed synchronously before the first `dragenter`
 * event fires on a tree row. Without it, React 18's auto-batching defers
 * the state update to the next frame, leaving tree rows without `onDragEnter`
 * handlers when the cursor arrives — causing cross-pane drops to silently
 * fail (no `preventDefault()` on dragover → browser rejects the drop).
 */
export function useIsInternalDragging(): boolean {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const start = () => flushSync(() => setIsDragging(true));
    const end = () => setIsDragging(false);
    window.addEventListener("loft-internal-drag-start", start);
    window.addEventListener("loft-internal-drag-end", end);
    return () => {
      window.removeEventListener("loft-internal-drag-start", start);
      window.removeEventListener("loft-internal-drag-end", end);
    };
  }, []);

  return isDragging;
}
