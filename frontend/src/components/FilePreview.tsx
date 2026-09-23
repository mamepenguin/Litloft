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
import LoftPlayer from "./loft/LoftPlayer";
import { MiniPlayerContainer } from "./MiniPlayerContainer";
import { formatFileSize } from "@/lib/format";
import { getStreamUrl, getThumbnailUrl } from "@/lib/api";
import { playerKind } from "@/lib/playerKind";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { PdfController } from "@/lib/pdfController";
import type { ArchiveController } from "@/lib/archiveController";
import { ImageCanvas } from "./ImageCanvas";

/**
 * `react-pdf` pulls in `pdfjs-dist`, which touches `DOMMatrix` while its
 * module body evaluates. Node has no `DOMMatrix`, so a static import made
 * every `/drive/*` route throw during SSR and return HTTP 500.
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
  initialPage?: number;
  highlight?: string;
  /**
   * Stable identity is the caller's responsibility (use a setState
   * setter or a useCallback).
   */
  onMediaController?: (mc: MediaController | null) => void;
  onDocumentCaptureController?: (
    controller: DocumentCaptureController | null,
  ) => void;
  onPdfController?: (controller: PdfController | null) => void;
  onArchiveController?: (controller: ArchiveController | null) => void;
  markdownReloadKey?: number;
  onMarkdownTagsSaved?: (tags: string[]) => void;
  /**
   * When the player lives inside a host whose own ``overflow-y: auto``
   * handles scrolling the host must pass its
   * scroll container here; document-scroll hosts can omit it.
   */
  miniPlayerRoot?: Element | null;
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
  onPdfController,
  onArchiveController,
  markdownReloadKey,
  onMarkdownTagsSaved,
  miniPlayerRoot,
}: FilePreviewProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const [localMc, setLocalMc] = useState<MediaController | null>(null);
  const relayMc = useCallback(
    (mc: MediaController | null) => {
      setLocalMc(mc);
      onMediaController?.(mc);
    },
    [onMediaController],
  );

  const kind = playerKind(file);
  const posterUrl = file.has_thumbnail ? getThumbnailUrl(file.id) : undefined;

  if (kind === "loft") {
    return (
      <div className="-mx-4 -mt-4 bg-black md:mx-0 md:mt-0">
        <MiniPlayerContainer mc={localMc} root={miniPlayerRoot}>
          <LoftPlayer
            fileId={file.id}
            onMediaController={relayMc}
            initialTime={initialTime}
            durationHint={file.duration}
            posterUrl={posterUrl}
            onEnded={onEnded}
            mediaSessionMetadata={{
              title: file.title || file.filename,
              artist: file.folder_path || file.drive,
              artwork: [{ src: getThumbnailUrl(file.id) }],
            }}
          />
        </MiniPlayerContainer>
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="-mx-4 -mt-4 bg-black md:mx-0 md:mt-0">
        <MiniPlayerContainer mc={localMc} root={miniPlayerRoot}>
          <VideoPlayer
            ref={videoRef}
            videoId={file.id}
            subtitles={file.subtitles}
            onEnded={onEnded}
            autoPlay={autoPlay}
            initialTime={initialTime}
            duration={file.duration}
            posterUrl={posterUrl}
            title={file.title || file.filename}
            subtitleText={file.folder_path || file.drive}
            onMediaController={relayMc}
          />
        </MiniPlayerContainer>
      </div>
    );
  }

  if (file.file_type === "image") {
    return <ImageCanvas file={file} />;
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
          folder_path: file.folder_path,
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
        documentSlotProps={{
          fileId: file.id,
          drive: file.drive,
          filename: file.filename,
          fileType: file.file_type,
        }}
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

  if (isTextPreviewable(file.mime_type, file.filename)) {
    return (
      <TextPreview
        fileId={file.id}
        fileSize={file.file_size}
        filename={file.filename}
        highlight={highlight}
        onDocumentCaptureController={onDocumentCaptureController}
      />
    );
  }

  return (
    <div className="w-full rounded-xl bg-bg-card">
      <EmptyState
        icon={FileQuestion}
        title={t("noPreview")}
        description={`${file.filename} · ${formatFileSize(file.file_size)}`}
        primaryAction={{ label: tc("download"), href: getDownloadUrl(file.id), download: true }}
        secondaryActions={[{ label: t("openInNewTab"), href: getStreamUrl(file.id), newTab: true }]}
      />
      <OfficeExcerpt
        fileId={file.id}
        mimeType={file.mime_type}
        fileSize={file.file_size}
        missing={file.missing_since !== null}
      />
    </div>
  );
}
