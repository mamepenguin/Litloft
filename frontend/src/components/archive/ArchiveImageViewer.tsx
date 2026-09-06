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

import { useTranslations } from "next-intl";
import { useImageAreaGestures } from "@/hooks/useImageAreaGestures";
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
  isCurrentLandscape: boolean;
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
  isCurrentLandscape,
  setIsCurrentLandscape,
  showRightHalf,
  navigatePrev,
  navigateNext,
}: ArchiveImageViewerProps) {
  const t = useTranslations("archive");
  const tc = useTranslations("common");

  const activeSplit = face.kind === "half";

  const gestureHandlers = useImageAreaGestures({
    readingDirection,
    navigatePrev,
    navigateNext,
    toggleControls: handleImageAreaClick,
  });

  // Mounted only while the viewer is open, so it is active for its whole life.
  const backdropRef = useInertBackdrop<HTMLDivElement>(true);

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal
      aria-label={`${t("imageViewer")}: ${currentImage.filename}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      {/* Header */}
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

      {/* Main image area */}
      <div
        className="flex flex-1 cursor-pointer items-center overflow-hidden touch-none"
        {...gestureHandlers}
      >
        {imageLoading && (
          <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        <div
          data-face={face.kind}
          className="flex h-full items-center justify-center"
          style={{
            // Splitting draws one page at twice the frame's width and
            // slides it; pairing draws two pages inside one frame's
            // width. Same word, opposite arithmetic.
            width: activeSplit ? "200%" : "100%",
            flexShrink: activeSplit ? 0 : undefined,
            transform:
              activeSplit && showRightHalf ? "translateX(-50%)" : undefined,
            // Right-to-left reading puts the first page of a pair on the
            // right. The `flex-direction` does it, so the two `<img>`
            // elements stay in reading order in the DOM and a screen
            // reader hears them in the order they are read.
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
                  // Only the page the position is named by decides
                  // whether this face is a split one. The second page of
                  // a pair reporting its own shape here would flip the
                  // face out from under itself.
                  if (slot === 0 && i === imageIndex) {
                    const img = e.currentTarget;
                    setIsCurrentLandscape(img.naturalWidth > img.naturalHeight);
                  }
                }}
                draggable={false}
              />
            );
          })}
        </div>
      </div>

      {/* Navigation buttons */}
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
    </div>
  );
}
