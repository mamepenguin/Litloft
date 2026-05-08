"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { FileItem, TreeTypeFilter } from "@/types";
import { fileMatchesTypeFilter } from "@/lib/fileTypeFilter";

const DEBOUNCE_MS = 300;

export interface FolderFilterApi<T extends FileItem> {
  files: T[];
  text: string;
  setText: (next: string) => void;
  typeFilter: TreeTypeFilter | null;
  setTypeFilter: (next: TreeTypeFilter | null) => void;
  clear: () => void;
  isActive: boolean;
}

/**
 * Right-pane filter for the current folder. Applies a case-insensitive
 * substring match on filename plus an optional type filter.
 *
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §2.
 */
export function useFolderFilter<T extends FileItem>(files: T[]): FolderFilterApi<T> {
  const [text, setTextState] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [typeFilter, setTypeFilterState] = useState<TreeTypeFilter | null>(null);

  // Debounce text input to keep the filter responsive on large folders.
  useEffect(() => {
    if (text === debouncedText) return;
    const handle = window.setTimeout(() => {
      setDebouncedText(text);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [text, debouncedText]);

  const setText = useCallback((next: string) => {
    setTextState(next);
  }, []);

  const setTypeFilter = useCallback((next: TreeTypeFilter | null) => {
    setTypeFilterState(next);
  }, []);

  const clear = useCallback(() => {
    setTextState("");
    setDebouncedText("");
    setTypeFilterState(null);
  }, []);

  const filteredFiles = useMemo(() => {
    if (debouncedText.length === 0 && typeFilter === null) return files;
    const lowered = debouncedText.toLowerCase();
    return files.filter((file) => {
      const nameMatches =
        lowered.length === 0 || file.filename.toLowerCase().includes(lowered);
      if (!nameMatches) return false;
      if (typeFilter === null) return true;
      return fileMatchesTypeFilter(file, typeFilter);
    });
  }, [files, debouncedText, typeFilter]);

  // Use debouncedText so the empty-state UI reflects the same view the
  // filter is actually showing — typing without the debounce settling
  // would otherwise flash the empty state for one render.
  const isActive = debouncedText.length > 0 || typeFilter !== null;

  return {
    files: filteredFiles,
    text,
    setText,
    typeFilter,
    setTypeFilter,
    clear,
    isActive,
  };
}
