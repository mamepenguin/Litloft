"use client";

import { useCallback, useRef, useState } from "react";

export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastToggledIdRef = useRef<string | null>(null);

  const toggle = useCallback((id: string) => {
    lastToggledIdRef.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectRange = useCallback((allIds: string[], targetId: string) => {
    const anchorId = lastToggledIdRef.current;
    if (!anchorId) {
      lastToggledIdRef.current = targetId;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(targetId);
        return next;
      });
      return;
    }
    const anchorIdx = allIds.indexOf(anchorId);
    const targetIdx = allIds.indexOf(targetId);
    if (anchorIdx === -1 || targetIdx === -1) return;
    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const rangeIds = allIds.slice(start, end + 1);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of rangeIds) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    lastToggledIdRef.current = null;
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  return {
    selectedIds,
    count: selectedIds.size,
    toggle,
    selectRange,
    selectAll,
    clear,
    isSelected,
  };
}
