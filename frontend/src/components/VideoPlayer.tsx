"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
  type RefObject,
} from "react";
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
import { useNativePlayerUiPreference } from "@/lib/nativePlayerUi";
import { useShortcuts } from "@/hooks/useShortcuts";
import MediaControls from "./player/MediaControls";
import { useFullscreen } from "./player/hooks/useFullscreen";
import {
  NativePlayerUiToggle,
  NativeSettingsRows,
} from "./player/NativeSettingsRows";

interface VideoPlayerProps {
  videoId: string;
  subtitles?: SubtitleInfo[];
  onEnded?: () => void;
  autoPlay?: boolean;
  initialTime?: number;
  duration?: number | null;
  title?: string;
  subtitleText?: string;
  onMediaController?: (mc: MediaController | null) => void;
}

interface LitloftVideoControlsProps {
  mc: MediaController | null;
  frameRef: RefObject<HTMLDivElement | null>;
  video: HTMLVideoElement | null;
  duration?: number | null;
  playing: boolean;
  fullscreenToggleRef: MutableRefObject<(() => void) | null>;
  onPseudoFullscreenChange: (active: boolean) => void;
  onUseBrowserControls: () => void;
}

function LitloftVideoControls({
  mc,
  frameRef,
  video,
  duration,
  playing,
  fullscreenToggleRef,
  onPseudoFullscreenChange,
  onUseBrowserControls,
}: LitloftVideoControlsProps) {
  const [boosting, setBoosting] = useState(false);
  const fullscreen = useFullscreen({
    frameRef,
    autoRotateEnabled: playing,
    suppressSwipe: boosting,
  });

  useEffect(() => {
    fullscreenToggleRef.current = fullscreen.toggle;
    return () => {
      if (fullscreenToggleRef.current === fullscreen.toggle) {
        fullscreenToggleRef.current = null;
      }
    };
  }, [fullscreen.toggle, fullscreenToggleRef]);

  useEffect(() => {
    onPseudoFullscreenChange(fullscreen.isPseudo);
  }, [fullscreen.isPseudo, onPseudoFullscreenChange]);

  return (
    <MediaControls
      mc={mc}
      frameRef={frameRef}
      durationHint={duration}
      fullscreen={fullscreen}
      isPseudoFullscreen={fullscreen.isPseudo}
      interactive
      onBoostingChange={setBoosting}
      settingsExtra={
        <>
          <NativeSettingsRows video={video} />
          <NativePlayerUiToggle
            ui="litloft"
            onChange={onUseBrowserControls}
          />
        </>
      }
    />
  );
}

export const VideoPlayer = forwardRef(function VideoPlayer(
  {
    videoId,
    subtitles = [],
    onEnded,
    autoPlay,
    initialTime,
    duration,
    title,
    subtitleText,
    onMediaController,
  }: VideoPlayerProps,
  ref: Ref<HTMLVideoElement>,
) {
  const t = useTranslations("player");
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const fullscreenToggleRef = useRef<(() => void) | null>(null);
  const [playerUi, setPlayerUi] = useNativePlayerUiPreference();
  const [playing, setPlaying] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  // One controller for the life of this element, held in state so the
  // hooks below re-run when it appears. Building a fresh one per call
  // — as the shortcut handlers used to — would hand the playback clock
  // a different key every time and defeat its per-controller sharing.
  const [mc, setMc] = useState<MediaController | null>(null);

  const handleUseBrowserControls = useCallback(() => {
    setPseudoFullscreen(false);
    setPlayerUi("browser");
  }, [setPlayerUi]);

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
    setPlaying(false);
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
    if (!mc || !title) return;
    return setupMediaSession(
      mc,
      {
        title,
        artist: subtitleText ?? "",
        artwork: [{ src: getThumbnailUrl(videoId) }],
      },
      { onNextTrack: onEnded },
    );
  }, [mc, videoId, title, subtitleText, onEnded]);

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
      handler: () => fullscreenToggleRef.current?.(),
    },
  ]);

  return (
    <div className="w-full">
      <div
        ref={frameRef}
        data-testid="player-frame"
        tabIndex={0}
        className={[
          "group/player overflow-hidden bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          pseudoFullscreen
            ? "fixed inset-0 z-50 rounded-none"
            : "relative aspect-video w-full md:rounded-xl",
        ].join(" ")}
      >
        <video
          ref={videoRef}
          src={getStreamUrl(videoId)}
          controls={playerUi === "browser"}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onWaiting={() => setPlaying(true)}
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

        {playerUi === "litloft" && (
          <LitloftVideoControls
            mc={mc}
            frameRef={frameRef}
            video={videoRef.current}
            duration={duration}
            playing={playing}
            fullscreenToggleRef={fullscreenToggleRef}
            onPseudoFullscreenChange={setPseudoFullscreen}
            onUseBrowserControls={handleUseBrowserControls}
          />
        )}
      </div>

      {playerUi === "browser" && (
        <div className="mt-2 px-1">
          <button
            type="button"
            className="rounded-2xl text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={() => setPlayerUi("litloft")}
          >
            {t("useLitloftControls")}
          </button>
        </div>
      )}
    </div>
  );
});
