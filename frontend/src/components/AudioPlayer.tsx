"use client";

import { useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { FileItem } from "@/types";
import { FileTypeIcon } from "./FileTypeIcon";
import { getStreamUrl, getThumbnailUrl, saveWatchProgress, getWatchProgress } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { getSavedProgress, saveProgress } from "@/lib/recentlyPlayed";
import { useAutoplayPreference } from "@/lib/autoplay";
import { setupMediaSession } from "@/lib/mediaSession";
import { useProfile } from "./ProfileProvider";
import { CastButton } from "./CastButton";
import { AutoplayToggle } from "./AutoplayToggle";

const SAVE_INTERVAL = 5;
const RESUME_THRESHOLD = 3;

export function AudioPlayer({ file, onEnded, autoPlay }: { file: FileItem; onEnded?: () => void; autoPlay?: boolean }) {
  const t = useTranslations("player");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const [preferAutoplay] = useAutoplayPreference();
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSavedRef = useRef(0);

  const handleLoadedMetadata = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
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
        saveProgress(file.id, current, audio.duration);
      }
    }
  }, [file.id, hasProfile]);

  // Records the final position rather than deleting the row — see the
  // matching comment in VideoPlayer and spec
  // 2026-08-10-media-import-watch-surface.md §4.2.
  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    const duration = audio?.duration;
    if (audio && Number.isFinite(duration) && (duration ?? 0) > 0) {
      const position = audio.currentTime > 0 ? audio.currentTime : duration!;
      lastSavedRef.current = position;
      if (hasProfile) {
        saveWatchProgress(file.id, position, duration!).catch(() => {});
      } else {
        saveProgress(file.id, position, duration!);
      }
    }
    onEnded?.();
  }, [file.id, onEnded, hasProfile]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    return setupMediaSession(
      audio,
      {
        title: file.title || file.filename,
        artist: file.folder_path || file.drive,
        artwork: [{ src: getThumbnailUrl(file.id) }],
      },
      { onNextTrack: onEnded },
    );
  }, [file.id, file.title, file.filename, file.folder_path, file.drive, onEnded]);

  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-12">
      <FileTypeIcon fileType="audio" size={64} className="mb-4 text-text-muted" />
      <p className="mb-1 text-sm text-text-primary">{file.filename}</p>
      <p className="mb-6 text-xs text-text-muted">{formatFileSize(file.file_size)}</p>
      <audio
        ref={audioRef}
        src={getStreamUrl(file.id)}
        controls
        autoPlay={autoPlay || preferAutoplay}
        preload="metadata"
        className="w-full max-w-md"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      >
        {t("audioNotSupported")}
      </audio>
      <div className="mt-3 flex items-center gap-3">
        <CastButton mediaRef={audioRef} />
        <AutoplayToggle />
      </div>
    </div>
  );
}
