"use client";

import { useCallback, useEffect, useState } from "react";

const DEBOUNCE_MS = 300;

export interface TreeTextFilterApi {
  text: string;
  debouncedText: string;
  setText: (next: string) => void;
  clear: () => void;
}

/**
 * Tree-pane text filter (no persistence). Resets whenever the drive
 * changes or the tree is toggled off so users don't get an invisible
 * filter on a freshly opened drive.
 *
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §3.7.
 */
export function useTreeTextFilter(drive: string, treeEnabled: boolean): TreeTextFilterApi {
  const [text, setTextState] = useState("");
  const [debouncedText, setDebouncedText] = useState("");

  // Reset on drive change or when the tree pane is hidden.
  useEffect(() => {
    setTextState("");
    setDebouncedText("");
  }, [drive, treeEnabled]);

  // Debounce text updates by 300ms before exposing them to consumers.
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

  return { text, debouncedText, setText, clear };
}
