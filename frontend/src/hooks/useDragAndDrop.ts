"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { batchMove, moveFile, moveFolder } from "@/lib/api";

/**
 * Two panes mounting their own `useDragAndDrop` instance can't see each
 * other's internal refs; the MIMEs that the source pane wrote during
 * `dragstart` are the only thing both ends agree on.
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
   * Testing membership against the array would hand every memoized card a
   * prop whose identity changes on drag start, defeating the memo.
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
   * Fired synchronously, before the move request is issued. The timing is
   * load-bearing: the browser fires `dragend` right after `drop`, so anything
   * listening for the end of the drag has already run by the time an awaited
   * move resolves.
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

      if (parseError) return;

      try {
        if (folderPath !== null) {
          // Mirrors backend validation so we don't swallow a 400 silently.
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
          return;
        }
        onComplete();
        // The drop fires on the TARGET, not the source, so the source's
        // onComplete is never called directly.
        window.dispatchEvent(new Event("loft-move-complete"));
      } catch {
        // Backend returns 403 for readonly drives, 400/404 for invalid paths
      }
    },
    [drive, onComplete, onDropTarget],
  );

  // A virtualized row that scrolls out of the window during a drag
  // unmounts, and a detached node dispatches `dragend` to itself and to
  // nobody else, so the drag state sticks at `isDragging`. Listening on
  // `window` does not help for the same reason.
  //
  // What is reliable: a native drag suppresses mouse events for its
  // entire duration, and they resume once it ends. So the first
  // `pointermove` after a drag started is proof the drag is over.
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
