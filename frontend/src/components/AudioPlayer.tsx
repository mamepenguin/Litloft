"use client";

import { useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { FileItem } from "@/types";
import { FileTypeIcon } from "./FileTypeIcon";
import { getStreamUrl, saveWatchProgress, getWatchProgress, deleteWatchProgress } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { addRecentlyPlayed, getSavedProgress, saveProgress, clearProgress } from "@/lib/recentlyPlayed";
import { useProfile } from "./ProfileProvider";

const SAVE_INTERVAL = 5;
const RESUME_THRESHOLD = 3;

export function AudioPlayer({ file, onEnded, autoPlay }: { file: FileItem; onEnded?: () => void; autoPlay?: boolean }) {
  const t = useTranslations("player");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSavedRef = useRef(0);

  const handleLoadedMetadata = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    addRecentlyPlayed(file.id);

    if (hasProfile) {
      try {
        const progress = await getWatchProgress(file.id);
        if (progress.position > RESUME_THRESHOLD && progress.position < audio.duration - RESUME_THRESHOLD) {
          audio.currentTime = progress.position;
        }
      } catch {
        // Fire-and-forget
      }
    } else {
      const saved = getSavedProgress(file.id);
      if (saved > RESUME_THRESHOLD && saved < audio.duration - RESUME_THRESHOLD) {
        audio.currentTime = saved;
      }
    }
  }, [file.id, hasProfile]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const current = audio.currentTime;
    if (Math.abs(current - lastSavedRef.current) >= SAVE_INTERVAL) {
      lastSavedRef.current = current;
      if (hasProfile) {
        saveWatchProgress(file.id, current, audio.duration).catch(() => {});
      } else {
        saveProgress(file.id, current);
      }
    }
  }, [file.id, hasProfile]);

  const handleEnded = useCallback(() => {
    if (hasProfile) {
      deleteWatchProgress(file.id).catch(() => {});
    } else {
      clearProgress(file.id);
    }
    onEnded?.();
  }, [file.id, onEnded, hasProfile]);

  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-12">
      <FileTypeIcon fileType="audio" size={64} className="mb-4 text-text-muted" />
      <p className="mb-1 text-sm text-text-primary">{file.filename}</p>
      <p className="mb-6 text-xs text-text-muted">{formatFileSize(file.file_size)}</p>
      <audio
        ref={audioRef}
        src={getStreamUrl(file.id)}
        controls
        autoPlay={autoPlay}
        preload="metadata"
        className="w-full max-w-md"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      >
        {t("audioNotSupported")}
      </audio>
    </div>
  );
}
