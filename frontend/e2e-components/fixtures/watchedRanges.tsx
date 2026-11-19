/**
 * The real seek bar band and the real card bars, for the measurements jsdom
 * cannot make: boxes, offsets and painted colours.
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ContinueWatchingSection } from "@/components/ContinueWatchingSection";
import MediaControls from "@/components/player/MediaControls";
import { ProfileProvider } from "@/components/ProfileProvider";
import { VideoCard } from "@/components/videoapp/VideoCard";
import type { ShelfItem } from "@/lib/api";
import { createNativeVideoController, type MediaController } from "@/lib/mediaController";
import { usePlaybackProgress } from "@/lib/playbackProgress";
import type { WatchHistoryItem } from "@/types";

export const CARD_RANGES = [
  { start: 0, end: 15 },
  { start: 25, end: 30 },
  { start: 95, end: 100 },
];
export const CARD_PROGRESS = { position: 40, duration: 100 };

function file(id: string): Record<string, unknown> {
  return {
    id,
    filename: `${id}.mp4`,
    title: id,
    description: "",
    drive: "fixture",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 100,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
    watch_progress: CARD_PROGRESS,
  };
}

function withRanges(id: string, ranges: typeof CARD_RANGES): Record<string, unknown> {
  return { ...file(id), watched_ranges: ranges };
}

/** `data-case`: `file-ranges`, `file-today`, `video-ranges`, `video-today`. */
export function WatchedRangeCardsArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ClipboardProvider>
        <div id="watched-range-cards" className="grid w-[360px] gap-6 bg-bg-primary p-4">
          <div data-case="file-ranges">
            <ContinueWatchingSection
              items={[withRanges("file-ranges", CARD_RANGES) as unknown as WatchHistoryItem]}
              loading={false}
            />
          </div>
          <div data-case="file-today">
            <ContinueWatchingSection
              items={[withRanges("file-today", []) as unknown as WatchHistoryItem]}
              loading={false}
            />
          </div>
          <div data-case="video-ranges">
            <VideoCard item={withRanges("video-ranges", CARD_RANGES) as unknown as ShelfItem} />
          </div>
          <div data-case="video-today">
            <VideoCard item={withRanges("video-today", []) as unknown as ShelfItem} />
          </div>
        </div>
      </ClipboardProvider>
    </NextIntlClientProvider>
  );
}

function BandHost({ mc }: { mc: MediaController | null }): null {
  usePlaybackProgress({ mc, fileId: "e2e-band" });
  return null;
}

/** A real `<video>` with the real controls and the shared progress hook. */
export function WatchedBandArrangement(): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mc, setMc] = useState<MediaController | null>(null);

  useEffect(() => {
    if (videoRef.current) setMc(createNativeVideoController(videoRef.current));
  }, []);

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {/* The video stays outside the provider: it renders a different tree
          once it has read the cookie, which would remount the element the
          controller was built on. */}
      <ProfileProvider>
        <BandHost mc={mc} />
      </ProfileProvider>
      <div
        ref={frameRef}
        id="player-frame"
        className="relative aspect-video w-full overflow-hidden bg-black"
      >
        <video
          ref={videoRef}
          id="watched-band-video"
          src="./media/tone.wav"
          className="absolute inset-0 h-full w-full"
          muted
          playsInline
          preload="auto"
        />
        <MediaControls mc={mc} frameRef={frameRef} />
      </div>
    </NextIntlClientProvider>
  );
}
