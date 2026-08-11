"use client";

import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef, type Ref } from "react";
import { useTranslations } from "next-intl";
import type { SubtitleInfo } from "@/types";
import { getStreamUrl, getSubtitleUrl, getThumbnailUrl } from "@/lib/api";
import { readAutoplayPreference } from "@/lib/autoplay";
import { setupBackgroundPiP } from "@/lib/backgroundPiP";
import { setupMediaSession } from "@/lib/mediaSession";
import {
  createNativeVideoController,
  type MediaController,
} from "@/lib/mediaController";
import { usePlaybackProgress } from "@/lib/playbackProgress";
import { AutoplayToggle } from "./AutoplayToggle";
import { useShortcuts } from "@/hooks/useShortcuts";

export const VideoPlayer = forwardRef(function VideoPlayer({ videoId, subtitles = [], onEnded, autoPlay, initialTime, title, subtitleText, onMediaController }: { videoId: string; subtitles?: SubtitleInfo[]; onEnded?: () => void; autoPlay?: boolean; initialTime?: number; title?: string; subtitleText?: string; onMediaController?: (mc: MediaController | null) => void }, ref: Ref<HTMLVideoElement>) {
  const t = useTranslations("player");
  const videoRef = useRef<HTMLVideoElement>(null);
  // One controller for the life of this element, held in state so the
  // hooks below re-run when it appears. Building a fresh one per call
  // — as the shortcut handlers used to — would hand the playback clock
  // a different key every time and defeat its per-controller sharing.
  const [mc, setMc] = useState<MediaController | null>(null);

  useImperativeHandle(ref, () => videoRef.current!, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const controller = createNativeVideoController(video);
    setMc(controller);
    onMediaController?.(controller);
    return () => {
      setMc(null);
      onMediaController?.(null);
    };
  }, [videoId, onMediaController]);

  const { notifyEnded, notifyReady } = usePlaybackProgress({
    mc,
    fileId: videoId,
    initialTime,
  });

  const handleLoadedMetadata = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    // Await the resume decision before starting playback, or autoplay
    // begins at zero and the restored position lands a moment later —
    // which the viewer sees and hears as the video starting over.
    await notifyReady();
    if (autoPlay || readAutoplayPreference()) {
      video.play().catch(() => {});
    }
  }, [autoPlay, notifyReady]);

  // Reaching the end records the final position instead of erasing the
  // history row. The row is what makes "completed" distinguishable from
  // "never started", and the continue-watching query drops it anyway
  // through its 90% gate — deleting it here threw that state away.
  // Spec: 2026-08-10-media-import-watch-surface.md §4.2.
  const handleEnded = useCallback(() => {
    notifyEnded();
    onEnded?.();
  }, [notifyEnded, onEnded]);

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

  const tShortcuts = useTranslations("shortcuts");

  useShortcuts("video-player", tShortcuts("videoPlayer"), [
    {
      key: "space",
      label: tShortcuts("play"),
      handler: () => mc?.togglePlay(),
    },
    {
      key: "arrowleft",
      label: tShortcuts("seekBack10"),
      handler: () => mc?.seek(mc.getCurrentTime() - 10),
    },
    {
      key: "arrowright",
      label: tShortcuts("seekForward10"),
      handler: () => mc?.seek(mc.getCurrentTime() + 10),
    },
    {
      key: "arrowup",
      label: tShortcuts("seekForward60"),
      handler: () => mc?.seek(mc.getCurrentTime() + 60),
    },
    {
      key: "arrowdown",
      label: tShortcuts("seekBack60"),
      handler: () => mc?.seek(mc.getCurrentTime() - 60),
    },
    {
      key: "m",
      label: tShortcuts("mute"),
      handler: () => mc?.toggleMute(),
    },
    {
      key: "f",
      label: tShortcuts("fullscreen"),
      handler: () => mc?.toggleFullscreen(),
    },
  ]);

  return (
    <div className="group/player relative aspect-video w-full overflow-hidden bg-black md:rounded-xl">
      <video
        ref={videoRef}
        src={getStreamUrl(videoId)}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onLoadedMetadata={handleLoadedMetadata}
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
