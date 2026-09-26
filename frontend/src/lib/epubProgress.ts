"use client";

import { useCallback, useEffect, useRef } from "react";
import { getWatchProgress, saveWatchProgress } from "./api";
import { getSavedPlayback, saveProgress } from "./recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

export const EPUB_SAVE_DELAY_MS = 1000;

interface PendingSave {
  fileId: string;
  position: number;
}

/**
 * A book's place is stored as a fraction of the whole in WatchHistory's
 * position, with a duration of 1. A book left on its last page is stored as
 * 1 and reopens at the start.
 */
function openingFraction(position: number, duration: number): number | null {
  if (duration !== 1) return null;
  if (!Number.isFinite(position) || position <= 0 || position >= 1) return null;
  return position;
}

export interface UseEpubProgressResult {
  readSaved: () => Promise<number | null>;
  /** Call only for a move the reader made. */
  turned: (fraction: number, atEnd: boolean) => void;
}

export function useEpubProgress(fileId: string): UseEpubProgressResult {
  const { nickname } = useProfile();
  const hasProfileRef = useRef(nickname !== null);
  hasProfileRef.current = nickname !== null;
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;

  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback((save: PendingSave) => {
    if (hasProfileRef.current) {
      saveWatchProgress(save.fileId, save.position, 1).catch(() => {
        // Fire-and-forget: a lost marker must not disturb reading.
      });
    } else {
      saveProgress(save.fileId, save.position, 1);
    }
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = useCallback(() => {
    cancel();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) write(pending);
  }, [cancel, write]);

  useEffect(() => flush, [fileId, flush]);

  const readSaved = useCallback(async () => {
    const id = fileIdRef.current;
    try {
      const saved = hasProfileRef.current
        ? await getWatchProgress(id)
        : getSavedPlayback(id);
      return openingFraction(saved.position, saved.duration);
    } catch {
      return null;
    }
  }, []);

  const turned = useCallback(
    (fraction: number, atEnd: boolean) => {
      cancel();
      if (!atEnd && fraction <= 0) {
        pendingRef.current = null;
        return;
      }
      pendingRef.current = { fileId: fileIdRef.current, position: atEnd ? 1 : fraction };
      timerRef.current = setTimeout(flush, EPUB_SAVE_DELAY_MS);
    },
    [cancel, flush],
  );

  return { readSaved, turned };
}
