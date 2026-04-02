"use client";

import { useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { getStreamUrl } from "@/lib/api";
import { addRecentlyPlayed, getSavedProgress, saveProgress, clearProgress } from "@/lib/recentlyPlayed";

const SAVE_INTERVAL = 5;
const RESUME_THRESHOLD = 5;

export function VideoPlayer({ videoId, onEnded, autoPlay }: { videoId: string; onEnded?: () => void; autoPlay?: boolean }) {
  const t = useTranslations("player");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedRef = useRef(0);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    addRecentlyPlayed(videoId);
    const saved = getSavedProgress(videoId);
    if (saved > RESUME_THRESHOLD && saved < video.duration - RESUME_THRESHOLD) {
      video.currentTime = saved;
    }
    const isPC = !("ontouchstart" in window);
    if (isPC || autoPlay) {
      video.play().catch(() => {});
    }
  }, [videoId, autoPlay]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    if (Math.abs(current - lastSavedRef.current) >= SAVE_INTERVAL) {
      lastSavedRef.current = current;
      saveProgress(videoId, current);
    }
  }, [videoId]);

  const handleEnded = useCallback(() => {
    clearProgress(videoId);
    onEnded?.();
  }, [videoId, onEnded]);

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
        saveProgress(videoId, video.currentTime);
      }
    };
  }, [videoId]);

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
        {t("videoNotSupported")}
      </video>
    </div>
  );
}
