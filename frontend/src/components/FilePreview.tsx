"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { useTranslations } from "next-intl";
import type { FileItem } from "@/types";
import { VideoPlayer } from "./VideoPlayer";
import { AudioPlayer } from "./AudioPlayer";
import { TextPreview, isTextPreviewable } from "./TextPreview";
import { MarkdownFileViewer } from "./MarkdownPreview";
import { ArchivePreview } from "./ArchivePreview";
import { FileTypeIcon } from "./FileTypeIcon";
import { AddonSlot } from "./AddonSlot";
import { MiniPlayerContainer } from "./MiniPlayerContainer";
import { formatFileSize } from "@/lib/format";
import { getStreamUrl } from "@/lib/api";
import {
  createNativeVideoController,
  type MediaController,
} from "@/lib/mediaController";

interface FilePreviewProps {
  file: FileItem;
  onEnded?: () => void;
  autoPlay?: boolean;
  videoRef?: Ref<HTMLVideoElement>;
  initialTime?: number;
  /**
   * Notified whenever the active media controller changes.
   *  - native video / audio: controller bound to the underlying media
   *    element on mount, null on unmount.
   *  - LoftRef (YouTube): the addon-supplied controller is forwarded
   *    here once the YouTube IFrame Player is ready.
   *  - non-media file types: never invoked.
   *
   * Stable identity is the caller's responsibility (use a setState
   * setter or a useCallback).
   */
  onMediaController?: (mc: MediaController | null) => void;
}

/**
 * Wrap AudioPlayer so its `<audio>` element bubbles up as a
 * MediaController. AudioPlayer doesn't expose its internal ref, so we
 * scope a wrapper div, find the audio child after mount, and publish a
 * native controller. citation jump (intelligence addon) needs this
 * because audio files have transcripts too.
 */
function NativeAudioWithController({
  file,
  onEnded,
  autoPlay,
  onMediaController,
}: {
  file: FileItem;
  onEnded?: () => void;
  autoPlay?: boolean;
  onMediaController?: (mc: MediaController | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onMediaController) return;
    const audio = wrapRef.current?.querySelector("audio");
    if (!audio) return;
    // HTMLAudioElement extends HTMLMediaElement just like
    // HTMLVideoElement, so the native controller's currentTime / play
    // / pause / muted shape is identical. requestFullscreen on audio
    // is a no-op in browsers — that's acceptable, as F is a video-only
    // affordance and our shortcuts intentionally don't gate on type.
    onMediaController(
      createNativeVideoController(audio as unknown as HTMLVideoElement),
    );
    return () => onMediaController(null);
  }, [file.id, onMediaController]);

  return (
    <div ref={wrapRef}>
      <AudioPlayer file={file} onEnded={onEnded} autoPlay={autoPlay} />
    </div>
  );
}

/**
 * Helper that forwards both the legacy `<video>` ref and the new
 * `MediaController` upward when a native VideoPlayer is mounted.
 * Extracted so the FilePreview render tree stays declarative and the
 * cleanup (null on unmount) lives in a single place.
 */
function NativeVideoWithController({
  file,
  onEnded,
  autoPlay,
  initialTime,
  videoRef,
  onMediaController,
}: {
  file: FileItem;
  onEnded?: () => void;
  autoPlay?: boolean;
  initialTime?: number;
  videoRef?: Ref<HTMLVideoElement>;
  onMediaController?: (mc: MediaController | null) => void;
}) {
  const internalRef = useRef<HTMLVideoElement>(null);
  // Mirror the inner ref out to the parent's videoRef (back-compat).
  useImperativeHandle(videoRef, () => internalRef.current!, []);

  useEffect(() => {
    if (!onMediaController) return;
    const video = internalRef.current;
    if (!video) return;
    onMediaController(createNativeVideoController(video));
    return () => onMediaController(null);
    // file.id is the stable identity that determines whether the
    // underlying media element / controller is still the same one.
  }, [file.id, onMediaController]);

  return (
    <VideoPlayer
      ref={internalRef}
      videoId={file.id}
      subtitles={file.subtitles}
      onEnded={onEnded}
      autoPlay={autoPlay}
      initialTime={initialTime}
      title={file.title || file.filename}
      subtitleText={file.folder_path || file.drive}
    />
  );
}

export function FilePreview({
  file,
  onEnded,
  autoPlay,
  videoRef,
  initialTime,
  onMediaController,
}: FilePreviewProps) {
  const t = useTranslations("file");
  // Mirror the published MediaController locally so MiniPlayerContainer
  // can react to play/pause without requiring every caller of
  // FilePreview to thread the controller back down. The relay still
  // forwards to the parent's `onMediaController` so nothing above
  // loses the handle.
  const [localMc, setLocalMc] = useState<MediaController | null>(null);
  const relayMc = useCallback(
    (mc: MediaController | null) => {
      setLocalMc(mc);
      onMediaController?.(mc);
    },
    [onMediaController],
  );

  if (file.file_type === "video") {
    return (
      <MiniPlayerContainer mc={localMc}>
        <NativeVideoWithController
          file={file}
          onEnded={onEnded}
          autoPlay={autoPlay}
          initialTime={initialTime}
          videoRef={videoRef}
          onMediaController={relayMc}
        />
      </MiniPlayerContainer>
    );
  }

  if (file.file_type === "image") {
    return (
      <div className="flex w-full items-center justify-center overflow-hidden rounded-xl bg-bg-card">
        <img
          src={getStreamUrl(file.id)}
          alt={file.title}
          className="max-h-[70vh] w-auto object-contain"
        />
      </div>
    );
  }

  if (file.file_type === "audio") {
    return (
      <NativeAudioWithController
        file={file}
        onEnded={onEnded}
        autoPlay={autoPlay}
        onMediaController={onMediaController}
      />
    );
  }

  if (file.mime_type === "application/vnd.litloft.loft+json") {
    // LoftRef delegates the actual player UI to the downloader addon.
    // Forward the controller setter so the addon can publish its
    // YouTube-backed MediaController upward (citation jump + keyboard
    // shortcuts go through the same MediaController plumbing as the
    // native VideoPlayer above). Wrapped in MiniPlayerContainer so
    // the embedded YouTube iframe also reflows into a floating mini
    // window when it scrolls out of view.
    return (
      <MiniPlayerContainer mc={localMc}>
        <AddonSlot
          id="hvlink-player"
          props={{ fileId: file.id, file, onMediaController: relayMc }}
        />
      </MiniPlayerContainer>
    );
  }

  if (file.mime_type === "text/markdown") {
    return <MarkdownFileViewer fileId={file.id} />;
  }

  if (file.mime_type === "application/pdf") {
    return (
      <div className="w-full overflow-hidden rounded-xl bg-bg-card">
        <iframe
          src={getStreamUrl(file.id)}
          title={file.title}
          className="h-[80vh] w-full border-0"
        />
      </div>
    );
  }

  if (file.file_type === "archive") {
    return <ArchivePreview fileId={file.id} />;
  }

  if (isTextPreviewable(file.mime_type)) {
    return <TextPreview fileId={file.id} fileSize={file.file_size} />;
  }

  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
      <FileTypeIcon fileType={file.file_type} size={64} className="mb-4 text-text-muted" />
      <p className="text-sm text-text-muted">{file.filename}</p>
      <p className="mt-1 text-xs text-text-muted">{formatFileSize(file.file_size)}</p>
      <p className="mt-4 text-xs text-text-muted">{t("noPreview")}</p>
    </div>
  );
}
