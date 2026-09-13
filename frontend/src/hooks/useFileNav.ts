"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getFileNeighbors } from "@/lib/api";
import { playerKind } from "@/lib/playerKind";
import type { FileItem, Neighbors } from "@/types";
import { useShortcuts } from "./useShortcuts";

interface UseFileNavOpts {
  fileId: string | null;
  sort?: string;
  order?: string;
  fileType?: FileItem["file_type"] | null;
  mimeType?: string | null;
  enabled?: boolean;
  countable?: boolean;
  onNavigate: (nextFileId: string) => void;
}

interface UseFileNavResult {
  prevId: string | null;
  nextId: string | null;
  /**
   * Both come straight from `/neighbors`, which counts them over exactly
   * the rows `prevId` / `nextId` can reach — so a visible `n / N` and the
   * buttons beside it cannot disagree.
   */
  position: number | null;
  total: number | null;
  navigatePrev: () => void;
  navigateNext: () => void;
}

export function useFileNav({
  fileId,
  sort,
  order,
  fileType,
  mimeType,
  enabled = true,
  countable = true,
  onNavigate,
}: UseFileNavOpts): UseFileNavResult {
  const tsc = useTranslations("shortcuts");
  const [neighbors, setNeighbors] = useState<Neighbors | null>(null);

  useEffect(() => {
    if (!enabled || !fileId) {
      setNeighbors(null);
      return;
    }
    let cancelled = false;
    setNeighbors(null);
    getFileNeighbors(fileId, sort, order)
      .then((n) => {
        if (!cancelled) setNeighbors(n);
      })
      .catch(() => {
        if (!cancelled) setNeighbors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, sort, order, enabled]);

  // video / audio / .loft own ArrowLeft / Right for seek; only non-media
  // files claim them for prev/next navigation.
  const shortcutsEnabled =
    enabled &&
    !!neighbors &&
    playerKind({ mime_type: mimeType, file_type: fileType }) === null;

  const navigatePrev = useCallback(() => {
    if (neighbors?.prev_id) onNavigate(neighbors.prev_id);
  }, [neighbors, onNavigate]);

  const navigateNext = useCallback(() => {
    if (neighbors?.next_id) onNavigate(neighbors.next_id);
  }, [neighbors, onNavigate]);

  useShortcuts(
    "file-nav",
    tsc("fileBrowser"),
    [
      { key: "arrowleft", label: tsc("prevFile"), handler: navigatePrev },
      { key: "arrowright", label: tsc("nextFile"), handler: navigateNext },
    ],
    shortcutsEnabled,
  );

  return {
    prevId: neighbors?.prev_id ?? null,
    nextId: neighbors?.next_id ?? null,
    position: countable ? (neighbors?.position ?? null) : null,
    total: countable ? (neighbors?.total ?? null) : null,
    // Handed out so a visible button and the arrow key run the same
    // code. Two call paths into "go to the next file" is how one of
    // them ends up skipping `navigationGuard` and losing an unsaved
    // edit.
    navigatePrev,
    navigateNext,
  };
}
