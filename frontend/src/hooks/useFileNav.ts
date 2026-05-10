"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getFileNeighbors } from "@/lib/api";
import { dirtyRegistry } from "@/lib/dirtyRegistry";
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
  /** Invoked when the user presses ArrowLeft / ArrowRight. */
  onNavigate: (nextFileId: string) => void;
}

interface PendingNavigation {
  targetId: string;
}

interface UseFileNavResult {
  prevId: string | null;
  nextId: string | null;
  /**
   * Set when an arrow-key navigation is held back because the current
   * file has unsaved changes (per ``dirtyRegistry``). Hosts render a
   * confirm dialog while this is non-null and call
   * ``confirmPendingNavigation`` / ``cancelPendingNavigation`` based
   * on the user's choice. Cleared automatically when ``fileId``
   * changes (host navigated by some other means while the dialog
   * was open).
   */
  pendingNavigation: PendingNavigation | null;
  confirmPendingNavigation: () => void;
  cancelPendingNavigation: () => void;
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
 * (FileDetailFullScreen, PR-5) can share a single implementation.
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
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);

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

  // Drop any in-flight confirm dialog when the host swaps the file out
  // from under us (e.g. user clicked a tree row while the dialog was
  // open) — otherwise the next "confirm" would navigate to a stale
  // neighbor of a file the user has already left.
  useEffect(() => {
    setPendingNavigation(null);
  }, [fileId]);

  // Mirror the legacy gate: video / audio / .loft own ArrowLeft / Right
  // for seek; only non-media files claim them for prev/next navigation.
  const shortcutsEnabled =
    enabled &&
    !!neighbors &&
    fileType !== "video" &&
    fileType !== "audio" &&
    mimeType !== LOFT_MIME;

  // PR-4: dirtyRegistry guard. When the *current* file has any dirty
  // source, intercept arrow-key navigation and surface a confirm
  // dialog through ``pendingNavigation`` instead of firing
  // ``onNavigate`` directly. The textarea-focused case is already
  // covered by ``useShortcuts`` editingOnly skipping (hako
  // 4SThPZR947yX99rHoXJdB); this layer catches the
  // "textarea blurred + still dirty + arrow" hole.
  //
  // ``isDirty`` is read on demand rather than via ``subscribe``: the
  // hook only cares about the value at the moment the user presses an
  // arrow key, and skipping the subscription avoids re-rendering every
  // host whenever an unrelated comment / tag-chip publishes dirtiness.
  const requestNavigate = useCallback(
    (targetId: string) => {
      if (fileId && dirtyRegistry.isDirty(fileId)) {
        setPendingNavigation({ targetId });
        return;
      }
      onNavigate(targetId);
    },
    [fileId, onNavigate],
  );

  const navigatePrev = useCallback(() => {
    if (neighbors?.prev_id) requestNavigate(neighbors.prev_id);
  }, [neighbors, requestNavigate]);

  const navigateNext = useCallback(() => {
    if (neighbors?.next_id) requestNavigate(neighbors.next_id);
  }, [neighbors, requestNavigate]);

  const confirmPendingNavigation = useCallback(() => {
    if (!pendingNavigation) return;
    onNavigate(pendingNavigation.targetId);
    setPendingNavigation(null);
  }, [pendingNavigation, onNavigate]);

  const cancelPendingNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

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
    pendingNavigation,
    confirmPendingNavigation,
    cancelPendingNavigation,
  };
}
