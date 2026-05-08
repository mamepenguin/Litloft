"use client";

import { useCallback, useEffect, useState } from "react";

import type { FolderKind, ViewMode } from "@/types";

const GLOBAL_KEY = "video-share-view-mode";
const PER_DRIVE_PREFIX = "folderPrefs:";
const VALID_MODES: ViewMode[] = ["grid", "list", "two-pane"];

interface FolderPrefsEntry {
  viewMode?: ViewMode;
}

type FolderPrefs = Record<string, FolderPrefsEntry>;

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VALID_MODES as string[]).includes(value);
}

function loadFolderPrefs(drive: string): FolderPrefs {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${PER_DRIVE_PREFIX}${drive}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed == null) return {};
    return parsed as FolderPrefs;
  } catch {
    return {};
  }
}

function saveFolderPrefs(drive: string, prefs: FolderPrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${PER_DRIVE_PREFIX}${drive}`, JSON.stringify(prefs));
  } catch {
    // localStorage quota exceeded — silently drop
  }
}

function loadGlobalDefault(): ViewMode | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(GLOBAL_KEY);
  return isViewMode(raw) ? raw : null;
}

function autoDetectMode(kind: FolderKind | null): ViewMode | null {
  switch (kind) {
    case "markdown":
      return "two-pane";
    case "video":
    case "image":
    case "audio":
      return "grid";
    default:
      return null;
  }
}

interface ResolveOpts {
  drive: string;
  folderPath: string;
  dominantKind: FolderKind | null;
  twoPaneAllowed: boolean;
}

function clampToAllowed(mode: ViewMode | null, twoPaneAllowed: boolean): ViewMode | null {
  if (mode === "two-pane" && !twoPaneAllowed) return null;
  return mode;
}

export function resolveFolderViewMode(opts: ResolveOpts): ViewMode {
  const { drive, folderPath, dominantKind, twoPaneAllowed } = opts;
  const prefs = loadFolderPrefs(drive);
  const override = clampToAllowed(prefs[folderPath]?.viewMode ?? null, twoPaneAllowed);
  if (override) return override;
  const auto = clampToAllowed(autoDetectMode(dominantKind), twoPaneAllowed);
  if (auto) return auto;
  const global = clampToAllowed(loadGlobalDefault(), twoPaneAllowed);
  if (global) return global;
  return "grid";
}

interface UseFolderViewModeResult {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function useFolderViewMode(opts: ResolveOpts): UseFolderViewModeResult {
  const { drive, folderPath, dominantKind, twoPaneAllowed } = opts;
  const [viewMode, setViewModeState] = useState<ViewMode>(() => resolveFolderViewMode(opts));

  useEffect(() => {
    setViewModeState(resolveFolderViewMode({ drive, folderPath, dominantKind, twoPaneAllowed }));
  }, [drive, folderPath, dominantKind, twoPaneAllowed]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (mode === "two-pane" && !twoPaneAllowed) return;
      const prefs = loadFolderPrefs(drive);
      const next: FolderPrefs = {
        ...prefs,
        [folderPath]: { ...prefs[folderPath], viewMode: mode },
      };
      saveFolderPrefs(drive, next);
      setViewModeState(mode);
    },
    [drive, folderPath, twoPaneAllowed],
  );

  return { viewMode, setViewMode };
}
