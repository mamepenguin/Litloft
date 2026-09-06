"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  X,
} from "lucide-react";

import { useTranslations } from "next-intl";
import { useImageAreaGestures } from "@/hooks/useImageAreaGestures";
import { useInertBackdrop } from "@/hooks/useInertBackdrop";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useAutoHidingChrome } from "@/hooks/useAutoHidingChrome";
import { useSpreadPaging } from "@/hooks/useSpreadPaging";
import { SlideshowIntervalMenu } from "@/components/gallery/SlideshowIntervalMenu";
import { getDriveFiles, getStreamUrl } from "@/lib/api";
import type { FileItem, SortField, SortOrder } from "@/types";

interface ImageGalleryProps {
  open: boolean;
  file: FileItem;
  sort?: string;
  order?: string;
  onClose: (currentFileId: string | null) => void;
}

function readLocalBool(key: string, def: boolean): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val === "true") return true;
    if (val === "false") return false;
    return def;
  } catch {
    return def;
  }
}

function readLocalString<T extends string>(key: string, def: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? def;
  } catch {
    return def;
  }
}

export function ImageGallery({
  open,
  file,
  sort,
  order,
  onClose,
}: ImageGalleryProps) {
  const t = useTranslations("gallery");
  const tc = useTranslations("common");
  const [images, setImages] = useState<FileItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  // Chrome that withdraws when the frame is left alone. Shared with the
  // archive's image viewer, which kept an identical copy of the timer.
  const [intervalOpen, setIntervalOpen] = useState(false);
  const chrome = useAutoHidingChrome({ enabled: open, held: intervalOpen });
  const showControls = chrome.visible;

  const [splitMode, setSplitMode] = useState(() =>
    readLocalBool("image-viewer:split-mode", false),
  );
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">(() =>
    readLocalString("image-viewer:reading-direction", "ltr"),
  );
  const [isCurrentLandscape, setIsCurrentLandscape] = useState(false);
  const [showRightHalf, setShowRightHalf] = useState(false);

  const readingDirectionRef = useRef(readingDirection);

  // Persist splitMode to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("image-viewer:split-mode", String(splitMode));
    } catch {}
    setShowRightHalf(readingDirectionRef.current === "rtl");
  }, [splitMode]);

  // Persist readingDirection to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("image-viewer:reading-direction", readingDirection);
    } catch {}
    readingDirectionRef.current = readingDirection;
    setShowRightHalf(readingDirection === "rtl");
  }, [readingDirection]);

  // Capture file info at open time to avoid re-fetching on parent re-renders
  const openFileRef = useRef(file);
  useEffect(() => {
    if (open) {
      openFileRef.current = file;
    }
  }, [open, file]);

  // Load all images in the same folder (only when gallery opens)
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const openFile = openFileRef.current;

    async function loadAllImages() {
      setLoading(true);
      setPlaying(false);

      try {
        const firstPage = await getDriveFiles(openFile.drive, {
          path: openFile.folder_path,
          type: "image",
          sort: sort as SortField,
          order: order as SortOrder,
          limit: 500,
          page: 1,
        });

        if (cancelled) return;

        let allImages = firstPage.data;

        if (firstPage.meta.total > 500) {
          const totalPages = Math.ceil(firstPage.meta.total / 500);
          for (let p = 2; p <= totalPages; p++) {
            const nextPage = await getDriveFiles(openFile.drive, {
              path: openFile.folder_path,
              type: "image",
              sort: sort as SortField,
              order: order as SortOrder,
              limit: 500,
              page: p,
            });
            if (cancelled) return;
            allImages = [...allImages, ...nextPage.data];
          }
        }

        const idx = allImages.findIndex((img) => img.id === openFile.id);
        setImages(allImages);
        setCurrentIndex(idx >= 0 ? idx : 0);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          onClose(null);
        }
      }
    }

    loadAllImages();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currentImage = images[currentIndex] ?? file;

  const {
    activeSplit,
    isFirstSubPage,
    subPageLabel,
    canGoPrev,
    canGoNext,
    navigatePrev,
    navigateNext,
  } = useSpreadPaging({
    index: currentIndex,
    setIndex: setCurrentIndex,
    count: images.length,
    splitMode,
    readingDirection,
    isCurrentLandscape,
    showRightHalf,
    setShowRightHalf,
  });

  // Close handler: notify parent of the current image
  const handleClose = useCallback(() => {
    const currentId = images[currentIndex]?.id ?? null;
    onClose(currentId);
  }, [images, currentIndex, onClose]);

  // Prefetch adjacent images
  useEffect(() => {
    if (images.length === 0) return;

    const prefetchIndices = [
      currentIndex - 1,
      currentIndex + 1,
      currentIndex - 2,
      currentIndex + 2,
    ].filter((i) => i >= 0 && i < images.length && i !== currentIndex);

    prefetchIndices.forEach((i) => {
      const img = new Image();
      img.src = getStreamUrl(images[i].id);
    });
  }, [currentIndex, images]);

  // Slideshow timer
  useEffect(() => {
    if (!playing || images.length <= 1) return;

    const timer = window.setTimeout(() => {
      setCurrentIndex((prev) => (prev >= images.length - 1 ? 0 : prev + 1));
    }, slideshowInterval * 1000);

    return () => window.clearTimeout(timer);
  }, [playing, currentIndex, slideshowInterval, images.length]);

  const t_sc = useTranslations("shortcuts");

  // Access via ref to flip keyboard left/right directions in RTL mode.
  const navigatePrevRef = useRef(navigatePrev);
  const navigateNextRef = useRef(navigateNext);
  navigatePrevRef.current = navigatePrev;
  navigateNextRef.current = navigateNext;

  useShortcuts(
    "image-gallery",
    t_sc("imageGallery"),
    [
      {
        key: "arrowleft",
        label: t_sc("prevImage"),
        handler: () =>
          readingDirectionRef.current === "ltr"
            ? navigatePrevRef.current()
            : navigateNextRef.current(),
      },
      {
        key: "arrowright",
        label: t_sc("nextImage"),
        handler: () =>
          readingDirectionRef.current === "ltr"
            ? navigateNextRef.current()
            : navigatePrevRef.current(),
      },
      {
        key: "escape",
        label: t_sc("close"),
        handler: handleClose,
      },
      {
        key: "space",
        label: t_sc("slideshow"),
        handler: () => {
          if (images.length > 1) {
            setPlaying((p) => !p);
          }
        },
      },
    ],
    open,
  );

  const gestureHandlers = useImageAreaGestures({
    readingDirection,
    navigatePrev,
    navigateNext,
    toggleControls: chrome.toggle,
  });

  const backdropRef = useInertBackdrop<HTMLDivElement>(open);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setImages([]);
      setCurrentIndex(0);
      setLoading(true);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal
      aria-label={`${t("imageGallery")}: ${currentImage.title}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      {/* Header */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-300"
        {...chrome.chromeProps}
      >
        <span className="max-w-[40%] truncate text-sm text-white/80">
          {currentImage.title}
        </span>

        {images.length > 0 && (
          <span className="text-sm text-white/60">
            {currentIndex + 1} / {images.length}
            {subPageLabel !== null ? ` ${subPageLabel}` : ""}
          </span>
        )}

        <div className="flex items-center gap-2">
          {images.length > 1 && (
            <>
              <SlideshowIntervalMenu
                value={slideshowInterval}
                onChange={setSlideshowInterval}
                frameRef={backdropRef}
                label={t("slideshowInterval")}
                closeLabel={tc("close")}
                formatSeconds={(sec) => t("seconds", { sec })}
                onOpenChange={setIntervalOpen}
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
          {splitMode && (
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
            onClick={() => setSplitMode((m) => !m)}
            className={`rounded-full p-1.5 transition-colors hover:bg-white/10 ${splitMode ? "text-white" : "text-white/60 hover:text-white"}`}
            aria-label={t("splitModeToggle")}
          >
            <BookOpen size={18} />
          </button>
          <button
            onClick={handleClose}
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
        {loading ? (
          <div className="flex w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        ) : (
          <>
            {imageLoading && (
              <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            <div
              className="flex h-full items-center justify-center"
              style={{
                width: activeSplit ? "200%" : "100%",
                flexShrink: activeSplit ? 0 : undefined,
                transform:
                  activeSplit && showRightHalf ? "translateX(-50%)" : undefined,
              }}
            >
              <img
                src={getStreamUrl(currentImage.id)}
                alt={currentImage.title}
                className="max-h-full max-w-full select-none object-contain"
                onLoad={(e) => {
                  setImageLoading(false);
                  const img = e.currentTarget;
                  setIsCurrentLandscape(img.naturalWidth > img.naturalHeight);
                }}
                onLoadStart={() => setImageLoading(true)}
                draggable={false}
              />
            </div>
          </>
        )}
      </div>

      {/* Navigation buttons */}
      {showControls &&
        !loading &&
        (readingDirection === "ltr" ? canGoPrev : canGoNext) && (
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
      {showControls &&
        !loading &&
        (readingDirection === "ltr" ? canGoNext : canGoPrev) && (
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
