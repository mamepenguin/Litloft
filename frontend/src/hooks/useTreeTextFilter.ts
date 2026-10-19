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
 * Resets whenever the drive changes or the tree is toggled off so users
 * don't get an invisible filter on a freshly opened drive.
 */
export function useTreeTextFilter(drive: string, treeEnabled: boolean): TreeTextFilterApi {
  const [text, setTextState] = useState("");
  const [debouncedText, setDebouncedText] = useState("");

  useEffect(() => {
    setTextState("");
    setDebouncedText("");
  }, [drive, treeEnabled]);

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
