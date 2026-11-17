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

  // The anchor belongs to the rows that were being ranged over; after a
  // replacement it may name a row that is no longer selected.
  const replace = useCallback((ids: string[]) => {
    lastToggledIdRef.current = null;
    setSelectedIds(new Set(ids));
  }, []);

  const keepOnly = useCallback((ids: readonly string[]) => {
    const kept = new Set(ids);
    if (lastToggledIdRef.current && !kept.has(lastToggledIdRef.current)) {
      lastToggledIdRef.current = null;
    }
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => kept.has(id)));
      return next.size === prev.size ? prev : next;
    });
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
    replace,
    keepOnly,
    clear,
    isSelected,
  };
}
