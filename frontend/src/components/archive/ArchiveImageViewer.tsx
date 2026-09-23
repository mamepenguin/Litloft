"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  X,
} from "lucide-react";

import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useViewerZoom } from "@/hooks/useViewerZoom";
import { useViewerZoomShortcuts } from "@/hooks/useViewerZoomShortcuts";
import { useInertBackdrop } from "@/hooks/useInertBackdrop";
import { getArchiveEntryUrl } from "@/lib/api";
import type { ArchiveEntry } from "@/types";
import { SlideshowIntervalMenu } from "@/components/gallery/SlideshowIntervalMenu";
import type { AutoHidingChrome } from "@/hooks/useAutoHidingChrome";
import type { Orientation, SpreadFace } from "@/lib/spreadPaging";

interface ArchiveImageViewerProps {
  fileId: string;
  currentImage: ArchiveEntry;
  imageEntries: ArchiveEntry[];
  imageIndex: number;
  imageLoading: boolean;
  setImageLoading: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  showControls: boolean;
  chromeProps: AutoHidingChrome["chromeProps"];
  onIntervalOpenChange: (open: boolean) => void;
  face: SpreadFace;
  faceLabel: string;
  subPageLabel: "A" | "B" | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  rememberOrientation: (index: number, orientation: Orientation) => void;
  handleImageAreaClick: () => void;
  closeViewer: () => void;
  spreadMode: boolean;
  setSpreadMode: React.Dispatch<React.SetStateAction<boolean>>;
  readingDirection: "ltr" | "rtl";
  setReadingDirection: React.Dispatch<React.SetStateAction<"ltr" | "rtl">>;
  setIsCurrentLandscape: React.Dispatch<React.SetStateAction<boolean>>;
  showRightHalf: boolean;
  navigatePrev: () => void;
  navigateNext: () => void;
}

