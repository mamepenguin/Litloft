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
import { getArchiveEntryUrl } from "@/lib/api";
import type { ArchiveEntry } from "@/types";
import { INTERVAL_OPTIONS } from "./archiveUtils";

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
  handleImageAreaClick: () => void;
  closeViewer: () => void;
  splitMode: boolean;
  setSplitMode: React.Dispatch<React.SetStateAction<boolean>>;
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
  handleImageAreaClick,
  closeViewer,
  splitMode,
  setSplitMode,
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

  const activeSplit = splitMode && isCurrentLandscape;
  const isFirstSubPage =
    readingDirection === "ltr" ? !showRightHalf : showRightHalf;
  const subPageLabel = activeSplit ? (isFirstSubPage ? "A" : "B") : null;

  // Translate value for split rendering
  const translateX = activeSplit ? (showRightHalf ? "-50%" : "0%") : undefined;

  const canGoPrev = imageIndex > 0 || (activeSplit && !isFirstSubPage);
  const canGoNext =
    imageIndex < imageEntries.length - 1 || (activeSplit && isFirstSubPage);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Header */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-300"
        style={{
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? "auto" : "none",
        }}
      >
        <span className="max-w-[40%] truncate text-sm text-white/80">
          {currentImage.filename}
        </span>

        {imageEntries.length > 0 && (
          <span className="text-sm text-white/60">
            {imageIndex + 1} / {imageEntries.length}
            {subPageLabel !== null ? ` ${subPageLabel}` : ""}
          </span>
        )}

        <div className="flex items-center gap-2">
          {imageEntries.length > 1 && (
            <>
              <select
                value={slideshowInterval}
                onChange={(e) =>
                  setSlideshowInterval(Number(e.target.value))
                }
                className="rounded bg-white/10 px-2 py-1 text-sm text-white outline-none"
                aria-label={t("slideshowInterval")}
              >
                {INTERVAL_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {t("seconds", { sec })}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={playing ? tc("pause") : tc("play")}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
            </>
          )}
          {splitMode && (
            <button
              onClick={() =>
                setReadingDirection((d) => (d === "ltr" ? "rtl" : "ltr"))
              }
              className="rounded bg-white/10 px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              aria-label={t("readingDirection")}
            >
              {readingDirection === "ltr" ? t("ltr") : t("rtl")}
            </button>
          )}
          <button
            onClick={() => setSplitMode((m) => !m)}
            className={`rounded-full p-1.5 transition-colors hover:bg-white/10 ${splitMode ? "text-white" : "text-white/60 hover:text-white"}`}
            aria-label={t("splitModeToggle")}
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
        className="flex flex-1 cursor-pointer items-center overflow-hidden"
        onClick={handleImageAreaClick}
      >
        {imageLoading && (
          <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        <div
          className="flex h-full items-center justify-center"
          style={{ width: activeSplit ? "200%" : "100%" }}
        >
          <img
            key={currentImage.path}
            src={getArchiveEntryUrl(fileId, currentImage.path)}
            alt={currentImage.filename}
            className="max-h-full max-w-full select-none object-contain"
            style={
              activeSplit
                ? { transform: `translateX(${translateX})` }
                : undefined
            }
            onLoad={(e) => {
              setImageLoading(false);
              const img = e.currentTarget;
              setIsCurrentLandscape(img.naturalWidth > img.naturalHeight);
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* Navigation buttons */}
      {showControls && canGoPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigatePrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
          aria-label={t("prevImage")}
        >
          <ChevronLeft size={32} />
        </button>
      )}
      {showControls && canGoNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigateNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
          aria-label={t("nextImage")}
        >
          <ChevronRight size={32} />
        </button>
      )}
    </div>
  );
}
