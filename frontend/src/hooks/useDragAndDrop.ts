"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { batchMove, moveFile, moveFolder } from "@/lib/api";

/**
 * Read the dragged payload from the DataTransfer object as a fallback
 * for cross-pane drops. Two panes mounting their own `useDragAndDrop`
 * instance can't see each other's internal refs; the MIMEs that the
 * source pane wrote during `dragstart` are the only thing both ends
 * agree on.
 */
function readDataTransfer(dt: DataTransfer): {
  ids: string[];
  folderPath: string | null;
  parseError: boolean;
} {
  const folderRaw = dt.getData("application/x-folder-path");
  if (folderRaw) return { ids: [], folderPath: folderRaw, parseError: false };
  const idsRaw = dt.getData("application/x-file-ids");
  if (!idsRaw) return { ids: [], folderPath: null, parseError: false };
  try {
    const parsed = JSON.parse(idsRaw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return { ids: parsed, folderPath: null, parseError: false };
    }
    return { ids: [], folderPath: null, parseError: true };
  } catch {
    return { ids: [], folderPath: null, parseError: true };
  }
}

export interface DragState {
  isDragging: boolean;
  dragType: "file" | "folder" | null;
  draggedFileIds: string[];
  /**
   * The same ids as a set. Card grids pass a per-card `isDragging`
   * boolean to memoized cards; testing membership against the array
   * would hand every card a prop whose identity changes on drag start,
   * defeating the memo (spec
   * `2026-08-21-file-list-deep-scroll-cost` §6.3).
   */
  draggedFileIdSet: ReadonlySet<string>;
  draggedFolderPath: string | null;
  dropTargetPath: string | null;
}

export interface UseDragAndDropOptions {
  drive: string;
  selectedIds: Set<string>;
  onComplete: () => void;
  /**
   * Fired with the target path the moment a drop lands on this hook's
   * instance — synchronously, before the move request is issued.
   *
   * The timing is load-bearing, not stylistic. `handleDrop` is async, and
   * the browser fires `dragend` right after `drop`, so anything listening
   * for the end of the drag (spring-loaded expansion's collapse-back) has
   * already run by the time an awaited move resolves. A drop is reported
   * even if the move then fails: `handleDrop` swallows move errors, so
   * leaving the tree showing where the user aimed is the better of the
   * two available failure modes.
   */
  onDropTarget?: (targetPath: string) => void;
}

const INITIAL_STATE: DragState = {
  isDragging: false,
  dragType: null,
  draggedFileIds: [],
  draggedFileIdSet: new Set<string>(),
  draggedFolderPath: null,
  dropTargetPath: null,
};

