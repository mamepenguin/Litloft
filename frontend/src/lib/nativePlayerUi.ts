"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "native-player-ui";

export type NativePlayerUi = "litloft" | "browser";

export function readNativePlayerUiPreference(): NativePlayerUi {
  if (typeof window === "undefined") return "litloft";
  try {
    return window.localStorage?.getItem?.(STORAGE_KEY) === "browser"
      ? "browser"
      : "litloft";
  } catch {
    return "litloft";
  }
}

export function useNativePlayerUiPreference(): [
  NativePlayerUi,
  (value: NativePlayerUi) => void,
] {
  const [ui, setUi] = useState<NativePlayerUi>("litloft");

  // Hydrate after render so the server and first client frame agree.
  useEffect(() => {
    setUi(readNativePlayerUiPreference());
  }, []);

  const update = useCallback((value: NativePlayerUi) => {
    setUi(value);
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, value);
    } catch {
      // Private mode or locked-down storage: keep the in-memory choice.
    }
  }, []);

  return [ui, update];
}
