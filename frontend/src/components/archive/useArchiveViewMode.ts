"use client";

import { useState } from "react";

type ViewMode = "grid" | "list";

const STORAGE_KEY = "archive-view-mode";

function readStoredMode(): ViewMode {
  if (typeof window === "undefined") return "grid";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "grid" || stored === "list") return stored;
  return "grid";
}

interface UseArchiveViewModeResult {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function useArchiveViewMode(): UseArchiveViewModeResult {
  const [viewMode, setViewModeState] = useState<ViewMode>(readStoredMode);

  function setViewMode(mode: ViewMode) {
    localStorage.setItem(STORAGE_KEY, mode);
    setViewModeState(mode);
  }

  return { viewMode, setViewMode };
}
