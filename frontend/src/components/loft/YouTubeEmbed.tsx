"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  deleteWatchProgress,
  getWatchProgress,
  saveWatchProgress,
} from "@/lib/api";
import {
  clearProgress,
  getSavedProgress,
  saveProgress,
} from "@/lib/recentlyPlayed";
import {
  createYouTubeController,
  type MediaController,
  type YouTubePlayerLike,
} from "@/lib/mediaController";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useProfile } from "@/components/ProfileProvider";
import { loadYouTubeIframeApi } from "./loadYouTubeIframeApi";
import type { LoftEmbedProps } from "./types";

const SAVE_INTERVAL = 5;
const RESUME_THRESHOLD = 5;
const POLL_INTERVAL_MS = 1000;
const YT_STATE_ENDED = 0;

const YOUTUBE_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function extractYouTubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );
  return match?.[1] ?? null;
}

export default function YouTubeEmbed({
  fileId,
  url,
  onMediaController,
}: LoftEmbedProps) {
  const videoId = extractYouTubeId(url);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<
    (YouTubePlayerLike & { destroy(): void }) | null
  >(null);
  const controllerRef = useRef<MediaController | null>(null);
  const lastSavedRef = useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const tsc = useTranslations("shortcuts");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    setLoadFailed(false);
    lastSavedRef.current = 0;

    const persist = (current: number, duration: number) => {
      if (!Number.isFinite(current) || current <= 0) return;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (Math.abs(current - lastSavedRef.current) < SAVE_INTERVAL) return;
      lastSavedRef.current = current;
      if (hasProfile) {
        saveWatchProgress(fileId, current, duration).catch(() => {});
      } else {
        saveProgress(fileId, current);
      }
    };

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        const mount = mountRef.current;
        const wrapper = wrapperRef.current;
        if (!mount || !wrapper) return;
        const player = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            enablejsapi: 1,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: async ({ target }) => {
              if (cancelled) return;
              playerRef.current = target as YouTubePlayerLike & {
                destroy(): void;
              };
              const mc = createYouTubeController(target, wrapper);
              controllerRef.current = mc;
              onMediaController?.(mc);

              try {
                const saved = hasProfile
                  ? (await getWatchProgress(fileId)).position
                  : getSavedProgress(fileId);
                if (cancelled) return;
                const duration = target.getDuration();
                const upperOk =
                  !Number.isFinite(duration) ||
                  duration <= 0 ||
                  saved < duration - RESUME_THRESHOLD;
                if (saved > RESUME_THRESHOLD && upperOk) {
                  target.seekTo(saved, true);
                  lastSavedRef.current = saved;
                }
              } catch {
                // Fire-and-forget: don't block playback.
              }
              if (cancelled) return;

              pollHandle = setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                try {
                  persist(p.getCurrentTime(), p.getDuration());
                } catch {
                  // Player may be transitioning; skip this tick.
                }
              }, POLL_INTERVAL_MS);
            },
            onStateChange: ({ data }) => {
              if (cancelled) return;
              if (data === YT_STATE_ENDED) {
                lastSavedRef.current = 0;
                if (hasProfile) {
                  deleteWatchProgress(fileId).catch(() => {});
                } else {
                  clearProgress(fileId);
                }
              }
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      if (pollHandle) clearInterval(pollHandle);
      try {
        const p = playerRef.current;
        if (p) {
          const current = p.getCurrentTime();
          const duration = p.getDuration();
          if (
            Number.isFinite(current) &&
            current > 0 &&
            Number.isFinite(duration) &&
            duration > 0 &&
            Math.abs(current - lastSavedRef.current) >= 1
          ) {
            if (hasProfile) {
              saveWatchProgress(fileId, current, duration).catch(() => {});
            } else {
              saveProgress(fileId, current);
            }
          }
        }
      } catch {
        // Player may already be torn down.
      }
      onMediaController?.(null);
      controllerRef.current = null;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // Player may already be torn down by React unmount.
      }
      playerRef.current = null;
    };
  }, [fileId, videoId, hasProfile, onMediaController]);

  useShortcuts("loft-player", tsc("loftPlayer"), [
    { key: "space",      label: tsc("play"),          handler: () => controllerRef.current?.togglePlay() },
    { key: "arrowleft",  label: tsc("seekBack10"),     handler: () => { const mc = controllerRef.current; if (mc) mc.seek(mc.getCurrentTime() - 10); } },
    { key: "arrowright", label: tsc("seekForward10"),  handler: () => { const mc = controllerRef.current; if (mc) mc.seek(mc.getCurrentTime() + 10); } },
    { key: "arrowup",    label: tsc("seekForward60"),  handler: () => { const mc = controllerRef.current; if (mc) mc.seek(mc.getCurrentTime() + 60); } },
    { key: "arrowdown",  label: tsc("seekBack60"),     handler: () => { const mc = controllerRef.current; if (mc) mc.seek(mc.getCurrentTime() - 60); } },
    { key: "m",          label: tsc("mute"),           handler: () => controllerRef.current?.toggleMute() },
    { key: "f",          label: tsc("fullscreen"),     handler: () => controllerRef.current?.toggleFullscreen() },
  ]);

  if (!videoId || loadFailed) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      className="relative w-full overflow-hidden bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-accent md:rounded-xl [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:border-0"
      style={{ paddingTop: "56.25%" }}
    >
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
