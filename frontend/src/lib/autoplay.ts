"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "video-share-autoplay";

export function readAutoplayPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem?.(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useAutoplayPreference(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(readAutoplayPreference());
  }, []);

  const update = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable (private mode, test env) — keep in-memory only
    }
  }, []);

  return [enabled, update];
}
