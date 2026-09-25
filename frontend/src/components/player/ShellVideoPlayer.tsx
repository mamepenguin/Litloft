"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { PictureInPicture2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useShellCaptions, type ShellCaptions } from "@/hooks/useShellCaptions";
import { useShellMedia } from "@/hooks/useShellMedia";
import { useShellSurface } from "@/hooks/useShellSurface";
import { useAutoplayPreference } from "@/lib/autoplay";
import type { MediaController } from "@/lib/mediaController";
import { useMediaClock } from "@/lib/mediaClock";
import type { MediaChannel } from "@/lib/nativeMedia";
import { usePlaybackProgress } from "@/lib/playbackProgress";
import { cuesAt } from "@/lib/vtt";
import type { SubtitleInfo } from "@/types";
import MediaControls from "./MediaControls";
import { SettingToggle } from "./MediaControls/parts/SettingToggle";
import { useFullscreen } from "./hooks/useFullscreen";
import { useVideoShortcuts } from "./hooks/useVideoShortcuts";
import { NativeAutoplayToggle, SubtitleTrackOptions } from "./NativeSettingsRows";

export interface ShellVideoPlayerProps {
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

function PictureInPictureRow({ channel }: { channel: MediaChannel }) {
  const t = useTranslations("player");
  const [state, setState] = useState(() => channel.read());

  useEffect(() => {
    const update = () => setState(channel.read());
    update();
    channel.onPictureInPictureChange = update;
    return () => {
      if (channel.onPictureInPictureChange === update) channel.onPictureInPictureChange = null;
    };
  }, [channel]);

  if (!state.pipPossible && !state.pip) return null;
  return (
    <SettingToggle label={t("pictureInPicture")} checked={state.pip} onChange={(next) => channel.setPip(next)}>
      <PictureInPicture2 size={18} aria-hidden="true" />
    </SettingToggle>
  );
}

function CaptionLines({ mc, captions }: { mc: MediaController | null; captions: ShellCaptions }) {
  const { currentTime } = useMediaClock(mc);
  const showing = cuesAt(captions.cues, currentTime);
  if (showing.length === 0) return null;
  return (
    <div
      aria-live="off"
      className="pointer-events-none absolute inset-x-0 bottom-[12%] z-10 flex flex-col items-center gap-1 px-4 text-center"
    >
      {showing.map((cue) => (
        <p
          key={`${cue.start}-${cue.text}`}
          className="whitespace-pre-line rounded-md bg-black/70 px-2 py-0.5 text-base leading-snug text-white"
        >
          {cue.text}
        </p>
      ))}
    </div>
  );
}

function Controls({
  mc,
  channel,
  captions,
  frameRef,
  duration,
  fullscreenToggleRef,
  onPseudoFullscreenChange,
}: {
  mc: MediaController | null;
  channel: MediaChannel | null;
  captions: ShellCaptions;
  frameRef: RefObject<HTMLDivElement | null>;
  duration?: number | null;
  fullscreenToggleRef: MutableRefObject<(() => void) | null>;
  onPseudoFullscreenChange: (active: boolean) => void;
}) {
  const [boosting, setBoosting] = useState(false);
  const { paused } = useMediaClock(mc);
  const fullscreen = useFullscreen({
    frameRef,
    autoRotateEnabled: !paused,
    suppressSwipe: boosting,
    // The picture is a native layer over the page: it would trail the frame
    // and ignore its clip, over a page the shell has hidden.
    animate: false,
  });

  useEffect(() => {
    fullscreenToggleRef.current = fullscreen.toggle;
    return () => {
      if (fullscreenToggleRef.current === fullscreen.toggle) fullscreenToggleRef.current = null;
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
      settingsToggles={
        <>
          {channel && <PictureInPictureRow channel={channel} />}
          <NativeAutoplayToggle />
        </>
      }
      settingsExtra={
        captions.tracks.length > 1 ? (
          <SubtitleTrackOptions options={captions.tracks} selected={captions.selected} onSelect={captions.select} />
        ) : null
      }
    />
  );
}

/**
 * The video player inside the iOS shell. The shell plays the file and shows the
 * picture behind the page, where this draws an empty frame; the controls,
 * captions and progress saving stay the page's own.
 */
export function ShellVideoPlayer({
  videoId,
  subtitles = [],
  onEnded,
  autoPlay,
  initialTime,
  duration,
  title,
  subtitleText,
  onMediaController,
}: ShellVideoPlayerProps) {
  const t = useTranslations("player");
  const frameRef = useRef<HTMLDivElement>(null);
  const fullscreenToggleRef = useRef<(() => void) | null>(null);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [preferAutoplay] = useAutoplayPreference();

  const endedRef = useRef<(() => void) | undefined>(undefined);
  const readyRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const shell = useShellMedia(
    { id: videoId, kind: "video", title: title ?? "", artist: subtitleText ?? "" },
    {
      autoPlay: Boolean(autoPlay) || preferAutoplay,
      onEnded: () => endedRef.current?.(),
      onReady: () => readyRef.current?.() ?? Promise.resolve(),
    },
  );

  const captions = useShellCaptions(videoId, subtitles);
  const captionsRef = useRef(captions);
  captionsRef.current = captions;

  // Built once per file: the playback clock keys its sharing on the controller.
  const shellMc = shell.mc;
  const mc = useMemo<MediaController | null>(
    () =>
      shellMc && {
        ...shellMc,
        toggleFullscreen: () => fullscreenToggleRef.current?.(),
        getCaptions: () => captionsRef.current.get(),
        setCaptions: (enabled) => captionsRef.current.set(enabled),
      },
    [shellMc],
  );

  useEffect(() => {
    onMediaController?.(mc);
    return () => onMediaController?.(null);
  }, [mc, onMediaController]);

  const { notifyEnded, notifyReady } = usePlaybackProgress({ mc, fileId: videoId, initialTime });
  endedRef.current = () => {
    notifyEnded();
    onEnded?.();
  };
  readyRef.current = notifyReady;

  useShellSurface(frameRef, shell.channel);
  useVideoShortcuts(mc, fullscreenToggleRef);

  const handlePseudoFullscreen = useCallback((active: boolean) => setPseudoFullscreen(active), []);

  return (
    <div className="w-full">
      <div
        ref={frameRef}
        data-testid="player-frame"
        tabIndex={0}
        className={[
          "overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          pseudoFullscreen ? "fixed inset-0 z-50 rounded-none" : "relative aspect-video w-full md:rounded-xl",
        ].join(" ")}
      >
        <CaptionLines mc={mc} captions={captions} />
        {(shell.failed || shell.waiting) && (
          <p
            role={shell.failed ? "alert" : "status"}
            className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-sm text-white"
          >
            {shell.failed ? t("loadFailed") : t("buffering")}
          </p>
        )}
        <Controls
          mc={mc}
          channel={shell.channel}
          captions={captions}
          frameRef={frameRef}
          duration={duration}
          fullscreenToggleRef={fullscreenToggleRef}
          onPseudoFullscreenChange={handlePseudoFullscreen}
        />
      </div>
    </div>
  );
}
