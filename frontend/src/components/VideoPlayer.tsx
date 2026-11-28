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
import MediaControls from "./player/MediaControls";
import { FindOutlineLayer } from "./player/FindOutlineLayer";
import { useFullscreen } from "./player/hooks/useFullscreen";
import {
  GENERATED_CAPTION_TRACK_KEY,
  useCaptionTrackSelection,
} from "./player/hooks/useCaptionTrackSelection";
import { useReassertCaptions } from "./player/hooks/useReassertCaptions";
import { useVideoShortcuts } from "./player/hooks/useVideoShortcuts";
import { ShellVideoPlayer } from "./player/ShellVideoPlayer";
import { isNativeShell } from "@/lib/nativeBridge";
import { useQueuePage } from "./queue/QueuePageContext";
import {
  NativeToggleButtons,
  SubtitleTrackPicker,
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
  posterUrl?: string;
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
  useReassertCaptions(video, mc);
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

  const handleUseBrowserControls = () => {
    fullscreen.exit();
    onUseBrowserControls();
  };

  return (
    <MediaControls
      mc={mc}
      frameRef={frameRef}
      durationHint={duration}
      fullscreen={fullscreen}
      isPseudoFullscreen={fullscreen.isPseudo}
      interactive
      onBoostingChange={setBoosting}
      settingsToggles={
        <NativeToggleButtons
          video={video}
          browserControls={false}
          onBrowserControlsChange={handleUseBrowserControls}
        />
      }
      settingsExtra={<SubtitleTrackPicker video={video} />}
    />
  );
}

const BrowserVideoPlayer = forwardRef(function BrowserVideoPlayer(
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
    posterUrl,
  }: VideoPlayerProps,
  ref: Ref<HTMLVideoElement>,
) {
  const t = useTranslations("player");
  const queuePage = useQueuePage();
  const frameRef = useRef<HTMLDivElement>(null);
  const fullscreenToggleRef = useRef<(() => void) | null>(null);
  const [playerUi, setPlayerUi] = useNativePlayerUiPreference();
  const [playing, setPlaying] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  // One controller for the life of this element, held in state so the
  // hooks below re-run when it appears. Building a fresh one per call
  // would hand the playback clock a different key every time and defeat
  // its per-controller sharing.
  const [mc, setMc] = useState<MediaController | null>(null);
  const captionTrackKey = useCaptionTrackSelection(videoElement, subtitles);

  const handleUseBrowserControls = useCallback(() => {
    setPseudoFullscreen(false);
    setPlayerUi("browser");
  }, [setPlayerUi]);

  useImperativeHandle(ref, () => videoElement!, [videoElement]);

  useEffect(() => {
    if (!videoElement) return;
    const controller = createNativeVideoController(videoElement);
    setMc(controller);
    onMediaController?.(controller);
    return () => {
      setMc(null);
      onMediaController?.(null);
    };
  }, [videoElement, videoId, onMediaController]);

  const { notifyEnded, notifyReady } = usePlaybackProgress({
    mc,
    fileId: videoId,
    initialTime,
  });

  const handleLoadedMetadata = useCallback(async () => {
    if (!videoElement) return;
    // Await the resume decision before starting playback, or autoplay
    // begins at zero and the restored position lands a moment later —
    // which the viewer sees and hears as the video starting over.
    await notifyReady();
    if (autoPlay || readAutoplayPreference()) {
      videoElement.play().catch(() => {});
    }
  }, [autoPlay, notifyReady, videoElement]);

  // Reaching the end records the final position instead of erasing the
  // history row. The row is what makes "completed" distinguishable from
  // "never started".
  const handleEnded = useCallback(() => {
    setPlaying(false);
    notifyEnded();
    onEnded?.();
  }, [notifyEnded, onEnded]);

  useEffect(() => {
    if (!videoElement) return;
    videoElement.setAttribute("autoPictureInPicture", "");
    return setupBackgroundPiP(videoElement);
  }, [videoElement]);

  const queueNext = queuePage?.onEnded;
  const queuePrevious = queuePage?.previousTrack;
  useEffect(() => {
    if (!mc || !title) return;
    return setupMediaSession(
      mc,
      {
        title,
        artist: subtitleText ?? "",
        artwork: [{ src: getThumbnailUrl(videoId) }],
      },
      queueNext && queuePrevious
        ? { onNextTrack: queueNext, onPreviousTrack: queuePrevious }
        : { onNextTrack: onEnded },
    );
  }, [
    mc,
    videoId,
    title,
    subtitleText,
    onEnded,
    queueNext,
    queuePrevious,
  ]);

  useVideoShortcuts(mc, fullscreenToggleRef);

  return (
    <div className="w-full">
      <div
        ref={frameRef}
        data-testid="player-frame"
        tabIndex={0}
        className={[
          "overflow-hidden bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          pseudoFullscreen
            ? "fixed inset-0 z-50 rounded-none"
            : "relative aspect-video w-full md:rounded-xl",
        ].join(" ")}
      >
        <video
          ref={setVideoElement}
          src={getStreamUrl(videoId)}
          poster={posterUrl}
          controls={playerUi === "browser"}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onWaiting={(event) =>
            setPlaying(!event.currentTarget.paused && !event.currentTarget.ended)
          }
        >
          {subtitles.map((sub) => {
            const key = sub.filename ?? String(sub.index);
            return (
              <track
                key={key}
                src={`${getSubtitleUrl(videoId, sub.index)}?v=${encodeURIComponent(sub.version ?? "")}`}
                kind="subtitles"
                srcLang={sub.language || "und"}
                label={sub.label || t("subtitleDefault")}
                default={key === captionTrackKey}
              />
            );
          })}
          {subtitles.length === 0 && (
            <track
              key={GENERATED_CAPTION_TRACK_KEY}
              src={`/api/addons/intelligence/files/${videoId}/subtitles.vtt`}
              kind="subtitles"
              srcLang="und"
              label={t("subtitleAuto")}
              default
            />
          )}
          {t("videoNotSupported")}
        </video>

        <FindOutlineLayer video={videoElement} controller={mc} />

        {playerUi === "litloft" && (
          <LitloftVideoControls
            mc={mc}
            frameRef={frameRef}
            video={videoElement}
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

/**
 * Inside the iOS shell the shell plays the video, so there is no element to
 * hand back through `ref`.
 */
export const VideoPlayer = forwardRef(function VideoPlayer(
  props: VideoPlayerProps,
  ref: Ref<HTMLVideoElement>,
) {
  if (isNativeShell()) return <ShellVideoPlayer {...props} />;
  return <BrowserVideoPlayer {...props} ref={ref} />;
});