export function useDragAndDrop({
  drive,
  selectedIds,
  onComplete,
  onDropTarget,
}: UseDragAndDropOptions) {
  const [dragState, setDragState] = useState<DragState>(INITIAL_STATE);

  const dragCounterRef = useRef<Map<string, number>>(new Map());
  const draggedIdsRef = useRef<string[]>([]);
  const draggedFolderRef = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, fileId: string) => {
      const ids = selectedIds.size > 0 && selectedIds.has(fileId)
        ? Array.from(selectedIds)
        : [fileId];

      draggedIdsRef.current = ids;
      draggedFolderRef.current = null;
      e.dataTransfer.setData("application/x-file-ids", JSON.stringify(ids));
      e.dataTransfer.effectAllowed = "copyMove";

      window.dispatchEvent(new Event("loft-internal-drag-start"));
      setDragState({
        isDragging: true,
        dragType: "file",
        draggedFileIds: ids,
        draggedFileIdSet: new Set(ids),
        draggedFolderPath: null,
        dropTargetPath: null,
      });
    },
    [selectedIds],
  );

  const handleFolderDragStart = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      draggedIdsRef.current = [];
      draggedFolderRef.current = folderPath;
      e.dataTransfer.setData("application/x-folder-path", folderPath);
      e.dataTransfer.effectAllowed = "copyMove";

      window.dispatchEvent(new Event("loft-internal-drag-start"));
      setDragState({
        isDragging: true,
        dragType: "folder",
        draggedFileIds: [],
        draggedFileIdSet: new Set<string>(),
        draggedFolderPath: folderPath,
        dropTargetPath: null,
      });
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    draggedIdsRef.current = [];
    draggedFolderRef.current = null;
    dragCounterRef.current.clear();
    window.dispatchEvent(new Event("loft-internal-drag-end"));
    setDragState(INITIAL_STATE);
  }, []);

  const handleDropTargetEnter = useCallback(
    (e: React.DragEvent, targetPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      const counter = (dragCounterRef.current.get(targetPath) ?? 0) + 1;
      dragCounterRef.current.set(targetPath, counter);
      setDragState((prev) => ({ ...prev, dropTargetPath: targetPath }));
    },
    [],
  );

  const handleDropTargetLeave = useCallback(
    (e: React.DragEvent, targetPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      const counter = (dragCounterRef.current.get(targetPath) ?? 0) - 1;
      dragCounterRef.current.set(targetPath, Math.max(0, counter));
      if (counter <= 0) {
        dragCounterRef.current.delete(targetPath);
        setDragState((prev) =>
          prev.dropTargetPath === targetPath
            ? { ...prev, dropTargetPath: null }
            : prev,
        );
      }
    },
    [],
  );

  const handleDropTargetOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current.clear();
      onDropTarget?.(targetPath);

      // Prefer internal refs (set by handleDragStart on this same hook
      // instance). When empty — the typical cross-pane case — fall back
      // to the DataTransfer payload that any source pane sets during
      // dragstart.
      let folderPath = draggedFolderRef.current;
      let ids = draggedIdsRef.current;
      let parseError = false;
      if (folderPath === null && ids.length === 0) {
        const fromDT = readDataTransfer(e.dataTransfer);
        folderPath = fromDT.folderPath;
        ids = fromDT.ids;
        parseError = fromDT.parseError;
      }

      draggedIdsRef.current = [];
      draggedFolderRef.current = null;
      window.dispatchEvent(new Event("loft-internal-drag-end"));
      setDragState(INITIAL_STATE);

      if (parseError) return; // malformed payload — bail without API call

      try {
        if (folderPath !== null) {
          // Guard: same-location or self-reference (mirrors backend validation so
          // we don't swallow a 400 silently). The backend computes:
          //   new_path = targetPath ? `${targetPath}/${name}` : name
          // and rejects if new_path === folderPath or targetPath is a descendant.
          if (targetPath === folderPath || targetPath.startsWith(folderPath + "/")) return;
          const folderName = folderPath.split("/").pop() ?? folderPath;
          const computedNew = targetPath ? `${targetPath}/${folderName}` : folderName;
          if (computedNew === folderPath) return;
          await moveFolder(drive, folderPath, targetPath);
        } else if (ids.length === 1) {
          await moveFile(ids[0], targetPath);
        } else if (ids.length > 1) {
          await batchMove(ids, targetPath);
        } else {
          return; // nothing to move
        }
        onComplete();
        // Notify ALL panes (source + target) that a move completed so each
        // can refresh its own file list. The target pane's onComplete already
        // ran above; the source pane relies on this event because the drop
        // fires on the TARGET, not the source, so the source's onComplete is
        // never called directly.
        window.dispatchEvent(new Event("loft-move-complete"));
      } catch {
        // Backend returns 403 for readonly drives, 400/404 for invalid paths
      }
    },
    [drive, onComplete, onDropTarget],
  );

  // End-of-drag watchdog.
  //
  // `handleDragEnd` is wired to the source element's `onDragEnd`, which
  // is enough only while that element stays mounted. A virtualized row
  // that scrolls out of the window during a drag unmounts, and a
  // detached node dispatches `dragend` to itself and to nobody else — it
  // has no ancestors left to bubble through, so React's delegated root
  // handler never sees it and the drag state sticks at `isDragging`.
  // Listening on `window` does not help for the same reason; measured in
  // Chromium 2026-08-21 (spec 2026-08-21-inline-rename-and-spring-loaded-
  // drag §6.3).
  //
  // What is reliable: a native drag suppresses mouse events for its
  // entire duration, and they resume once it ends. So the first
  // `pointermove` after a drag started is proof the drag is over. The
  // listener is attached from an effect, which necessarily runs after the
  // `dragstart` handler returned, so it cannot tear down a drag that is
  // still starting.
  useEffect(() => {
    if (!dragState.isDragging) return;
    const handlePointerMove = () => handleDragEnd();
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [dragState.isDragging, handleDragEnd]);

  const getDropTargetProps = useCallback(
    (targetPath: string) => ({
      onDragEnter: (e: React.DragEvent) => handleDropTargetEnter(e, targetPath),
      onDragLeave: (e: React.DragEvent) => handleDropTargetLeave(e, targetPath),
      onDragOver: handleDropTargetOver,
      onDrop: (e: React.DragEvent) => handleDrop(e, targetPath),
    }),
    [handleDropTargetEnter, handleDropTargetLeave, handleDropTargetOver, handleDrop],
  );

  const isDropTarget = useCallback(
    (targetPath: string) => dragState.dropTargetPath === targetPath,
    [dragState.dropTargetPath],
  );

  const isDropDisabled = useCallback(
    (targetPath: string) => {
      if (dragState.dragType !== "folder" || !dragState.draggedFolderPath) return false;
      const dragged = dragState.draggedFolderPath;
      return targetPath === dragged || targetPath.startsWith(dragged + "/");
    },
    [dragState.dragType, dragState.draggedFolderPath],
  );

  return {
    dragState,
    handleDragStart,
    handleFolderDragStart,
    handleDragEnd,
    getDropTargetProps,
    isDropTarget,
    isDropDisabled,
  };
}
