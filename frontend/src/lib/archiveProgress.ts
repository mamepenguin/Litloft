"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWatchProgress, saveWatchProgress } from "./api";
import { getSavedPlayback, saveProgress } from "./recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";
import { getDirname } from "@/components/archive/archiveUtils";
import type { ArchiveEntry } from "@/types";

export const ARCHIVE_POSITION_SAVE_DELAY_MS = 1000;

export interface ArchiveResume {
  position: number;
  total: number;
}

/**
 * The archive read as one sequence of images: folders in path order, and each
 * folder's images in the order the image viewer flips through them. The
 * listing's sort and type filter are deliberately absent.
 */
export function archiveImageSequence(entries: ArchiveEntry[]): ArchiveEntry[] {
  const byFolder = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) {
    if (entry.is_dir || entry.file_type !== "image") continue;
    const folder = getDirname(entry.path);
    const images = byFolder.get(folder);
    if (images) images.push(entry);
    else byFolder.set(folder, [entry]);
  }

  return [...byFolder.keys()]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((folder) =>
      byFolder
        .get(folder)!
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path)),
    );
}

export function archiveOrdinal(
  sequence: ArchiveEntry[],
  path: string,
): number {
  const index = sequence.findIndex((entry) => entry.path === path);
  return index === -1 ? 0 : index + 1;
}

interface PendingSave {
  fileId: string;
  position: number;
  total: number;
  byProfile: boolean;
}

interface StoredPosition {
  source: string;
  position: number;
  duration: number;
}

interface VisitPosition {
  source: string;
  position: number;
  total: number;
}

export interface UseArchiveProgressOptions {
  fileId: string;
  /** Number of images in the archive; null until the index has loaded. */
  imageCount: number | null;
}

export interface UseArchiveProgressResult {
  /** The image Resume should open, or null when the button must be hidden. */
  resume: ArchiveResume | null;
  /** Call with the 1-based ordinal of the image the viewer shows. */
  imageShown: (position: number) => void;
  flush: () => void;
}

export function useArchiveProgress({
  fileId,
  imageCount,
}: UseArchiveProgressOptions): UseArchiveProgressResult {
  const { nickname } = useProfile();
  const hasProfileRef = useRef(nickname !== null);
  hasProfileRef.current = nickname !== null;

  const source = `${fileId}\u0000${nickname ?? ""}`;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const imageCountRef = useRef(imageCount);
  imageCountRef.current = imageCount;

  const [stored, setStored] = useState<StoredPosition | null>(null);
  const [visit, setVisit] = useState<VisitPosition | null>(null);

  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRef = useRef(false);
  const readRef = useRef<object | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const write = useCallback((save: PendingSave) => {
    if (save.byProfile) {
      saveWatchProgress(save.fileId, save.position, save.total).catch(() => {
        // Fire-and-forget: a lost marker must not disturb reading.
      });
    } else {
      saveProgress(save.fileId, save.position, save.total);
    }
  }, []);

  const flush = useCallback(() => {
    cancel();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) write(pending);
  }, [cancel, write]);

  useEffect(() => {
    return () => {
      flush();
      readRef.current = null;
    };
  }, [flush]);

  // The stored position and the visit's own save belong to one file under one
  // profile; anything read for another source is dropped rather than shown
  // under the new one.
  useEffect(() => {
    flush();
    cancel();
    pendingRef.current = null;
    readRef.current = null;
    shownRef.current = false;
    setStored(null);
    setVisit(null);
  }, [source, flush, cancel]);

  useEffect(() => {
    if (imageCount === null) return;
    const token = {};
    readRef.current = token;
    const read = hasProfileRef.current
      ? getWatchProgress(fileId)
      : Promise.resolve(getSavedPlayback(fileId));
    read
      .then((saved) => {
        if (readRef.current !== token) return;
        readRef.current = null;
        // A save made during this visit outranks the stored value, even when
        // the read was issued first.
        if (shownRef.current) return;
        setStored({
          source,
          position: saved.position,
          duration: saved.duration,
        });
      })
      .catch(() => {
        if (readRef.current !== token) return;
        readRef.current = null;
      });
  }, [fileId, source, imageCount]);

  const imageShown = useCallback(
    (position: number) => {
      const total = imageCountRef.current;
      if (total === null) return;
      if (!Number.isInteger(position) || position < 2) return;

      setVisit({ source: sourceRef.current, position, total });
      pendingRef.current = {
        fileId: fileIdRef.current,
        position,
        total,
        byProfile: hasProfileRef.current,
      };

      shownRef.current = true;

      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) write(pending);
      }, ARCHIVE_POSITION_SAVE_DELAY_MS);
    },
    [cancel, write],
  );

  const currentVisit = visit?.source === source ? visit : null;
  const currentStored =
    stored?.source === source && stored.duration === imageCount ? stored : null;

  let resume: ArchiveResume | null = null;
  if (
    imageCount !== null &&
    currentVisit !== null &&
    currentVisit.total === imageCount &&
    currentVisit.position >= 2 &&
    currentVisit.position < imageCount
  ) {
    resume = { position: currentVisit.position, total: imageCount };
  } else if (
    imageCount !== null &&
    currentStored !== null &&
    currentStored.position >= 2 &&
    currentStored.position < imageCount
  ) {
    resume = { position: currentStored.position, total: imageCount };
  }

  return { resume, imageShown, flush };
}
