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
import { useViewerZoom } from "@/hooks/useViewerZoom";
import { useViewerZoomShortcuts } from "@/hooks/useViewerZoomShortcuts";
import { useInertBackdrop } from "@/hooks/useInertBackdrop";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useAutoHidingChrome } from "@/hooks/useAutoHidingChrome";
import { useSpreadPaging } from "@/hooks/useSpreadPaging";
import { useSpreadFits } from "@/hooks/useSpreadFits";
import { readSpreadMode, writeSpreadMode } from "@/lib/spreadPreference";
import type { Orientation } from "@/lib/spreadPaging";
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
  const [intervalOpen, setIntervalOpen] = useState(false);
  const chrome = useAutoHidingChrome({ enabled: open, held: intervalOpen });
  const showControls = chrome.visible;

  const [spreadMode, setSpreadMode] = useState(() => readSpreadMode());
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">(() =>
    readLocalString("image-viewer:reading-direction", "ltr"),
  );
  const [isCurrentLandscape, setIsCurrentLandscape] = useState(false);
  const [showRightHalf, setShowRightHalf] = useState(false);

  const readingDirectionRef = useRef(readingDirection);

  useEffect(() => {
    try {
      writeSpreadMode(spreadMode);
    } catch {}
    setShowRightHalf(readingDirectionRef.current === "rtl");
  }, [spreadMode]);

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

  const canPair = useSpreadFits();

  /**
   * The gallery reads shapes off the listing rather than fetching them.
   * The current page falls back to what the loaded `<img>` reported, for a
   * file scanned before those columns existed.
   */
  const orientationAt = useCallback(
    (i: number): Orientation => {
      const item = images[i];
      if (!item) return "unknown";
      if (item.image_width != null && item.image_height != null) {
        return item.image_width > item.image_height ? "landscape" : "portrait";
      }
      if (i === currentIndex) {
        return isCurrentLandscape ? "landscape" : "unknown";
      }
      return "unknown";
    },
    [images, currentIndex, isCurrentLandscape],
  );

  const {
    face,
    faceLabel,
    activeSplit,
    subPageLabel,
    canGoPrev,
    canGoNext,
    navigatePrev,
    navigateNext,
  } = useSpreadPaging({
    index: currentIndex,
    setIndex: setCurrentIndex,
    count: images.length,
    spreadMode,
    readingDirection,
    showRightHalf,
    orientationAt,
    canPair,
    setShowRightHalf,
  });

  const handleClose = useCallback(() => {
    const currentId = images[currentIndex]?.id ?? null;
    onClose(currentId);
  }, [images, currentIndex, onClose]);

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

  useEffect(() => {
    if (!playing || images.length <= 1) return;

    const timer = window.setTimeout(() => {
      // A face at a time, not an index at a time: two pages showing side
      // by side are one thing to look at, and a split page is two.
      if (canGoNext) {
        navigateNext();
      } else {
        setCurrentIndex(0);
        setShowRightHalf(readingDirection === "rtl");
      }
    }, slideshowInterval * 1000);

    return () => window.clearTimeout(timer);
  }, [
    playing,
    currentIndex,
    slideshowInterval,
    images.length,
    canGoNext,
    navigateNext,
    readingDirection,
  ]);

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

  const zoom = useViewerZoom({
    resetKey: `${currentIndex}:${showRightHalf}`,
    readingDirection,
    navigatePrev,
    navigateNext,
    toggleControls: chrome.toggle,
  });
  useViewerZoomShortcuts(zoom, open);

  const backdropRef = useInertBackdrop<HTMLDivElement>(open);

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
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-300"
        {...chrome.chromeProps}
      >
        <span className="max-w-[40%] truncate text-sm text-white/80">
          {currentImage.title}
        </span>

        {images.length > 0 && (
          <span className="text-sm text-white/60">
            {faceLabel} / {images.length}
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
          <button
            onClick={handleClose}
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
              ref={zoom.contentRef}
              className="flex h-full w-full items-center"
              style={zoom.contentStyle}
            >
              <div
                data-face={face.kind}
                className="flex h-full items-center justify-center"
                style={{
                  // Splitting draws one page at twice the frame's width and
                  // slides it; pairing draws two inside one frame's width.
                  // Same word, opposite arithmetic.
                  width: activeSplit ? "200%" : "100%",
                  flexShrink: activeSplit ? 0 : undefined,
                  transform:
                    activeSplit && showRightHalf
                      ? "translateX(-50%)"
                      : undefined,
                  // Right-to-left reading puts the first page of a pair on
                  // the right. Done with `flex-direction`, so the two
                  // `<img>` elements stay in reading order in the DOM.
                  flexDirection:
                    face.kind === "pair" && readingDirection === "rtl"
                      ? "row-reverse"
                      : "row",
                }}
              >
                {face.indices.map((i, slot) => {
                  const item = images[i];
                  if (!item) return null;
                  return (
                    <img
                      key={item.id}
                      src={getStreamUrl(item.id)}
                      alt={item.title}
                      className="max-h-full select-none object-contain"
                      style={{
                        maxWidth: face.kind === "pair" ? "50%" : "100%",
                      }}
                      onLoad={(e) => {
                        setImageLoading(false);
                        // Only the page the position is named by decides
                        // whether this face is a split one; the second page
                        // of a pair reporting its shape here would flip the
                        // face out from under itself.
                        if (slot === 0 && i === currentIndex) {
                          const img = e.currentTarget;
                          setIsCurrentLandscape(
                            img.naturalWidth > img.naturalHeight,
                          );
                        }
                      }}
                      onLoadStart={() => setImageLoading(true)}
                      draggable={false}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

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
