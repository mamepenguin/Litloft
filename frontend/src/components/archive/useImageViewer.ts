"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { getArchiveEntryUrl } from "@/lib/api";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { ArchiveEntry } from "@/types";
import type { ArchiveViewMode } from "./archiveUtils";

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

interface ImageViewerResult {
  imageIndex: number;
  setImageIndex: React.Dispatch<React.SetStateAction<number>>;
  imageLoading: boolean;
  setImageLoading: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  slideshowInterval: number;
  setSlideshowInterval: React.Dispatch<React.SetStateAction<number>>;
  showControls: boolean;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
  handleImageAreaClick: () => void;
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

export function useImageViewer(
  viewMode: ArchiveViewMode,
  imageEntries: ArchiveEntry[],
  fileId: string,
  onClose: () => void
): ImageViewerResult {
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const [splitMode, setSplitMode] = useState(() =>
    readLocalBool("image-viewer:split-mode", false)
  );
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">(() =>
    readLocalString("image-viewer:reading-direction", "ltr")
  );
  const [isCurrentLandscape, setIsCurrentLandscape] = useState(false);
  const [showRightHalf, setShowRightHalf] = useState(false);

  // Persist splitMode to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("image-viewer:split-mode", String(splitMode));
    } catch {}
    setShowRightHalf(false);
  }, [splitMode]);

  // Persist readingDirection to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("image-viewer:reading-direction", readingDirection);
    } catch {}
    setShowRightHalf(readingDirection === "rtl");
  }, [readingDirection]);

  // Reset landscape + subpage when imageIndex changes
  useEffect(() => {
    setIsCurrentLandscape(false);
    setShowRightHalf(readingDirection === "rtl");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageIndex]);

  // Navigation with split mode awareness
  const navigateNext = useCallback(() => {
    const inActiveSplit = splitMode && isCurrentLandscape;
    const isOnFirstSubPage =
      readingDirection === "ltr" ? !showRightHalf : showRightHalf;

    if (inActiveSplit && isOnFirstSubPage) {
      setShowRightHalf(readingDirection === "ltr");
    } else {
      setImageIndex((prev) => Math.min(prev + 1, imageEntries.length - 1));
    }
  }, [
    splitMode,
    isCurrentLandscape,
    readingDirection,
    showRightHalf,
    imageEntries.length,
  ]);

  const navigatePrev = useCallback(() => {
    const inActiveSplit = splitMode && isCurrentLandscape;
    const isOnFirstSubPage =
      readingDirection === "ltr" ? !showRightHalf : showRightHalf;

    if (inActiveSplit && !isOnFirstSubPage) {
      setShowRightHalf(readingDirection === "rtl");
    } else {
      setImageIndex((prev) => Math.max(prev - 1, 0));
    }
  }, [splitMode, isCurrentLandscape, readingDirection, showRightHalf]);

  // Wrap onClose to also reset image viewer state
  const closeViewer = useCallback(() => {
    setPlaying(false);
    setShowControls(true);
    onClose();
  }, [onClose]);

  // Set loading state when image changes
  useEffect(() => {
    if (viewMode === "image") {
      setImageLoading(true);
    }
  }, [viewMode, imageIndex]);

  // Image viewer: prefetch
  useEffect(() => {
    if (viewMode !== "image" || imageEntries.length === 0) return;

    const prefetchIndices = [
      imageIndex - 1,
      imageIndex + 1,
      imageIndex - 2,
      imageIndex + 2,
    ].filter((i) => i >= 0 && i < imageEntries.length && i !== imageIndex);

    prefetchIndices.forEach((i) => {
      const img = new Image();
      img.src = getArchiveEntryUrl(fileId, imageEntries[i].path);
    });
  }, [viewMode, imageIndex, imageEntries, fileId]);

  // Image viewer: slideshow timer
  useEffect(() => {
    if (!playing || viewMode !== "image" || imageEntries.length <= 1) return;

    const timer = window.setTimeout(() => {
      setImageIndex((prev) =>
        prev >= imageEntries.length - 1 ? 0 : prev + 1
      );
    }, slideshowInterval * 1000);

    return () => window.clearTimeout(timer);
  }, [playing, imageIndex, slideshowInterval, imageEntries.length, viewMode]);

  const tsc = useTranslations("shortcuts");

  useShortcuts(
    "archive-image-viewer",
    tsc("archiveViewer"),
    [
      {
        key: "arrowleft",
        label: tsc("prevImage"),
        handler: navigatePrev,
      },
      {
        key: "arrowright",
        label: tsc("nextImage"),
        handler: navigateNext,
      },
      { key: "escape", label: tsc("close"), handler: closeViewer },
      {
        key: "space",
        label: tsc("slideshow"),
        handler: () => {
          if (imageEntries.length > 1) setPlaying((p) => !p);
        },
      },
    ],
    viewMode === "image"
  );

  // Auto-hide controls during slideshow
  useEffect(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playing && viewMode === "image") {
      hideTimerRef.current = window.setTimeout(
        () => setShowControls(false),
        3000
      );
    }
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [playing, imageIndex, viewMode]);

  const handleImageAreaClick = useCallback(() => {
    setShowControls((prev) => !prev);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playing) {
      hideTimerRef.current = window.setTimeout(
        () => setShowControls(false),
        3000
      );
    }
  }, [playing]);

  return {
    imageIndex,
    setImageIndex,
    imageLoading,
    setImageLoading,
    playing,
    setPlaying,
    slideshowInterval,
    setSlideshowInterval,
    showControls,
    setShowControls,
    handleImageAreaClick,
    splitMode,
    setSplitMode,
    readingDirection,
    setReadingDirection,
    isCurrentLandscape,
    setIsCurrentLandscape,
    showRightHalf,
    navigatePrev,
    navigateNext,
  };
}
