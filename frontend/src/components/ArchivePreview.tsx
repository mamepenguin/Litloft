"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { getArchiveContents } from "@/lib/api";
import {
  ArchiveContentsStore,
  type ArchiveController,
} from "@/lib/archiveController";
import { isTextPreviewable } from "./TextPreview";
import type { ArchiveContents, ArchiveEntry } from "@/types";
import type { ArchiveViewMode } from "./archive/archiveUtils";
import {
  defaultArchiveViewMode,
  MAX_TEXT_AUTO_LOAD,
} from "./archive/archiveUtils";
import { canOpenArchiveEntry, getDirname } from "./archive/archiveUtils";
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

  const {
    sort,
    order,
    typeFilter,
    setSort,
    setOrder,
    setTypeFilter,
    applySortFilter,
  } = useArchiveSort();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // The index is published from this state and the panel subscribes
    // rather than remounting, so leaving the old archive in place shows
    // zip A's contents beside zip B's spinner — and pressing a row then
    // writes A's path into B's URL.
    setArchive(null);

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
            err instanceof Error ? err.message : "Failed to load archive",
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
    defaultArchiveViewMode(currentEntries),
  );

  const closeViewer = useCallback(() => {
    setViewerMode("listing");
    setViewingEntry(null);
  }, []);

  const imageViewer = useImageViewer(
    viewerMode,
    imageEntries,
    fileId,
    closeViewer,
  );

  const textViewer = useTextViewer(viewerMode, viewingEntry, fileId);

  const currentImage = imageEntries[imageViewer.imageIndex] ?? null;

  const closeViewerFull = useCallback(() => {
    setViewerMode("listing");
    setViewingEntry(null);
    imageViewer.setPlaying(false);
    imageViewer.showChrome();
    textViewer.setTextContent(null);
    textViewer.setTextError(null);
    textViewer.setTextConfirmed(false);
  }, [imageViewer, textViewer]);

  useEffect(() => {
    setViewerMode("listing");
    setViewingEntry(null);
    imageViewer.setPlaying(false);
    imageViewer.showChrome();
  }, [currentPath]);

  const handleFileClick = useCallback(
    (entry: ArchiveEntry) => {
      if (entry.file_type === "image") {
        const idx = imageEntries.findIndex((e) => e.path === entry.path);
        imageViewer.setImageIndex(idx >= 0 ? idx : 0);
        setViewingEntry(entry);
        setViewerMode("image");
        imageViewer.showChrome();
        imageViewer.setPlaying(false);
      } else if (isTextPreviewable(entry.mime_type, entry.filename)) {
        setViewingEntry(entry);
        setViewerMode("text");
        textViewer.setTextContent(null);
        textViewer.setTextError(null);
        textViewer.setTextConfirmed(entry.file_size <= MAX_TEXT_AUTO_LOAD);
      }
    },
    [imageEntries, imageViewer, textViewer],
  );

  // The same predicate the inspector's index uses — see
  // `archiveUtils.canOpenArchiveEntry`.
  const isClickable = canOpenArchiveEntry;

  // The inspector's index reaches into levels the canvas is not on, so
  // opening one of its leaves is two steps: move the level, then open.
  // `handleFileClick` reads `imageEntries`, which is the *current*
  // level — called before the move lands it would open the wrong page,
  // or none.
  /**
   * A leaf the index asked for, and the level that request was made
   * from.
   *
   * `from` is the load-bearing half. `setPendingOpen` is a default-lane
   * update and `router.push` is a transition, so React commits this
   * state *before* the level changes and flushes effects in between. An
   * expiry that compared the target parent against `currentPath` was
   * therefore false on the very commit that set it, and the request
   * cancelled itself every time.
   */
  const [pendingOpen, setPendingOpen] = useState<{
    path: string;
    from: string;
  } | null>(null);

  // Any other way of moving cancels a request the index made. Guessing
  // from `currentPath` cannot: a reader who leaves and comes back
  // leaves it exactly where it was.
  const cancelPendingOpen = useCallback(() => setPendingOpen(null), []);

  const openBreadcrumb = useCallback(
    (path: string) => {
      cancelPendingOpen();
      handleBreadcrumbClick(path);
    },
    [cancelPendingOpen, handleBreadcrumbClick],
  );

  const openDir = useCallback(
    (entry: ArchiveEntry) => {
      cancelPendingOpen();
      handleDirClick(entry);
    },
    [cancelPendingOpen, handleDirClick],
  );

  const openFromIndex = useCallback(
    (entry: ArchiveEntry) => {
      // Whatever else happens, a new press replaces an old one. Without
      // this a deep press followed by a same-level press opens the
      // second and then the first, when its navigation lands.
      setPendingOpen(null);
      if (entry.is_dir) {
        handleDirClick(entry);
        return;
      }
      const parent = getDirname(entry.path);
      if (parent === currentPath) {
        handleFileClick(entry);
        return;
      }
      setPendingOpen({ path: entry.path, from: currentPath });
      navigateArchive(parent);
    },
    [currentPath, handleDirClick, handleFileClick, navigateArchive],
  );

  useEffect(() => {
    if (!pendingOpen) return;
    const entry = currentEntries.find((e) => e.path === pendingOpen.path);
    if (entry) {
      setPendingOpen(null);
      handleFileClick(entry);
      return;
    }
    // Not there yet, or not going to be. The request is alive on the
    // level it was issued from — the navigation is still in flight —
    // and on the level it is headed for, where the entries may not have
    // arrived in this render. A landing anywhere else means the reader
    // went somewhere else, and waiting on would open a page they never
    // asked for the moment they walk into that folder.
    //
    // This cannot see the reader going somewhere else and *back*, since
    // that leaves `currentPath` equal to `from` again. That case is
    // dropped at its source instead: every control that starts a
    // different move clears the request.
    const target = getDirname(pendingOpen.path);
    if (currentPath !== pendingOpen.from && currentPath !== target) {
      setPendingOpen(null);
    }
  }, [pendingOpen, currentEntries, currentPath, handleFileClick]);

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
        chromeProps={imageViewer.chromeProps}
        onIntervalOpenChange={imageViewer.setChromeHeld}
        face={imageViewer.face}
        faceLabel={imageViewer.faceLabel}
        subPageLabel={imageViewer.subPageLabel}
        canGoPrev={imageViewer.canGoPrev}
        canGoNext={imageViewer.canGoNext}
        rememberOrientation={imageViewer.rememberOrientation}
        handleImageAreaClick={imageViewer.handleImageAreaClick}
        closeViewer={closeViewerFull}
        spreadMode={imageViewer.spreadMode}
        setSpreadMode={imageViewer.setSpreadMode}
        readingDirection={imageViewer.readingDirection}
        setReadingDirection={imageViewer.setReadingDirection}
        setIsCurrentLandscape={imageViewer.setIsCurrentLandscape}
        showRightHalf={imageViewer.showRightHalf}
        navigatePrev={imageViewer.navigatePrev}
        navigateNext={imageViewer.navigateNext}
      />
    );
  }

  const displayEntries = applySortFilter(currentEntries);

  return (
    // `h-full`: the canvas reserves a floor on the wrapper above and
    // stretches this box into it, so the listing gets the height rather
    // than leaving it empty underneath.
    <div className="flex h-full w-full flex-col">
      <ArchiveToolbar
        fileId={fileId}
        archive={archive}
        breadcrumbs={breadcrumbs}
        handleBreadcrumbClick={openBreadcrumb}
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
          handleDirClick={openDir}
          handleFileClick={handleFileClick}
          isClickable={isClickable}
        />
      ) : (
        <ArchiveFileListing
          entries={displayEntries}
          fileId={fileId}
          handleDirClick={openDir}
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
