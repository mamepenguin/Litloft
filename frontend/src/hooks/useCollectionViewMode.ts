"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CollectionItemEntry, FileItem, FolderKind, ViewMode } from "@/types";

/**
 * Spec ``docs/superpowers/specs/2026-05-12-playlist-to-collection.md`` §6.3:
 * the collection detail page reuses the folder layered-fallback for
 * viewMode (hako ``2Q6UrppcejT4n0oYMEPbI``). The left-pane / RightPaneFile
 * "two-pane" experience is orthogonal — driven by the shared
 * ``useTreeEnabled`` toggle rather than this view mode — so this hook
 * only resolves between grid and list.
 */

const GLOBAL_KEY = "video-share-view-mode";
const PER_DRIVE_PREFIX = "collectionPrefs:";
const VALID_MODES: ViewMode[] = ["grid", "list"];

interface CollectionPrefsEntry {
  viewMode?: ViewMode;
}

type CollectionPrefs = Record<string, CollectionPrefsEntry>;

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VALID_MODES as string[]).includes(value);
}

function loadPrefs(drive: string): CollectionPrefs {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${PER_DRIVE_PREFIX}${drive}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed == null) return {};
    return parsed as CollectionPrefs;
  } catch {
    return {};
  }
}

function savePrefs(drive: string, prefs: CollectionPrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${PER_DRIVE_PREFIX}${drive}`, JSON.stringify(prefs));
  } catch {
    // localStorage quota — silently drop
  }
}

function loadGlobalDefault(): ViewMode | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(GLOBAL_KEY);
  return isViewMode(raw) ? raw : null;
}

/**
 * Map a single file to its ``FolderKind`` bucket. Mirrors the backend
 * ``dominant_kind`` classification used for folders so the layered
 * fallback semantics stay consistent across both surfaces.
 */
function fileToKind(file: FileItem): FolderKind {
  if (file.file_type === "video") return "video";
  if (file.file_type === "audio") return "audio";
  if (file.file_type === "image") return "image";
  if (file.mime_type === "application/pdf") return "pdf";
  if (
    file.file_type === "document" &&
    (file.mime_type === "text/markdown" ||
      file.filename.toLowerCase().endsWith(".md"))
  ) {
    return "markdown";
  }
  if (file.file_type === "document") return "document";
  return "other";
}

/**
 * Returns the majority kind iff it exceeds half the items. Anything
 * mixed falls through to ``null`` so the caller can defer to the
 * next layer in the fallback (global default, then grid).
 */
export function dominantCollectionKind(
  items: CollectionItemEntry[],
): FolderKind | null {
  if (items.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = fileToKind(item.file);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  let topKind: string | null = null;
  let topCount = 0;
  for (const [kind, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count;
      topKind = kind;
    }
  }
  if (topKind === null) return null;
  if (topCount > items.length / 2) return topKind as FolderKind;
  return null;
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
  collectionId: string;
  dominantKind: FolderKind | null;
}

export function resolveCollectionViewMode(opts: ResolveOpts): ViewMode {
  const { drive, collectionId, dominantKind } = opts;
  const prefs = loadPrefs(drive);
  const stored = prefs[collectionId]?.viewMode;
  if (isViewMode(stored)) return stored;
  const auto = autoDetectMode(dominantKind);
  if (auto) return auto;
  const global = loadGlobalDefault();
  if (global) return global;
  return "grid";
}

interface UseCollectionViewModeOpts {
  drive: string;
  collectionId: string;
  items: CollectionItemEntry[];
}

interface UseCollectionViewModeResult {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  dominantKind: FolderKind | null;
}

export function useCollectionViewMode({
  drive,
  collectionId,
  items,
}: UseCollectionViewModeOpts): UseCollectionViewModeResult {
  const dominantKind = useMemo(() => dominantCollectionKind(items), [items]);
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    resolveCollectionViewMode({ drive, collectionId, dominantKind }),
  );

  useEffect(() => {
    setViewModeState(
      resolveCollectionViewMode({ drive, collectionId, dominantKind }),
    );
  }, [drive, collectionId, dominantKind]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const prefs = loadPrefs(drive);
      const next: CollectionPrefs = {
        ...prefs,
        [collectionId]: { ...prefs[collectionId], viewMode: mode },
      };
      savePrefs(drive, next);
      setViewModeState(mode);
    },
    [drive, collectionId],
  );

  return { viewMode, setViewMode, dominantKind };
}