export function ArchiveImageViewer({
  fileId,
  currentImage,
  imageEntries,
  imageIndex,
  imageLoading,
  setImageLoading,
  playing,
  setPlaying,
  slideshowInterval,
  setSlideshowInterval,
  showControls,
  chromeProps,
  onIntervalOpenChange,
  face,
  faceLabel,
  subPageLabel,
  canGoPrev,
  canGoNext,
  rememberOrientation,
  handleImageAreaClick,
  closeViewer,
  spreadMode,
  setSpreadMode,
  readingDirection,
  setReadingDirection,
  setIsCurrentLandscape,
  showRightHalf,
  navigatePrev,
  navigateNext,
}: ArchiveImageViewerProps) {
  const t = useTranslations("archive");
  const tc = useTranslations("common");

  const activeSplit = face.kind === "half";

  const zoom = useViewerZoom({
    resetKey: `${face.kind}:${imageIndex}:${showRightHalf}`,
    readingDirection,
    navigatePrev,
    navigateNext,
    toggleControls: handleImageAreaClick,
  });
  useViewerZoomShortcuts(zoom, true);

  const backdropRef = useInertBackdrop<HTMLDivElement>(true);

  // Portalled: opened from inside the file page's player box, which is a
  // sticky stacking context on a phone, so an in-place z-[60] ranks below
  // the page header.
  return createPortal(
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal
      aria-label={`${t("imageViewer")}: ${currentImage.filename}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-300"
        {...chromeProps}
      >
        <span className="max-w-[40%] truncate text-sm text-white/80">
          {currentImage.filename}
        </span>

        {imageEntries.length > 0 && (
          <span className="text-sm text-white/60">
            {faceLabel} / {imageEntries.length}
            {subPageLabel !== null ? ` ${subPageLabel}` : ""}
          </span>
        )}

        <div className="flex items-center gap-2">
          {imageEntries.length > 1 && (
            <>
              <SlideshowIntervalMenu
                value={slideshowInterval}
                onChange={setSlideshowInterval}
                frameRef={backdropRef}
                label={t("slideshowInterval")}
                closeLabel={tc("close")}
                formatSeconds={(sec) => t("seconds", { sec })}
                onOpenChange={onIntervalOpenChange}
              />
              <button
                onClick={() => setPlaying((p) => !p)}
                className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={playing ? tc("pause") : tc("play")}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
            </>
          )}
          {spreadMode && (
            <button
              onClick={() =>
                setReadingDirection((d) => (d === "ltr" ? "rtl" : "ltr"))
              }
              className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              aria-label={t("readingDirection")}
            >
              {readingDirection === "ltr" ? t("ltr") : t("rtl")}
            </button>
          )}
          <button
            onClick={() => setSpreadMode((m) => !m)}
            className={`rounded-full p-1.5 transition-colors hover:bg-white/10 ${spreadMode ? "text-white" : "text-white/60 hover:text-white"}`}
            aria-label={t("spreadModeToggle")}
          >
            <BookOpen size={18} />
          </button>
          <a
            href={getArchiveEntryUrl(fileId, currentImage.path)}
            download={currentImage.filename}
            className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={tc("download")}
          >
            <Download size={18} />
          </a>
          <button
            onClick={closeViewer}
            className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        ref={zoom.frameRef}
        className={`flex flex-1 items-center overflow-hidden touch-none ${zoom.zoomed ? "cursor-grab" : "cursor-pointer"}`}
        {...zoom.frameHandlers}
      >
        {imageLoading && (
          <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        <div
          ref={zoom.contentRef}
          className="flex h-full w-full items-center"
          style={zoom.contentStyle}
        >
          <div
            data-face={face.kind}
            className="flex h-full items-center justify-center"
            style={{
              width: activeSplit ? "200%" : "100%",
              flexShrink: activeSplit ? 0 : undefined,
              transform:
                activeSplit && showRightHalf ? "translateX(-50%)" : undefined,
              // The `flex-direction` does it, so the two `<img>` elements stay
              // in reading order in the DOM for a screen reader.
              flexDirection:
                face.kind === "pair" && readingDirection === "rtl"
                  ? "row-reverse"
                  : "row",
            }}
          >
            {face.indices.map((i, slot) => {
              const entry = imageEntries[i];
              if (!entry) return null;
              return (
                <img
                  key={entry.path}
                  src={getArchiveEntryUrl(fileId, entry.path)}
                  alt={entry.filename}
                  className="max-h-full select-none object-contain"
                  style={{
                    maxWidth: face.kind === "pair" ? "50%" : "100%",
                  }}
                  onLoad={(e) => {
                    setImageLoading(false);
                    const img = e.currentTarget;
                    const landscape = img.naturalWidth > img.naturalHeight;
                    // Every drawn page, not only the one the face is named
                    // by: the second page of a pair is exactly the index
                    // the *next* face will ask about.
                    rememberOrientation(
                      i,
                      landscape ? "landscape" : "portrait",
                    );
                    // The second page of a pair reporting its own shape here
                    // would flip the face out from under itself.
                    if (slot === 0 && i === imageIndex) {
                      setIsCurrentLandscape(landscape);
                    }
                  }}
                  draggable={false}
                />
              );
            })}
          </div>
        </div>
      </div>

      {showControls && (readingDirection === "ltr" ? canGoPrev : canGoNext) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            readingDirection === "ltr" ? navigatePrev() : navigateNext();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
          aria-label={
            readingDirection === "ltr" ? t("prevImage") : t("nextImage")
          }
        >
          <ChevronLeft size={32} />
        </button>
      )}
      {showControls && (readingDirection === "ltr" ? canGoNext : canGoPrev) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            readingDirection === "ltr" ? navigateNext() : navigatePrev();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
          aria-label={
            readingDirection === "ltr" ? t("nextImage") : t("prevImage")
          }
        >
          <ChevronRight size={32} />
        </button>
      )}
    </div>,
    document.body,
  );
}
