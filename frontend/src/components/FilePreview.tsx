"use client";

import { useCallback, useState, type Ref } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { FileQuestion } from "lucide-react";
import type { FileItem } from "@/types";
import { getDownloadUrl } from "@/lib/api";
import { VideoPlayer } from "./VideoPlayer";
import { AudioPlayer } from "./AudioPlayer";
import { TextPreview, isTextPreviewable } from "./TextPreview";
import { MarkdownFileViewer } from "./MarkdownPreview";
import { HtmlPreview } from "./HtmlPreview";
import { ArchivePreview } from "./ArchivePreview";
import { EmptyState } from "@/components/EmptyState";
import { OfficeExcerpt } from "./OfficeExcerpt";
import { FileTypeIcon } from "./FileTypeIcon";
import { AddonSlot } from "./AddonSlot";
import LoftPlayer from "./loft/LoftPlayer";
import { MiniPlayerContainer } from "./MiniPlayerContainer";
import { formatFileSize } from "@/lib/format";
import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import { playerKind } from "@/lib/playerKind";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { PdfController } from "@/lib/pdfController";
import type { ArchiveController } from "@/lib/archiveController";

/**
 * Loaded on the client only.
 *
 * `react-pdf` pulls in `pdfjs-dist`, which touches `DOMMatrix` while its
 * module body evaluates. Node has no `DOMMatrix`, so a static import made
 * every `/drive/*` route throw during SSR and return HTTP 500. The pages
 * still *looked* fine, because Next ships the client bundle and flight
 * payload inside the error document and React re-renders the route on
 * hydration — which is exactly why this went unnoticed: only the status
 * code and the server log showed it.
 *
 * Rendering a PDF viewer on the server has no value anyway; it needs a
 * canvas and a worker. `ssr: false` also keeps pdfjs out of the server
 * bundle entirely.
 */
const PdfPreview = dynamic(
  () => import("./PdfPreview").then((m) => m.PdfPreview),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-96 w-full animate-pulse rounded-xl bg-bg-card"
        aria-hidden="true"
      />
    ),
  },
);

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
  /** PDF only: the canvas viewer's page state, for the inspector's page list. */
  onPdfController?: (controller: PdfController | null) => void;
  /** Archive only: the zip's contents, for the inspector's index tab. */
  onArchiveController?: (controller: ArchiveController | null) => void;
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

/*
 * The two wrappers that used to live here — NativeAudioWithController
 * and NativeVideoWithController — existed only to build a
 * MediaController outside the player and publish it upward. The players
 * now own their controller, because usePlaybackProgress needs one
 * inside and a second instance built out here would be a second key in
 * the playback clock, and so a second interval. The audio wrapper's
 * querySelector("audio") hunt went with it.
 */

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
  onPdfController,
  onArchiveController,
  markdownReloadKey,
  onMarkdownTagsSaved,
  miniPlayerRoot,
}: FilePreviewProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
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

  // `playerKind` owns the ordering that matters here: .loft is checked
  // before the file_type branches, because filetype classification
  // reports it as ``video`` (so search file_type filters include it)
  // while playback has to go through the iframe provider registry — a
  // native <video> can't load a YouTube URL.
  const kind = playerKind(file);

  if (kind === "loft") {
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
            onEnded={onEnded}
            mediaSessionMetadata={{
              title: file.title || file.filename,
              artist: file.folder_path || file.drive,
              artwork: [{ src: getThumbnailUrl(file.id) }],
            }}
          />
        </MiniPlayerContainer>
        <AddonSlot
          id="loft-metadata"
          props={{ fileId: file.id, drive: file.drive }}
        />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="-mx-4 -mt-4 md:mx-0 md:mt-0">
        <MiniPlayerContainer mc={localMc} root={miniPlayerRoot}>
          <VideoPlayer
            ref={videoRef}
            videoId={file.id}
            subtitles={file.subtitles}
            onEnded={onEnded}
            autoPlay={autoPlay}
            initialTime={initialTime}
            duration={file.duration}
            title={file.title || file.filename}
            subtitleText={file.folder_path || file.drive}
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

  if (kind === "audio") {
    return (
      <AudioPlayer
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
        onPdfController={onPdfController}
      />
    );
  }

  if (file.file_type === "archive") {
    return (
      <ArchivePreview
        fileId={file.id}
        onArchiveController={onArchiveController}
      />
    );
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

  /**
   * Nothing to show, so say what can be done instead.
   *
   * This was an icon, a filename, a size and "Preview not available" —
   * four lines that all say the same thing and none of which is a way
   * out. The file is still openable, and `docs/user-guide/viewers-and-
   * players.md` has described a Download action here since before one
   * existed. Both are destinations, so both are links: a download the
   * reader cannot copy the address of is worse than the `<a>` it should
   * have been.
   */
  return (
    <div className="w-full rounded-xl bg-bg-card">
      <EmptyState
        icon={FileQuestion}
        title={t("noPreview")}
        description={`${file.filename} · ${formatFileSize(file.file_size)}`}
        primaryAction={{ label: tc("download"), href: getDownloadUrl(file.id), download: true }}
        secondaryActions={[{ label: t("openInNewTab"), href: getStreamUrl(file.id), newTab: true }]}
      />
      {/* Under the panel, behind a rule. Office is not on the shell — p2's
          handover says so with its reasons — so this is the legacy canvas,
          and putting it there is not the same decision as moving the kind. */}
      <OfficeExcerpt
        fileId={file.id}
        mimeType={file.mime_type}
        fileSize={file.file_size}
        missing={file.missing_since !== null}
      />
    </div>
  );
}
