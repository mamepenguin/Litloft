"use client";

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, type Ref } from "react";
import { useTranslations } from "next-intl";
import type { SubtitleInfo } from "@/types";
import { getStreamUrl, getSubtitleUrl, getThumbnailUrl, saveWatchProgress, getWatchProgress, deleteWatchProgress } from "@/lib/api";
import { addRecentlyPlayed, getSavedProgress, saveProgress, clearProgress } from "@/lib/recentlyPlayed";
import { readAutoplayPreference } from "@/lib/autoplay";
import { setupBackgroundPiP } from "@/lib/backgroundPiP";
import { setupMediaSession } from "@/lib/mediaSession";
import { createNativeVideoController, handleMediaShortcut } from "@/lib/mediaController";
import { AutoplayToggle } from "./AutoplayToggle";
import { useProfile } from "./ProfileProvider";

const SAVE_INTERVAL = 5;
const RESUME_THRESHOLD = 5;

export const VideoPlayer = forwardRef(function VideoPlayer({ videoId, subtitles = [], onEnded, autoPlay, initialTime, title, subtitleText }: { videoId: string; subtitles?: SubtitleInfo[]; onEnded?: () => void; autoPlay?: boolean; initialTime?: number; title?: string; subtitleText?: string }, ref: Ref<HTMLVideoElement>) {
  const t = useTranslations("player");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedRef = useRef(0);

  useImperativeHandle(ref, () => videoRef.current!, []);

  const handleLoadedMetadata = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    addRecentlyPlayed(videoId);

    if (initialTime != null && initialTime > 0) {
      video.currentTime = Math.min(initialTime, video.duration);
    } else if (hasProfile) {
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

    if (autoPlay || readAutoplayPreference()) {
      video.play().catch(() => {});
    }
  }, [videoId, autoPlay, hasProfile, initialTime]);

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
    const video = videoRef.current;
    if (!video) return;
    video.setAttribute("autoPictureInPicture", "");
    return setupBackgroundPiP(video);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !title) return;
    return setupMediaSession(
      video,
      {
        title,
        artist: subtitleText ?? "",
        artwork: [{ src: getThumbnailUrl(videoId) }],
      },
      { onNextTrack: onEnded },
    );
  }, [videoId, title, subtitleText, onEnded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      const mc = createNativeVideoController(video);
      handleMediaShortcut(e, mc);
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
    <div className="group/player relative aspect-video w-full overflow-hidden rounded-xl bg-black">
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
        {subtitles.length === 0 && (
          <track
            key="intelligence-auto"
            src={`/api/addons/intelligence/files/${videoId}/subtitles.vtt`}
            kind="subtitles"
            srcLang="und"
            label={t("subtitleAuto")}
            default
          />
        )}
        {t("videoNotSupported")}
      </video>
      <div className="pointer-events-none absolute right-2 top-2 opacity-40 transition-opacity duration-200 md:opacity-0 md:group-hover/player:opacity-100 md:focus-within:opacity-100">
        <div className="pointer-events-auto">
          <AutoplayToggle />
        </div>
      </div>
    </div>
  );
});
