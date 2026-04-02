"use client";

import { useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { SubtitleInfo } from "@/types";
import { getStreamUrl, getSubtitleUrl, saveWatchProgress, getWatchProgress, deleteWatchProgress } from "@/lib/api";
import { addRecentlyPlayed, getSavedProgress, saveProgress, clearProgress } from "@/lib/recentlyPlayed";
import { useProfile } from "./ProfileProvider";

const SAVE_INTERVAL = 5;
const RESUME_THRESHOLD = 5;

export function VideoPlayer({ videoId, subtitles = [], onEnded, autoPlay }: { videoId: string; subtitles?: SubtitleInfo[]; onEnded?: () => void; autoPlay?: boolean }) {
  const t = useTranslations("player");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedRef = useRef(0);

  const handleLoadedMetadata = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    addRecentlyPlayed(videoId);

    if (hasProfile) {
      try {
        const progress = await getWatchProgress(videoId);
        if (progress.position > RESUME_THRESHOLD && progress.position < video.duration - RESUME_THRESHOLD) {
          video.currentTime = progress.position;
        }
      } catch {
        // Fire-and-forget: don't block playback
      }
    } else {
      const saved = getSavedProgress(videoId);
      if (saved > RESUME_THRESHOLD && saved < video.duration - RESUME_THRESHOLD) {
        video.currentTime = saved;
      }
    }

    const isPC = !("ontouchstart" in window);
    if (isPC || autoPlay) {
      video.play().catch(() => {});
    }
  }, [videoId, autoPlay, hasProfile]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    if (Math.abs(current - lastSavedRef.current) >= SAVE_INTERVAL) {
      lastSavedRef.current = current;
      if (hasProfile) {
        saveWatchProgress(videoId, current, video.duration).catch(() => {});
      } else {
        saveProgress(videoId, current);
      }
    }
  }, [videoId, hasProfile]);

  const handleEnded = useCallback(() => {
    if (hasProfile) {
      deleteWatchProgress(videoId).catch(() => {});
    } else {
      clearProgress(videoId);
    }
    onEnded?.();
  }, [videoId, onEnded, hasProfile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
          break;
        case "ArrowUp":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 60);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 60);
          break;
        case " ":
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
        case "m":
        case "M":
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            video.requestFullscreen();
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const video = videoRef.current;
      if (video && video.currentTime > 0) {
        if (hasProfile) {
          saveWatchProgress(videoId, video.currentTime, video.duration).catch(() => {});
        } else {
          saveProgress(videoId, video.currentTime);
        }
      }
    };
  }, [videoId, hasProfile]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        src={getStreamUrl(videoId)}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      >
        {subtitles.map((sub, i) => (
          <track
            key={sub.index}
            src={getSubtitleUrl(videoId, sub.index)}
            kind="subtitles"
            srcLang={sub.language || "und"}
            label={sub.label || t("subtitleDefault")}
            default={i === 0}
          />
        ))}
        {t("videoNotSupported")}
      </video>
    </div>
  );
}
