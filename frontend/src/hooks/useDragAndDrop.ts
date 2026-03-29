"use client";

import { useCallback, useRef, useState } from "react";
import { batchMove, moveFile, moveFolder } from "@/lib/api";

export interface DragState {
  isDragging: boolean;
  dragType: "file" | "folder" | null;
  draggedFileIds: string[];
  draggedFolderPath: string | null;
  dropTargetPath: string | null;
}

export interface UseDragAndDropOptions {
  drive: string;
  selectedIds: Set<string>;
  onComplete: () => void;
}

const INITIAL_STATE: DragState = {
  isDragging: false,
  dragType: null,
  draggedFileIds: [],
  draggedFolderPath: null,
  dropTargetPath: null,
};

export function useDragAndDrop({ drive, selectedIds, onComplete }: UseDragAndDropOptions) {
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

      setDragState({
        isDragging: true,
        dragType: "file",
        draggedFileIds: ids,
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

      setDragState({
        isDragging: true,
        dragType: "folder",
        draggedFileIds: [],
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

      const folderPath = draggedFolderRef.current;
      const ids = draggedIdsRef.current;

      draggedIdsRef.current = [];
      draggedFolderRef.current = null;
      setDragState(INITIAL_STATE);

      try {
        if (folderPath !== null) {
          await moveFolder(drive, folderPath, targetPath);
        } else if (ids.length === 1) {
          await moveFile(ids[0], targetPath);
        } else if (ids.length > 1) {
          await batchMove(ids, targetPath);
        }
        onComplete();
      } catch {
        // Backend returns 403 for readonly drives, 400/404 for invalid paths
      }
    },
    [drive, onComplete],
  );

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
