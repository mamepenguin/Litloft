"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { getArchiveContents } from "@/lib/api";
import { isTextPreviewable } from "./TextPreview";
import type { ArchiveContents, ArchiveEntry } from "@/types";
import type { ArchiveViewMode } from "./archive/archiveUtils";
import { MAX_TEXT_AUTO_LOAD } from "./archive/archiveUtils";
import { useArchiveNavigation } from "./archive/useArchiveNavigation";
import { useImageViewer } from "./archive/useImageViewer";
import { useTextViewer } from "./archive/useTextViewer";
import { ArchiveImageViewer } from "./archive/ArchiveImageViewer";
import { ArchiveTextViewer } from "./archive/ArchiveTextViewer";
import { ArchiveFileListing } from "./archive/ArchiveFileListing";

export function ArchivePreview({ fileId }: { fileId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPath = searchParams.get("archivePath") || "";

  const t = useTranslations("archive");
  const [archive, setArchive] = useState<ArchiveContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ArchiveViewMode>("listing");
  const [viewingEntry, setViewingEntry] = useState<ArchiveEntry | null>(null);

  // Fetch archive contents
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getArchiveContents(fileId)
      .then((data) => {
        if (!cancelled) {
          setArchive(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load archive"
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const searchParamsString = searchParams.toString();

  const {
    currentEntries,
    imageEntries,
    breadcrumbs,
    handleDirClick,
    handleBreadcrumbClick,
  } = useArchiveNavigation(archive, currentPath, searchParamsString, router);

  // closeViewer is defined before hooks that need it, using a stable ref pattern
  // We pass it to useImageViewer which needs it for keyboard Escape handling
  const closeViewer = useCallback(() => {
    setViewMode("listing");
    setViewingEntry(null);
  }, []);

  const imageViewer = useImageViewer(
    viewMode,
    imageEntries,
    fileId,
    closeViewer
  );

  const textViewer = useTextViewer(viewMode, viewingEntry, fileId);

  const currentImage = imageEntries[imageViewer.imageIndex] ?? null;

  // Full close that resets all viewer state
  const closeViewerFull = useCallback(() => {
    setViewMode("listing");
    setViewingEntry(null);
    imageViewer.setPlaying(false);
    imageViewer.setShowControls(true);
    textViewer.setTextContent(null);
    textViewer.setTextError(null);
    textViewer.setTextConfirmed(false);
  }, [imageViewer, textViewer]);

  // Reset viewer when directory changes (e.g. browser back button)
  useEffect(() => {
    setViewMode("listing");
    setViewingEntry(null);
    imageViewer.setPlaying(false);
    imageViewer.setShowControls(true);
  }, [currentPath]);

  const handleFileClick = useCallback(
    (entry: ArchiveEntry) => {
      if (entry.file_type === "image") {
        const idx = imageEntries.findIndex((e) => e.path === entry.path);
        imageViewer.setImageIndex(idx >= 0 ? idx : 0);
        setViewingEntry(entry);
        setViewMode("image");
        imageViewer.setShowControls(true);
        imageViewer.setPlaying(false);
      } else if (isTextPreviewable(entry.mime_type)) {
        setViewingEntry(entry);
        setViewMode("text");
        textViewer.setTextContent(null);
        textViewer.setTextError(null);
        textViewer.setTextConfirmed(entry.file_size <= MAX_TEXT_AUTO_LOAD);
      }
    },
    [imageEntries, imageViewer, textViewer]
  );

  const isClickable = (entry: ArchiveEntry): boolean => {
    if (entry.is_dir) return true;
    if (entry.file_type === "image") return true;
    if (isTextPreviewable(entry.mime_type)) return true;
    return false;
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-red-400">
          {t("loadFailed", { error: error ?? "" })}
        </p>
      </div>
    );
  }

  // Image viewer (fullscreen overlay)
  if (viewMode === "image" && currentImage) {
    return (
      <ArchiveImageViewer
        fileId={fileId}
        currentImage={currentImage}
        imageEntries={imageEntries}
        imageIndex={imageViewer.imageIndex}
        imageLoading={imageViewer.imageLoading}
        setImageLoading={imageViewer.setImageLoading}
        playing={imageViewer.playing}
        setPlaying={imageViewer.setPlaying}
        slideshowInterval={imageViewer.slideshowInterval}
        setSlideshowInterval={imageViewer.setSlideshowInterval}
        showControls={imageViewer.showControls}
        handleImageAreaClick={imageViewer.handleImageAreaClick}
        closeViewer={closeViewerFull}
        splitMode={imageViewer.splitMode}
        setSplitMode={imageViewer.setSplitMode}
        readingDirection={imageViewer.readingDirection}
        setReadingDirection={imageViewer.setReadingDirection}
        isCurrentLandscape={imageViewer.isCurrentLandscape}
        setIsCurrentLandscape={imageViewer.setIsCurrentLandscape}
        showRightHalf={imageViewer.showRightHalf}
        navigatePrev={imageViewer.navigatePrev}
        navigateNext={imageViewer.navigateNext}
      />
    );
  }

  // File listing mode (with optional text viewer below)
  return (
    <ArchiveFileListing
      fileId={fileId}
      archive={archive}
      currentEntries={currentEntries}
      breadcrumbs={breadcrumbs}
      handleBreadcrumbClick={handleBreadcrumbClick}
      handleDirClick={handleDirClick}
      handleFileClick={handleFileClick}
      isClickable={isClickable}
    >
      {viewMode === "text" && viewingEntry && (
        <ArchiveTextViewer
          viewingEntry={viewingEntry}
          textConfirmed={textViewer.textConfirmed}
          textLoading={textViewer.textLoading}
          textError={textViewer.textError}
          textContent={textViewer.textContent}
          setTextConfirmed={textViewer.setTextConfirmed}
          closeViewer={closeViewerFull}
        />
      )}
    </ArchiveFileListing>
  );
}
