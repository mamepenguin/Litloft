"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { getArchiveEntryUrl } from "@/lib/api";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { ArchiveEntry } from "@/types";
import {
  useAutoHidingChrome,
  type AutoHidingChrome,
} from "@/hooks/useAutoHidingChrome";
import { useSpreadPaging } from "@/hooks/useSpreadPaging";
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
  /** Bring the chrome back — used when the viewer changes what it shows. */
  showChrome: () => void;
  /** Hold it open while a panel over the frame is up. */
  setChromeHeld: React.Dispatch<React.SetStateAction<boolean>>;
  handleImageAreaClick: () => void;
  chromeProps: AutoHidingChrome["chromeProps"];
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
  onClose: () => void,
): ImageViewerResult {
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  // Chrome that withdraws when the frame is left alone, on the same
  // terms as the image gallery's — the two used to keep separate copies
  // of the same timer, both gated on slideshow playback.
  const [chromeHeld, setChromeHeld] = useState(false);
  const chrome = useAutoHidingChrome({
    enabled: viewMode === "image",
    held: chromeHeld,
  });

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

  const paging = useSpreadPaging({
    index: imageIndex,
    setIndex: setImageIndex,
    count: imageEntries.length,
    splitMode,
    readingDirection,
    isCurrentLandscape,
    showRightHalf,
    setShowRightHalf,
  });
  const { navigatePrev, navigateNext } = paging;

  // Wrap onClose to also reset image viewer state
  const closeViewer = useCallback(() => {
    setPlaying(false);
    chrome.show();
    onClose();
  }, [chrome, onClose]);

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
      setImageIndex((prev) => (prev >= imageEntries.length - 1 ? 0 : prev + 1));
    }, slideshowInterval * 1000);

    return () => window.clearTimeout(timer);
  }, [playing, imageIndex, slideshowInterval, imageEntries.length, viewMode]);

  const tsc = useTranslations("shortcuts");

  // バグ2: RTLモードでキーボードの左右を方向に応じて切り替えるためref経由でアクセス
  const navigatePrevRef = useRef<() => void>(() => {});
  const navigateNextRef = useRef<() => void>(() => {});
  navigatePrevRef.current = navigatePrev;
  navigateNextRef.current = navigateNext;

  useShortcuts(
    "archive-image-viewer",
    tsc("archiveViewer"),
    [
      {
        key: "arrowleft",
        label: tsc("prevImage"),
        handler: () =>
          readingDirectionRef.current === "ltr"
            ? navigatePrevRef.current()
            : navigateNextRef.current(),
      },
      {
        key: "arrowright",
        label: tsc("nextImage"),
        handler: () =>
          readingDirectionRef.current === "ltr"
            ? navigateNextRef.current()
            : navigatePrevRef.current(),
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
    viewMode === "image",
  );

  return {
    imageIndex,
    setImageIndex,
    imageLoading,
    setImageLoading,
    playing,
    setPlaying,
    slideshowInterval,
    setSlideshowInterval,
    showControls: chrome.visible,
    showChrome: chrome.show,
    setChromeHeld,
    handleImageAreaClick: chrome.toggle,
    chromeProps: chrome.chromeProps,
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
