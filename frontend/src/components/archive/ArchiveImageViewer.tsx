"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  X,
} from "lucide-react";

import { getArchiveEntryUrl } from "@/lib/api";
import type { ArchiveEntry } from "@/types";
import { INTERVAL_OPTIONS } from "./archiveUtils";

interface ArchiveImageViewerProps {
  fileId: string;
  currentImage: ArchiveEntry;
  imageEntries: ArchiveEntry[];
  imageIndex: number;
  setImageIndex: React.Dispatch<React.SetStateAction<number>>;
  imageLoading: boolean;
  setImageLoading: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  showControls: boolean;
  handleImageAreaClick: () => void;
  closeViewer: () => void;
}

export function ArchiveImageViewer({
  fileId,
  currentImage,
  imageEntries,
  imageIndex,
  setImageIndex,
  imageLoading,
  setImageLoading,
  playing,
  setPlaying,
  slideshowInterval,
  setSlideshowInterval,
  showControls,
  handleImageAreaClick,
  closeViewer,
}: ArchiveImageViewerProps) {
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
                aria-label="スライドショー間隔"
              >
                {INTERVAL_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}秒
                  </option>
                ))}
              </select>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={playing ? "一時停止" : "再生"}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
            </>
          )}
          <a
            href={getArchiveEntryUrl(fileId, currentImage.path)}
            download={currentImage.filename}
            className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="ダウンロード"
          >
            <Download size={18} />
          </a>
          <button
            onClick={closeViewer}
            className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div
        className="flex flex-1 cursor-pointer items-center justify-center"
        onClick={handleImageAreaClick}
      >
        {imageLoading && (
          <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        <img
          key={currentImage.path}
          src={getArchiveEntryUrl(fileId, currentImage.path)}
          alt={currentImage.filename}
          className="max-h-full max-w-full select-none object-contain"
          onLoad={() => setImageLoading(false)}
          draggable={false}
        />
      </div>

      {/* Navigation buttons */}
      {showControls && imageIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setImageIndex((prev) => prev - 1);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
          aria-label="前の画像"
        >
          <ChevronLeft size={32} />
        </button>
      )}
      {showControls && imageIndex < imageEntries.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setImageIndex((prev) => prev + 1);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
          aria-label="次の画像"
        >
          <ChevronRight size={32} />
        </button>
      )}
    </div>
  );
}
