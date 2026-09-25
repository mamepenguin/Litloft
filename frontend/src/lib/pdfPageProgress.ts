"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWatchProgress, saveWatchProgress } from "./api";
import { getSavedProgress, saveProgress } from "./recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

export const PDF_PAGE_SAVE_DELAY_MS = 1000;

export interface UsePdfPageProgressOptions {
  fileId: string;
  /** 1-based. */
  page: number;
  /** A page asked for in the URL (`?page=`). Outranks the stored page. */
  requestedPage?: number;
  goTo: (page: number) => void;
}

export interface UsePdfPageProgressResult {
  /**
   * Call from the document's load event. Until then `page` may still be the
   * previous file's, so nothing is read or written.
   */
  documentLoaded: (numPages: number) => void;
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
  page,
  requestedPage,
  goTo,
}: UsePdfPageProgressOptions): UsePdfPageProgressResult {
  const { nickname } = useProfile();

  const hasProfileRef = useRef(nickname !== null);
  hasProfileRef.current = nickname !== null;
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const pageRef = useRef(page);
  pageRef.current = page;
  const requestedPageRef = useRef(requestedPage);
  requestedPageRef.current = requestedPage;
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const loadedRef = useRef<{ fileId: string; numPages: number } | null>(null);
  // State, not a ref: a turn made while the read is pending is saved when
  // it ends.
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const restoring = restoringFile === fileId;
  const lastWrittenRef = useRef<number | null>(null);
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
    };
  }, [fileId, flush]);

  const documentLoaded = useCallback((numPages: number) => {
    const id = fileIdRef.current;
    if (loadedRef.current?.fileId === id) {
      loadedRef.current = { fileId: id, numPages };
      return;
    }
    loadedRef.current = { fileId: id, numPages };
    // The page the document opens on is not a turn, even once clamped.
    const openedOn = Math.min(Math.max(1, pageRef.current), numPages);
    lastWrittenRef.current = openedOn;
    if (isPage(requestedPageRef.current)) return;

    setRestoringFile(id);
    const read = hasProfileRef.current
      ? getWatchProgress(id).then((p) => p.position)
      : Promise.resolve(getSavedProgress(id));
    read
      .then((saved) => {
        if (fileIdRef.current !== id) return;
        if (isPage(requestedPageRef.current)) return;
        if (pageRef.current !== openedOn) return;
        if (!Number.isInteger(saved) || saved < 2 || saved >= numPages) return;
        lastWrittenRef.current = saved;
        goToRef.current(saved);
      })
      .catch(() => {
        // A page we cannot read leaves the reader where the document opened.
      })
      .finally(() => {
        setRestoringFile((current) => (current === id ? null : current));
      });
  }, []);

  useEffect(() => {
    const loaded = loadedRef.current;
    if (!loaded || loaded.fileId !== fileId) return;
    if (restoring) return;
    if (page < 2 || page > loaded.numPages) return;
    if (page === lastWrittenRef.current) return;
    lastWrittenRef.current = page;
    pendingRef.current = { fileId, page, numPages: loaded.numPages };
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) write(pending);
    }, PDF_PAGE_SAVE_DELAY_MS);
  }, [fileId, page, restoring, write]);

  return { documentLoaded };
}
