"use client";

import type { ReactNode, RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { DocumentController } from "@/lib/documentController";
import { ShellLayout } from "./ShellLayout";
import type { SheetPeek } from "../MobileInspectorSheet";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { SlotAvailability } from "./hooks/useSlotAvailability";

export interface FileDetailPresenterProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  findEnabled: boolean;
  isHtmlPreview: boolean;
  hasPlayer: boolean;
  usesCanvasViewer: boolean;
  plainTextDocument: boolean;
  hasInspector: boolean;
  playerFramed: boolean;
  slotAvailability: SlotAvailability;
  chaptersPresent: boolean;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  metrics: CompanionMetrics;
  addonSlotProps: Record<string, unknown>;
  mediaController: MediaController | null;
  onMediaController: (mc: MediaController | null) => void;
  documentController: DocumentController | null;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  onDocumentController: (c: DocumentController | null) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  initialTime?: number;
  initialPage?: number;
  initialSection?: number;
  highlight?: string;
  onScrollRootChange: (node: HTMLElement | null) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  onRename: (newFilename: string) => Promise<void>;
  onBack?: () => void;
  meta: ReactNode;
  subtitlesSection: ReactNode;
  sheetPeek?: SheetPeek;
}

export function FileDetailPresenter({
  file,
  fileId,
  drive,
  isMobile,
  findEnabled,
  isHtmlPreview,
  hasPlayer,
  usesCanvasViewer,
  plainTextDocument,
  hasInspector,
  playerFramed,
  slotAvailability,
  chaptersPresent,
  chaptersVersion,
  onChaptersResolved,
  metrics,
  addonSlotProps,
  mediaController,
  onMediaController,
  documentController,
  onDocumentCaptureController,
  onDocumentController,
  videoRef,
  initialTime,
  initialPage,
  initialSection,
  highlight,
  onScrollRootChange,
  onEnded,
  autoPlay,
  markdownReloadKey,
  onMarkdownTagsSaved,
  onRename,
  onBack,
  meta,
  subtitlesSection,
  sheetPeek,
}: FileDetailPresenterProps) {
  return (
    <ShellLayout
      file={file}
      fileId={fileId}
      drive={drive}
      isMobile={isMobile}
      findEnabled={findEnabled}
      isHtmlPreview={isHtmlPreview}
      hasPlayer={hasPlayer}
      usesCanvasViewer={usesCanvasViewer}
      plainTextDocument={plainTextDocument}
      hasInspector={hasInspector}
      slotAvailability={slotAvailability}
      playerFramed={playerFramed}
      chaptersPresent={chaptersPresent}
      chaptersVersion={chaptersVersion}
      onChaptersResolved={onChaptersResolved}
      metrics={metrics}
      addonSlotProps={addonSlotProps}
      mediaController={mediaController}
      onMediaController={onMediaController}
      documentController={documentController}
      onDocumentCaptureController={onDocumentCaptureController}
      onDocumentController={onDocumentController}
      videoRef={videoRef}
      initialTime={initialTime}
      initialPage={initialPage}
      initialSection={initialSection}
      highlight={highlight}
      onScrollRootChange={onScrollRootChange}
      onEnded={onEnded}
      autoPlay={autoPlay}
      markdownReloadKey={markdownReloadKey}
      onMarkdownTagsSaved={onMarkdownTagsSaved}
      onRename={onRename}
      onBack={onBack}
      meta={meta}
      subtitlesSection={subtitlesSection}
      sheetPeek={sheetPeek}
    />
  );
}
