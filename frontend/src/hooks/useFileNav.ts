"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getFileNeighbors } from "@/lib/api";
import type { FileItem, Neighbors } from "@/types";
import { useShortcuts } from "./useShortcuts";

interface UseFileNavOpts {
  fileId: string | null;
  sort?: string;
  order?: string;
  /**
   * The current file's ``file_type`` and ``mime_type``. Used to decide
   * whether ArrowLeft/ArrowRight should drive prev/next file
   * navigation: video/audio players and the .loft (YouTube/Vimeo)
   * iframe own those keys for seek/scrub. The hook fetches neighbors
   * regardless so the host can render disabled prev/next buttons,
   * but the keyboard shortcut layer is gated.
   */
  fileType?: FileItem["file_type"] | null;
  mimeType?: string | null;
  /**
   * Caller-supplied gate. When ``false`` the hook does not fetch
   * neighbors and does not register the keyboard shortcuts (e.g. the
   * playlist-mode host disables it because navigation is owned by
   * PlaylistPanel instead).
   */
  enabled?: boolean;
  /**
   * Invoked when the user presses ArrowLeft / ArrowRight. Hosts wire
   * this to ``selectFile(id)`` (2-pane) or
   * ``router.replace(/files/{id})`` (fullscreen). Both call sites
   * funnel through ``navigationGuard`` (PR-5), so the dirty-editor
   * confirm dialog fires before navigation happens — this hook does
   * not need its own guard.
   */
  onNavigate: (nextFileId: string) => void;
}

interface UseFileNavResult {
  prevId: string | null;
  nextId: string | null;
}

const LOFT_MIME = "application/vnd.litloft.loft+json";

/**
 * File navigation hook for hosts that show a single file at a time
 * and want ArrowLeft/ArrowRight to walk to the prev/next sibling
 * file in the current sort order.
 *
 * Replaces the inline arrow-key handler that the legacy
 * ``/files/[id]/page.tsx`` carried, so both the 2-pane right pane
 * (RightPaneFile) and the playlist-exception fullscreen route
 * (FileDetailFullScreen) can share a single implementation.
 *
 * Hosts pass ``onNavigate`` to decide what "navigate" means in their
 * URL model — e.g. ``selectFile(id)`` in 2-pane vs.
 * ``router.replace(/files/{id})`` in fullscreen — so the hook stays
 * surface-agnostic.
 */
export function useFileNav({
  fileId,
  sort,
  order,
  fileType,
  mimeType,
  enabled = true,
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

  // Mirror the legacy gate: video / audio / .loft own ArrowLeft / Right
  // for seek; only non-media files claim them for prev/next navigation.
  const shortcutsEnabled =
    enabled &&
    !!neighbors &&
    fileType !== "video" &&
    fileType !== "audio" &&
    mimeType !== LOFT_MIME;

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
  };
}
