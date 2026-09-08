"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { FileItem } from "@/types";
import { FileTypeIcon } from "./FileTypeIcon";
import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import { useAutoplayPreference } from "@/lib/autoplay";
import { setupMediaSession } from "@/lib/mediaSession";
import {
  createNativeVideoController,
  type MediaController,
} from "@/lib/mediaController";
import { usePlaybackProgress } from "@/lib/playbackProgress";
import { CastButton } from "./CastButton";
import { AutoplayToggle } from "./AutoplayToggle";

export function AudioPlayer({ file, onEnded, autoPlay, onMediaController }: { file: FileItem; onEnded?: () => void; autoPlay?: boolean; onMediaController?: (mc: MediaController | null) => void }) {
  const t = useTranslations("player");
  const [preferAutoplay] = useAutoplayPreference();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mc, setMc] = useState<MediaController | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // HTMLAudioElement extends HTMLMediaElement just like
    // HTMLVideoElement, so the native controller's currentTime / play /
    // pause / muted shape is identical. requestFullscreen on audio is a
    // no-op in browsers, which is acceptable: F is a video-only
    // affordance and the shortcuts intentionally don't gate on type.
    const controller = createNativeVideoController(
      audio as unknown as HTMLVideoElement,
    );
    setMc(controller);
    onMediaController?.(controller);
    return () => {
      setMc(null);
      onMediaController?.(null);
    };
  }, [file.id, onMediaController]);

  const { notifyEnded, notifyReady } = usePlaybackProgress({
    mc,
    fileId: file.id,
  });

  const handleLoadedMetadata = useCallback(() => {
    void notifyReady();
  }, [notifyReady]);

  // Records the final position rather than deleting the row — see the
  // matching comment in VideoPlayer and spec
  // 2026-08-10-media-import-watch-surface.md §4.2.
  const handleEnded = useCallback(() => {
    notifyEnded();
    onEnded?.();
  }, [notifyEnded, onEnded]);

  useEffect(() => {
    if (!mc) return;
    return setupMediaSession(
      mc,
      {
        title: file.title || file.filename,
        artist: file.folder_path || file.drive,
        artwork: [{ src: getThumbnailUrl(file.id) }],
      },
      { onNextTrack: onEnded },
    );
  }, [mc, file.id, file.title, file.filename, file.folder_path, file.drive, onEnded]);

  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-12">
      <FileTypeIcon fileType="audio" size={64} className="mb-4 text-text-muted" />
      {/* The filename and nothing under it. This is a name with its
          first fact beneath it, so `lib/primaryMeta.ts` governs it, and
          for audio that table says `none`: the length is on the
          transport bar of the `<audio controls>` right below, and the
          size on a `.loft` reference is the pointer's. Audio is the
          only kind that reaches this player (`lib/playerKind.ts`), so
          the rule has one answer here and it is drawn by drawing
          nothing rather than by a branch that can never be taken. */}
      <p className="mb-6 text-sm text-text-primary">{file.filename}</p>
      <audio
        ref={audioRef}
        src={getStreamUrl(file.id)}
        controls
        autoPlay={autoPlay || preferAutoplay}
        preload="metadata"
        className="w-full max-w-md"
        onLoadedMetadata={handleLoadedMetadata}
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
