"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { FileItem, Folder } from "@/types";

const DEBOUNCE_MS = 300;

export interface FolderFilterApi<T extends FileItem> {
  files: T[];
  folders: Folder[];
  text: string;
  setText: (next: string) => void;
  clear: () => void;
  isActive: boolean;
}

/**
 * Right-pane filter for the current folder: a case-insensitive substring
 * match on filename, which also hides folders whose name does not
 * contain it.
 *
 * Text only. It used to carry a type filter as well, forty pixels below
 * the toolbar's — but the toolbar asks the server and this sifted the
 * rows already loaded, so on a folder past its first page of thirty the
 * same choice gave two different answers. The toolbar's is the one that
 * can be right.
 *
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §2,
 * narrowed by 2026-09-03-ui-redesign-p1-vocabulary.md item 1.
 */
export function useFolderFilter<T extends FileItem>(
  files: T[],
  folders: Folder[] = [],
): FolderFilterApi<T> {
  const [text, setTextState] = useState("");
  const [debouncedText, setDebouncedText] = useState("");

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

  const clear = useCallback(() => {
    setTextState("");
    setDebouncedText("");
  }, []);

  const filteredFiles = useMemo(() => {
    if (debouncedText.length === 0) return files;
    const lowered = debouncedText.toLowerCase();
    return files.filter((file) =>
      file.filename.toLowerCase().includes(lowered),
    );
  }, [files, debouncedText]);

  const filteredFolders = useMemo(() => {
    if (debouncedText.length === 0) return folders;
    const lowered = debouncedText.toLowerCase();
    return folders.filter((folder) => folder.name.toLowerCase().includes(lowered));
  }, [folders, debouncedText]);

  // Use debouncedText so the empty-state UI reflects the same view the
  // filter is actually showing — typing without the debounce settling
  // would otherwise flash the empty state for one render.
  const isActive = debouncedText.length > 0;

  return {
    files: filteredFiles,
    folders: filteredFolders,
    text,
    setText,
    clear,
    isActive,
  };
}
