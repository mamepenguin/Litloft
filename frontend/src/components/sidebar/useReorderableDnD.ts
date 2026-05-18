"use client";

import { useCallback, useRef, useState } from "react";

import { reorder } from "./orderMerge";

/**
 * Generic native-HTML5-DnD reordering primitive for a single ordered list.
 *
 * Design constraints (hako c3CcYY_a8nRwD5lG-zeOi / IDvBzhsmV1HR1maUwHzhX):
 *
 * - No DnD library. Native `draggable` + dataTransfer only.
 * - **Never reflows the row list.** The hook only reports which row the drop
 *   indicator belongs to (`dropTarget`). The consumer renders that indicator
 *   as an `absolute` overlay so the dragged row stays under the pointer — the
 *   FolderTreePane 34px-shift bug must not recur.
 * - Cross-list drops are rejected purely by a per-`kind` MIME type, so the
 *   guard works during `dragover` without reading dataTransfer data (which
 *   browsers forbid until `drop`).
 *
 * Fixed (non-reorderable) zones simply do not spread `getRowProps`, so they
 * can never become a drop target.
 */

export interface DropTarget {
  id: string;
  position: "before" | "after";
}

interface UseReorderableDnDParams {
  /** Stable namespace; becomes part of the MIME type so lists do not mix. */
  kind: string;
  /** Current order of stable IDs (already merged/resolved). */
  ids: readonly string[];
  /** Called with the next order when a valid drop completes. */
  onReorder: (next: string[]) => void;
}

const mimeFor = (kind: string) => `application/x-litloft-reorder-${kind}`;

export function useReorderableDnD({ kind, ids, onReorder }: UseReorderableDnDParams) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // dragenter/leave fire per child; ref avoids stale-closure flicker.
  const draggingRef = useRef<string | null>(null);
  const mime = mimeFor(kind);

  const clear = useCallback(() => {
    draggingRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const getHandleProps = useCallback(
    (id: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        draggingRef.current = id;
        setDraggingId(id);
        e.dataTransfer.effectAllowed = "move";
        // Custom per-kind MIME = the cross-list guard. Plus a text fallback
        // for environments that require a standard type.
        e.dataTransfer.setData(mime, id);
        e.dataTransfer.setData("text/plain", id);
      },
      onDragEnd: clear,
    }),
    [clear, mime],
  );

  const getRowProps = useCallback(
    (id: string) => ({
      onDragOver: (e: React.DragEvent) => {
        // Only react to a drag that originated from the same list/kind.
        if (!e.dataTransfer.types.includes(mime)) return;
        const dragged = draggingRef.current;
        if (dragged === null || dragged === id) {
          if (dropTarget !== null) setDropTarget(null);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const position: "before" | "after" =
          e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        if (dropTarget?.id !== id || dropTarget.position !== position) {
          setDropTarget({ id, position });
        }
      },
      onDrop: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(mime)) return;
        e.preventDefault();
        const dragged = draggingRef.current ?? e.dataTransfer.getData(mime);
        if (dragged && dragged !== id) {
          const rect = e.currentTarget.getBoundingClientRect();
          const position: "before" | "after" =
            e.clientY < rect.top + rect.height / 2 ? "before" : "after";
          const next = reorder(ids, dragged, id, position);
          if (next.some((v, i) => v !== ids[i]) || next.length !== ids.length) {
            onReorder(next);
          }
        }
        clear();
      },
    }),
    [clear, dropTarget, ids, mime, onReorder],
  );

  return { draggingId, dropTarget, getHandleProps, getRowProps };
}
