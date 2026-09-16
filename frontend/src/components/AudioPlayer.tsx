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
import { AudioTransport } from "./player/AudioTransport";
import { useShellAudio } from "@/hooks/useShellAudio";
import { isNativeShell } from "@/lib/nativeBridge";

export function AudioPlayer({ file, onEnded, autoPlay, onMediaController }: { file: FileItem; onEnded?: () => void; autoPlay?: boolean; onMediaController?: (mc: MediaController | null) => void }) {
  const t = useTranslations("player");
  const [preferAutoplay] = useAutoplayPreference();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [elementMc, setElementMc] = useState<MediaController | null>(null);

  // The shell plays it natively, so no element is rendered and none of the
  // element wiring below runs.
  const native = isNativeShell();
  // The handler needs the controller this call produces, so it arrives through
  // a ref rather than the two being defined in a circle.
  const endedRef = useRef<(() => void) | undefined>(undefined);
  const readyRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const shellMc = useShellAudio(file, {
    autoPlay: autoPlay || preferAutoplay,
    onEnded: () => endedRef.current?.(),
    onReady: () => readyRef.current?.() ?? Promise.resolve(),
  });
  const mc = native ? shellMc : elementMc;

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
    setElementMc(controller);
    return () => setElementMc(null);
  }, [file.id]);

  useEffect(() => {
    onMediaController?.(mc);
    return () => onMediaController?.(null);
  }, [mc, onMediaController]);

  const { notifyEnded, notifyReady } = usePlaybackProgress({
    mc,
    fileId: file.id,
  });

  const handleLoadedMetadata = useCallback(() => {
    void notifyReady();
  }, [notifyReady]);

  // Records the final position rather than deleting the row.
  const handleEnded = useCallback(() => {
    notifyEnded();
    onEnded?.();
  }, [notifyEnded, onEnded]);
  endedRef.current = handleEnded;
  readyRef.current = notifyReady;

  // In the shell the lock screen is the shell's, and two owners would fight
  // over it.
  useEffect(() => {
    if (!mc || native) return;
    return setupMediaSession(
      mc,
      {
        title: file.title || file.filename,
        artist: file.folder_path || file.drive,
        artwork: [{ src: getThumbnailUrl(file.id) }],
      },
      { onNextTrack: onEnded },
    );
  }, [mc, native, file.id, file.title, file.filename, file.folder_path, file.drive, onEnded]);

  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-12">
      <FileTypeIcon fileType="audio" size={64} className="mb-4 text-text-muted" />
      {/* The filename and nothing under it: the length is on the
          transport bar of the `<audio controls>` right below, and the
          size on a `.loft` reference is the pointer's. */}
      <p className="mb-6 text-sm text-text-primary">{file.filename}</p>
      {native ? (
        <AudioTransport mc={mc} />
      ) : (
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
      )}
      <div className="mt-3 flex items-center gap-3">
        {/* AirPlay is the shell's own, through AVPlayer. */}
        {!native && <CastButton mediaRef={audioRef} />}
        <AutoplayToggle />
      </div>
    </div>
  );
}
