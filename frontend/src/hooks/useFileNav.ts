"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getFileNeighbors, getInboxNeighbors } from "@/lib/api";
import type { FileNavState } from "@/lib/fileNavContext";
import { playerKind } from "@/lib/playerKind";
import type { FileItem, Neighbors } from "@/types";
import { officeGridOwnsArrows } from "@/components/office/officeGridActive";
import { useShortcuts } from "./useShortcuts";

/**
 * Readers whose arrows belong to their pages, the way a player's belong to
 * seeking. The on-screen previous / next buttons still work for them.
 */
const PAGED_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/epub+zip",
]);

interface UseFileNavOpts {
  fileId: string | null;
  sort?: string;
  order?: string;
  /** `inbox` walks the drive's arrivals instead of the file's folder. */
  nav?: string;
  drive?: string | null;
  fileType?: FileItem["file_type"] | null;
  mimeType?: string | null;
  enabled?: boolean;
  countable?: boolean;
  /** A queue page's walk, which replaces `/neighbors` as the source. */
  queue?: FileNavState | null;
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
  nav,
  drive,
  fileType,
  mimeType,
  enabled = true,
  countable = true,
  queue = null,
  onNavigate,
}: UseFileNavOpts): UseFileNavResult {
  const tsc = useTranslations("shortcuts");
  const [neighbors, setNeighbors] = useState<Neighbors | null>(null);
  const inboxWalk = nav === "inbox";

  useEffect(() => {
    if (queue || !enabled || !fileId || (inboxWalk && !drive)) {
      setNeighbors(null);
      return;
    }
    let cancelled = false;
    setNeighbors(null);
    const request = inboxWalk
      ? getInboxNeighbors(drive!, fileId)
      : getFileNeighbors(fileId, sort, order);
    request
      .then((n) => {
        if (!cancelled) setNeighbors(n);
      })
      .catch(() => {
        if (!cancelled) setNeighbors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, sort, order, enabled, inboxWalk, drive, queue]);

  const shortcutsEnabled =
    (enabled || queue !== null) &&
    (queue !== null || neighbors !== null) &&
    playerKind({ mime_type: mimeType, file_type: fileType }) === null &&
    !PAGED_MIMES.has(mimeType ?? "");

  const folderPrev = useCallback(() => {
    if (neighbors?.prev_id) onNavigate(neighbors.prev_id);
  }, [neighbors, onNavigate]);

  const folderNext = useCallback(() => {
    if (neighbors?.next_id) onNavigate(neighbors.next_id);
  }, [neighbors, onNavigate]);

  const navigatePrev = queue ? queue.navigatePrev : folderPrev;
  const navigateNext = queue ? queue.navigateNext : folderNext;

  useShortcuts(
    "file-nav",
    tsc("fileBrowser"),
    [
      // The arrow keys stay out of the file while the grid owns them;
      // `navigatePrev` / `navigateNext` are left ungated so the visible
      // buttons still change file.
      {
        key: "arrowleft",
        label: tsc("prevFile"),
        handler: () => {
          if (!officeGridOwnsArrows()) navigatePrev();
        },
      },
      {
        key: "arrowright",
        label: tsc("nextFile"),
        handler: () => {
          if (!officeGridOwnsArrows()) navigateNext();
        },
      },
    ],
    shortcutsEnabled,
  );

  return {
    prevId: queue ? queue.prevId : (neighbors?.prev_id ?? null),
    nextId: queue ? queue.nextId : (neighbors?.next_id ?? null),
    position: queue
      ? queue.position
      : countable
        ? (neighbors?.position ?? null)
        : null,
    total: queue
      ? queue.total
      : countable
        ? (neighbors?.total ?? null)
        : null,
    // Handed out so a visible button and the arrow key run the same
    // code. Two call paths into "go to the next file" is how one of
    // them ends up skipping `navigationGuard` and losing an unsaved
    // edit.
    navigatePrev,
    navigateNext,
  };
}
