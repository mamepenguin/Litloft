"use client";

import { useCallback, useEffect, useRef } from "react";
import { getWatchProgress, saveWatchProgress } from "./api";
import { getSavedProgress, saveProgress } from "./recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

export const PDF_PAGE_SAVE_DELAY_MS = 1000;

export interface UsePdfPageProgressOptions {
  fileId: string;
  /** A page asked for in the URL (`?page=`). Outranks the stored page. */
  requestedPage?: number;
  goTo: (page: number) => void;
}

export interface UsePdfPageProgressResult {
  /** Call from the document's load event. */
  documentLoaded: (numPages: number) => void;
  /**
   * Call only when the reader moves the page. Pages set any other way —
   * a restore, a clamp, `?page=`, a spread regrouping — are not what the
   * reader chose, and are never saved.
   */
  pageTurned: (page: number) => void;
}

interface PendingSave {
  fileId: string;
  page: number;
  numPages: number;
}

function isPage(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

/**
 * Stores the page in WatchHistory's position and the page count in its
 * duration, so the continue-watching gate and progress bars read a PDF the
 * same way as a video. Page 1 is never written: opening a two-page PDF would
 * otherwise record it as half read.
 */
export function usePdfPageProgress({
  fileId,
  requestedPage,
  goTo,
}: UsePdfPageProgressOptions): UsePdfPageProgressResult {
  const { nickname } = useProfile();

  const hasProfileRef = useRef(nickname !== null);
  hasProfileRef.current = nickname !== null;
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const requestedPageRef = useRef(requestedPage);
  requestedPageRef.current = requestedPage;
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const loadedRef = useRef<{ fileId: string; numPages: number } | null>(null);
  /** The read in flight; replacing or clearing it abandons that read. */
  const restoreRef = useRef<object | null>(null);
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback((save: PendingSave) => {
    if (hasProfileRef.current) {
      saveWatchProgress(save.fileId, save.page, save.numPages).catch(() => {
        // Fire-and-forget: a lost marker must not disturb reading.
      });
    } else {
      saveProgress(save.fileId, save.page, save.numPages);
    }
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) write(pending);
  }, [write]);

  useEffect(() => {
    return () => {
      flush();
      loadedRef.current = null;
      restoreRef.current = null;
    };
  }, [fileId, flush]);

  const documentLoaded = useCallback((numPages: number) => {
    const id = fileIdRef.current;
    if (loadedRef.current?.fileId === id) {
      loadedRef.current = { fileId: id, numPages };
      return;
    }
    loadedRef.current = { fileId: id, numPages };
    if (isPage(requestedPageRef.current)) return;

    const restore = {};
    restoreRef.current = restore;
    const read = hasProfileRef.current
      ? getWatchProgress(id).then((p) => p.position)
      : Promise.resolve(getSavedProgress(id));
    read
      .then((saved) => {
        if (restoreRef.current !== restore) return;
        restoreRef.current = null;
        if (isPage(requestedPageRef.current)) return;
        if (!Number.isInteger(saved) || saved < 2 || saved >= numPages) return;
        goToRef.current(saved);
      })
      .catch(() => {
        if (restoreRef.current === restore) restoreRef.current = null;
      });
  }, []);

  const pageTurned = useCallback(
    (page: number) => {
      const loaded = loadedRef.current;
      if (!loaded) return;
      restoreRef.current = null;
      if (!Number.isInteger(page) || page < 2 || page > loaded.numPages) return;
      pendingRef.current = {
        fileId: loaded.fileId,
        page,
        numPages: loaded.numPages,
      };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) write(pending);
      }, PDF_PAGE_SAVE_DELAY_MS);
    },
    [write],
  );

  return { documentLoaded, pageTurned };
}
