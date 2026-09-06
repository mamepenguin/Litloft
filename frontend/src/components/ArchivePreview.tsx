"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { getArchiveContents } from "@/lib/api";
import { ArchiveContentsStore, type ArchiveController } from "@/lib/archiveController";
import { isTextPreviewable } from "./TextPreview";
import type { ArchiveContents, ArchiveEntry } from "@/types";
import type { ArchiveViewMode } from "./archive/archiveUtils";
import { defaultArchiveViewMode, MAX_TEXT_AUTO_LOAD } from "./archive/archiveUtils";
import { getDirname } from "./archive/archiveUtils";
import { useArchiveNavigation } from "./archive/useArchiveNavigation";
import { useArchiveSort } from "./archive/useArchiveSort";
import { useArchiveViewMode } from "./archive/useArchiveViewMode";
import { useImageViewer } from "./archive/useImageViewer";
import { useTextViewer } from "./archive/useTextViewer";
import { ArchiveImageViewer } from "./archive/ArchiveImageViewer";
import { ArchiveTextViewer } from "./archive/ArchiveTextViewer";
import { ArchiveFileListing } from "./archive/ArchiveFileListing";
import { ArchiveEntryGrid } from "./archive/ArchiveEntryGrid";
import { ArchiveToolbar } from "./archive/ArchiveToolbar";

export function ArchivePreview({
  fileId,
  onArchiveController,
}: {
  fileId: string;
  /** Publishes the archive's contents for the inspector's index tab. */
  onArchiveController?: (controller: ArchiveController | null) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPath = searchParams.get("archivePath") || "";

  const t = useTranslations("archive");
  const [archive, setArchive] = useState<ArchiveContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // "listing" | "image" | "text" — controls which viewer overlay is active
  const [viewerMode, setViewerMode] = useState<ArchiveViewMode>("listing");
  const [viewingEntry, setViewingEntry] = useState<ArchiveEntry | null>(null);

  const { sort, order, typeFilter, setSort, setOrder, setTypeFilter, applySortFilter } = useArchiveSort();

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
    navigateArchive,
    handleDirClick,
    handleBreadcrumbClick,
  } = useArchiveNavigation(archive, currentPath, searchParamsString, router);

  // Derived from the level, not from what the filter left of it: narrowing to
  // images would otherwise flip the layout under the reader's hand, and the
  // question the derivation answers is what this level holds.
  const { viewMode, setViewMode } = useArchiveViewMode(
    fileId,
    defaultArchiveViewMode(currentEntries)
  );

  const closeViewer = useCallback(() => {
    setViewerMode("listing");
    setViewingEntry(null);
  }, []);

  const imageViewer = useImageViewer(
    viewerMode,
    imageEntries,
    fileId,
    closeViewer
  );

  const textViewer = useTextViewer(viewerMode, viewingEntry, fileId);

  const currentImage = imageEntries[imageViewer.imageIndex] ?? null;

  const closeViewerFull = useCallback(() => {
    setViewerMode("listing");
    setViewingEntry(null);
    imageViewer.setPlaying(false);
    imageViewer.setShowControls(true);
    textViewer.setTextContent(null);
    textViewer.setTextError(null);
    textViewer.setTextConfirmed(false);
  }, [imageViewer, textViewer]);

  useEffect(() => {
    setViewerMode("listing");
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
        setViewerMode("image");
        imageViewer.setShowControls(true);
        imageViewer.setPlaying(false);
      } else if (isTextPreviewable(entry.mime_type, entry.filename)) {
        setViewingEntry(entry);
        setViewerMode("text");
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
    if (isTextPreviewable(entry.mime_type, entry.filename)) return true;
    return false;
  };

  // The inspector's index reaches into levels the canvas is not on, so
  // opening one of its leaves is two steps: move the level, then open.
  // `handleFileClick` reads `imageEntries`, which is the *current*
  // level — called before the move lands it would open the wrong page,
  // or none.
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);

  const openFromIndex = useCallback(
    (entry: ArchiveEntry) => {
      if (entry.is_dir) {
        handleDirClick(entry);
        return;
      }
      const parent = getDirname(entry.path);
      if (parent === currentPath) {
        handleFileClick(entry);
        return;
      }
      setPendingOpen(entry.path);
      navigateArchive(parent);
    },
    [currentPath, handleDirClick, handleFileClick, navigateArchive],
  );

  useEffect(() => {
    if (!pendingOpen) return;
    const entry = currentEntries.find((e) => e.path === pendingOpen);
    // Only once the level has actually arrived. Until then the effect
    // re-runs on the next render with nothing to do.
    if (!entry) return;
    setPendingOpen(null);
    handleFileClick(entry);
  }, [pendingOpen, currentEntries, handleFileClick]);

  const archiveStore = useMemo(() => new ArchiveContentsStore(), []);

  // In effects, not during render: `set` notifies its subscribers
  // synchronously, and the subscriber is a component in the inspector's
  // subtree.
  useEffect(() => {
    archiveStore.setOpener(openFromIndex);
  }, [archiveStore, openFromIndex]);

  useEffect(() => {
    archiveStore.set({ entries: archive?.entries ?? [], currentPath });
  }, [archiveStore, archive, currentPath]);

  useEffect(() => {
    onArchiveController?.(archiveStore);
    return () => onArchiveController?.(null);
  }, [onArchiveController, archiveStore]);

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-danger">
          {t("loadFailed", { error: error ?? "" })}
        </p>
      </div>
    );
  }

  if (viewerMode === "image" && currentImage) {
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

  const displayEntries = applySortFilter(currentEntries);

  return (
    <div className="w-full">
      <ArchiveToolbar
        fileId={fileId}
        archive={archive}
        breadcrumbs={breadcrumbs}
        handleBreadcrumbClick={handleBreadcrumbClick}
        sort={sort}
        order={order}
        typeFilter={typeFilter}
        viewMode={viewMode}
        onSortChange={setSort}
        onOrderChange={setOrder}
        onTypeFilterChange={setTypeFilter}
        onViewModeChange={setViewMode}
      />

      {viewMode === "grid" ? (
        <ArchiveEntryGrid
          entries={displayEntries}
          fileId={fileId}
          handleDirClick={handleDirClick}
          handleFileClick={handleFileClick}
          isClickable={isClickable}
        />
      ) : (
        <ArchiveFileListing
          entries={displayEntries}
          fileId={fileId}
          handleDirClick={handleDirClick}
          handleFileClick={handleFileClick}
          isClickable={isClickable}
        />
      )}

      {/* Outside the branch, because `viewerMode === "text"` means the same
          thing in both layouts. It used to be the file listing's `children`,
          so pressing a text entry in the grid set the mode and drew nothing:
          the press looked like it had missed. */}
      {viewerMode === "text" && viewingEntry && (
        <ArchiveTextViewer
          viewingEntry={viewingEntry}
          fileId={fileId}
          textConfirmed={textViewer.textConfirmed}
          textLoading={textViewer.textLoading}
          textError={textViewer.textError}
          textContent={textViewer.textContent}
          setTextConfirmed={textViewer.setTextConfirmed}
          closeViewer={closeViewerFull}
        />
      )}
    </div>
  );
}
