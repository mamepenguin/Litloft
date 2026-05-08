"use client";

import { useCallback, useEffect, useState } from "react";

import type { FolderKind, ViewMode } from "@/types";

const GLOBAL_KEY = "video-share-view-mode";
const PER_DRIVE_PREFIX = "folderPrefs:";
const VALID_MODES: ViewMode[] = ["grid", "list"];

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
      return "list";
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
}

export function resolveFolderViewMode(opts: ResolveOpts): ViewMode {
  const { drive, folderPath, dominantKind } = opts;
  const prefs = loadFolderPrefs(drive);
  const stored = prefs[folderPath]?.viewMode;
  if (isViewMode(stored)) return stored;
  const auto = autoDetectMode(dominantKind);
  if (auto) return auto;
  const global = loadGlobalDefault();
  if (global) return global;
  return "grid";
}

interface UseFolderViewModeResult {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function useFolderViewMode(opts: ResolveOpts): UseFolderViewModeResult {
  const { drive, folderPath, dominantKind } = opts;
  const [viewMode, setViewModeState] = useState<ViewMode>(() => resolveFolderViewMode(opts));

  useEffect(() => {
    setViewModeState(resolveFolderViewMode({ drive, folderPath, dominantKind }));
  }, [drive, folderPath, dominantKind]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const prefs = loadFolderPrefs(drive);
      const next: FolderPrefs = {
        ...prefs,
        [folderPath]: { ...prefs[folderPath], viewMode: mode },
      };
      saveFolderPrefs(drive, next);
      setViewModeState(mode);
    },
    [drive, folderPath],
  );

  return { viewMode, setViewMode };
}
