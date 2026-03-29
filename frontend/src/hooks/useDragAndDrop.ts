"use client";

import { useCallback, useRef, useState } from "react";
import { batchMove, moveFile } from "@/lib/api";

export interface DragState {
  isDragging: boolean;
  draggedFileIds: string[];
  dropTargetPath: string | null;
}

export interface UseDragAndDropOptions {
  drive: string;
  selectedIds: Set<string>;
  onComplete: () => void;
}

export function useDragAndDrop({ drive, selectedIds, onComplete }: UseDragAndDropOptions) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedFileIds: [],
    dropTargetPath: null,
  });

  const dragCounterRef = useRef<Map<string, number>>(new Map());
  const draggedIdsRef = useRef<string[]>([]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, fileId: string) => {
      const ids = selectedIds.size > 0 && selectedIds.has(fileId)
        ? Array.from(selectedIds)
        : [fileId];

      draggedIdsRef.current = ids;
      e.dataTransfer.setData("application/x-file-ids", JSON.stringify(ids));
      e.dataTransfer.effectAllowed = "copyMove";

      setDragState({
        isDragging: true,
        draggedFileIds: ids,
        dropTargetPath: null,
      });
    },
    [selectedIds],
  );

  const handleDragEnd = useCallback(() => {
    draggedIdsRef.current = [];
    dragCounterRef.current.clear();
    setDragState({
      isDragging: false,
      draggedFileIds: [],
      dropTargetPath: null,
    });
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

      const ids = draggedIdsRef.current;
      if (ids.length === 0) return;

      setDragState({
        isDragging: false,
        draggedFileIds: [],
        dropTargetPath: null,
      });

      try {
        if (ids.length === 1) {
          await moveFile(ids[0], targetPath);
        } else {
          await batchMove(ids, targetPath);
        }
        onComplete();
      } catch {
        // Backend returns 403 for readonly drives, 404 for invalid paths
      }
    },
    [onComplete],
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

  return {
    dragState,
    handleDragStart,
    handleDragEnd,
    getDropTargetProps,
    isDropTarget,
  };
}
