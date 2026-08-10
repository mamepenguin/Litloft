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
import { HtmlPreview } from "./HtmlPreview";
import { PdfPreview } from "./PdfPreview";
import { ArchivePreview } from "./ArchivePreview";
import { FileTypeIcon } from "./FileTypeIcon";
import { AddonSlot } from "./AddonSlot";
import LoftPlayer from "./loft/LoftPlayer";
import { MiniPlayerContainer } from "./MiniPlayerContainer";
import { formatFileSize } from "@/lib/format";
import { getStreamUrl } from "@/lib/api";
import {
  createNativeVideoController,
  type MediaController,
} from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";

interface FilePreviewProps {
  file: FileItem;
  onEnded?: () => void;
  autoPlay?: boolean;
  videoRef?: Ref<HTMLVideoElement>;
  initialTime?: number;
  /**
   * PDF: when set, the embedded viewer opens at this page
   * (PDF.js / Chromium / Firefox all honour `#page=N` in the iframe
   * URL fragment). Ignored for non-PDF files.
   */
  initialPage?: number;
  /**
   * Text / Markdown: a passage to scroll into view and visually
   * highlight after the previewer mounts. Used by the intelligence Ask
   * citation cards so clicking a citation lands the user on the cited
   * sentence rather than the top of the file. Ignored for media files
   * (those have precise t / page locators instead).
   */
  highlight?: string;
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
  onDocumentCaptureController?: (
    controller: DocumentCaptureController | null,
  ) => void;
  /**
   * ``.md`` only: bump to force the Properties Panel source to
   * refetch (keeps frontmatter display in sync when the outer
   * ``File.tags`` chip row saves).
   */
  markdownReloadKey?: number;
  /**
   * ``.md`` only: fires after a Properties Panel chip save lands,
   * so the parent can refetch the outer chip row and refresh the
   * sidebar tag list.
   */
  onMarkdownTagsSaved?: (tags: string[]) => void;
  /**
   * IntersectionObserver root for the wrapping ``MiniPlayerContainer``.
   * When the player lives inside a host whose own ``overflow-y: auto``
   * handles scrolling (the 2-pane right pane) the host must pass its
   * scroll container here; document-scroll hosts can omit it. Forwarded
   * down to ``MiniPlayerContainer`` for video / .loft players; ignored
   * for image / audio / text previews that have no mini player.
   */
  miniPlayerRoot?: Element | null;
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
  initialPage,
  highlight,
  onMediaController,
  onDocumentCaptureController,
  markdownReloadKey,
  onMarkdownTagsSaved,
  miniPlayerRoot,
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

  // .loft must be checked BEFORE the file_type branches: filetype
  // classification reports .loft as ``video`` (so search file_type
  // filters include it), but playback has to go through the iframe
  // provider registry — a native <video> can't load a YouTube URL.
  if (file.mime_type === "application/vnd.litloft.loft+json") {
    // Core renders the .loft player via the provider/player registry
    // (Phase 0 ships YouTube + Vimeo). The MiniPlayerContainer reflows
    // the player into a floating window when it scrolls out of view;
    // metadata UI (channel / captions status) is a separate addon slot
    // rendered below so the floating mini-player only carries the
    // playable surface.
    return (
      <div className="-mx-4 -mt-4 md:mx-0 md:mt-0">
        <MiniPlayerContainer mc={localMc} root={miniPlayerRoot}>
          <LoftPlayer
            fileId={file.id}
            onMediaController={relayMc}
            initialTime={initialTime}
            durationHint={file.duration}
          />
        </MiniPlayerContainer>
        <AddonSlot
          id="loft-metadata"
          props={{ fileId: file.id, drive: file.drive }}
        />
      </div>
    );
  }

  if (file.file_type === "video") {
    return (
      <div className="-mx-4 -mt-4 md:mx-0 md:mt-0">
        <MiniPlayerContainer mc={localMc} root={miniPlayerRoot}>
          <NativeVideoWithController
            file={file}
            onEnded={onEnded}
            autoPlay={autoPlay}
            initialTime={initialTime}
            videoRef={videoRef}
            onMediaController={relayMc}
          />
        </MiniPlayerContainer>
      </div>
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

  if (file.mime_type === "text/markdown") {
    return (
      <MarkdownFileViewer
        fileId={file.id}
        editable={{
          mime_type: file.mime_type,
          filename: file.filename,
          drive: file.drive,
        }}
        externalReloadKey={markdownReloadKey}
        onTagsSaved={onMarkdownTagsSaved}
        highlight={highlight}
        onDocumentCaptureController={onDocumentCaptureController}
      />
    );
  }

  if (file.mime_type === "text/html") {
    return <HtmlPreview fileId={file.id} />;
  }

  if (file.mime_type === "application/pdf") {
    return (
      <PdfPreview
        fileId={file.id}
        title={file.title || file.filename}
        initialPage={initialPage}
        onDocumentCaptureController={onDocumentCaptureController}
      />
    );
  }

  if (file.file_type === "archive") {
    return <ArchivePreview fileId={file.id} />;
  }

  if (isTextPreviewable(file.mime_type)) {
    return (
      <TextPreview
        fileId={file.id}
        fileSize={file.file_size}
        highlight={highlight}
        onDocumentCaptureController={onDocumentCaptureController}
      />
    );
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
